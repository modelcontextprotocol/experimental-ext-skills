#!/usr/bin/env python3
"""Run one SEP-2640 scenario against the goose CLI and a running server.

Records discoverability (wire-level skills/list probe + whether the model
enumerated the skills from its instructions) and usage (tool calls, skills
loaded, resources read), then applies the scenario's `expect` checks.
See README.md for the scenario format.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

import yaml

SKILLS_EXTENSION_ID = "io.modelcontextprotocol/skills"


def rpc(endpoint, token, method, params, req_id):
    """POST one JSON-RPC request; tolerate plain-JSON or SSE-framed replies."""
    body = json.dumps(
        {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
    ).encode()
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {token}",
        },
    )
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    for line in raw.splitlines():
        if line.startswith("data: "):
            raw = line[len("data: "):]
            break
    return json.loads(raw)


def probe_server(endpoint, token):
    """Wire-level discoverability: capability declaration + skills/list names."""
    init = rpc(endpoint, token, "initialize", {
        "protocolVersion": "2026-07-28",
        "capabilities": {},
        "clientInfo": {"name": "sep2640-harness", "version": "0"},
    }, 1)
    extensions = init["result"]["capabilities"].get("extensions", {}) or {}
    declared = SKILLS_EXTENSION_ID in extensions

    skills, result_types = [], []
    if declared:
        cursor, page = None, 0
        while page < 16:
            page += 1
            params = {"cursor": cursor} if cursor else {}
            result = rpc(endpoint, token, "skills/list", params, 1 + page)["result"]
            result_types.append(result.get("resultType"))
            skills.extend(result.get("skills", []))
            cursor = result.get("nextCursor")
            if not cursor:
                break

    def describe(s):
        res = s.get("resources")
        return {
            "name": (s.get("frontmatter") or {}).get("name"),
            "uri": s.get("uri"),
            # "dynamic" marker, file count for a manifest, None if absent (invalid per SEP).
            "resources": res if isinstance(res, str) else (len(res) if isinstance(res, list) else None),
            # every manifest element carries an integer size (SEP baseline b405ba5)
            "sized": all(isinstance(r.get("size"), int) for r in res) if isinstance(res, list) else None,
        }

    return {
        "extension_declared": declared,
        "extension_settings": extensions.get(SKILLS_EXTENSION_ID),
        "protocol_version": init["result"].get("protocolVersion"),
        "result_type": result_types[0] if result_types else None,
        "skills": [describe(s) for s in skills],
    }


def write_goose_config(root, scenario, token):
    provider = scenario.get("provider", "anthropic")
    model = scenario.get("model", "claude-sonnet-4-6")
    endpoint = scenario["mcp_server"]["endpoint"]
    config = {
        "providers": {provider: {"enabled": True, "model": model, "configured": True}},
        "active_provider": provider,
        "extensions": {
            "skills": {
                "enabled": True,
                "type": "platform",
                "name": "skills",
                "description": "",
            },
            "scenario_server": {
                "enabled": True,
                "skills_enabled": True,
                "type": "streamable_http",
                "name": "scenario_server",
                "uri": endpoint,
                "description": "scenario MCP server",
                "timeout": 300,
                "headers": {"Authorization": f"Bearer {token}"},
            },
        },
    }
    config_dir = os.path.join(root, "config")
    os.makedirs(config_dir)
    with open(os.path.join(config_dir, "config.yaml"), "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f)


TOOL_LINE = re.compile(r"^\s*[▸>]\s+(\S+)\s*$")
ARG_LINE = re.compile(r"^\s{2,}(\w+): (.*)$")


def parse_tool_calls(output):
    """Extract (tool, {arg: value}) pairs from goose CLI output."""
    calls = []
    current = None
    for line in output.splitlines():
        m = TOOL_LINE.match(line)
        if m:
            current = (m.group(1), {})
            calls.append(current)
            continue
        if current is not None:
            m = ARG_LINE.match(line)
            if m:
                current[1][m.group(1)] = m.group(2).strip()
            else:
                current = None
    return calls


def tool_results(root):
    """Map tool_use id -> (tool name, result text) from goose's LLM request log.

    The CLI transcript shows only the call and its args; the request log holds
    the tool_result blocks the model actually received.
    """
    log_dir = os.path.join(root, "state", "logs")
    names, results = {}, {}
    for fn in sorted(os.listdir(log_dir)) if os.path.isdir(log_dir) else []:
        if not fn.startswith("llm_request."):
            continue
        with open(os.path.join(log_dir, fn), encoding="utf-8") as f:
            for line in f:
                try:
                    req = json.loads(line)
                except ValueError:
                    continue
                for msg in req.get("input", req).get("messages", []):
                    content = msg.get("content")
                    if not isinstance(content, list):
                        continue
                    for block in content:
                        if block.get("type") == "tool_use":
                            names[block["id"]] = block["name"]
                        elif block.get("type") == "tool_result":
                            c = block.get("content")
                            if isinstance(c, list):
                                c = "".join(b.get("text", "") for b in c)
                            results[block["tool_use_id"]] = c or ""
    return {tid: (names.get(tid), text) for tid, text in results.items()}


def run_goose(goose_bin, scenario, root, workdir):
    env = dict(os.environ, GOOSE_PATH_ROOT=root)
    proc = subprocess.run(
        [goose_bin, "run", "-t", scenario["prompt"]],
        cwd=workdir,
        env=env,
        capture_output=True,
        timeout=600,
    )
    return (proc.stdout + proc.stderr).decode("utf-8", "replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--goose", default=os.environ.get("GOOSE_BIN", "goose"))
    args = ap.parse_args()

    with open(args.scenario, encoding="utf-8") as f:
        scenario = yaml.safe_load(f)
    expect = scenario.get("expect", {}) or {}

    bearer_cmd = scenario["mcp_server"].get("bearer_cmd", "gh auth token")
    token = subprocess.run(
        bearer_cmd, shell=True, capture_output=True, text=True, check=True
    ).stdout.strip()

    server = probe_server(scenario["mcp_server"]["endpoint"], token)
    wire_names = [s["name"] for s in server["skills"]]

    root = tempfile.mkdtemp(prefix="goose-scenario-")
    workdir = os.path.join(root, "wd")
    os.makedirs(workdir)
    write_goose_config(root, scenario, token)
    print(f"goose config root (contains bearer token): {root}")

    output = run_goose(args.goose, scenario, root, workdir)

    calls = parse_tool_calls(output)
    tools_used = sorted({name for name, _ in calls})
    load_calls = [a["name"] for n, a in calls if n == "load_skill" and "name" in a]
    load_results = [
        text for tid, (name, text) in tool_results(root).items() if name == "load_skill"
    ]
    # A load only counts when goose returned framed skill content, not an error.
    skills_loaded = [
        n for n, text in zip(load_calls, load_results) if text.startswith("# Loaded Skill:")
    ]
    load_failures = [
        (n, text[:200]) for n, text in zip(load_calls, load_results)
        if not text.startswith("# Loaded Skill:")
    ]
    resources_read = [a["uri"] for n, a in calls if n == "read_resource" and "uri" in a]

    checks = []

    def check(name, passed, detail):
        checks.append({"check": name, "pass": bool(passed), "detail": detail})

    if "extension_declared" in expect:
        check("extension_declared",
              server["extension_declared"] == expect["extension_declared"],
              server["extension_settings"])
    if "resources_sized" in expect:
        manifests = [s for s in server["skills"] if isinstance(s["resources"], int)]
        check("resources_sized",
              bool(manifests) and all(s["sized"] for s in manifests) == expect["resources_sized"],
              {"manifest_entries": len(manifests), "unsized": [s["name"] for s in manifests if not s["sized"]]})
    for name in expect.get("discovered", []):
        check(f"discovered on wire: {name}", name in wire_names, wire_names)
        check(f"enumerated by model: {name}", name in output, "searched reply text")
    for name in expect.get("loaded", []):
        check(f"loaded: {name}", name in skills_loaded,
              {"loaded": skills_loaded, "failed": load_failures})
    for name in expect.get("tools", []):
        check(f"tool used: {name}", name in tools_used, tools_used)

    result = {
        "scenario": scenario["name"],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "endpoint": scenario["mcp_server"]["endpoint"],
        "server": server,
        "run": {
            "tools_used": tools_used,
            "tool_calls": [{"tool": n, "args": a} for n, a in calls],
            "load_skill_calls": load_calls,
            "skills_loaded": skills_loaded,
            "load_failures": load_failures,
            "resources_read": resources_read,
            "output_tail": output[-2000:],
        },
        "checks": checks,
        "passed": all(c["pass"] for c in checks),
    }

    results_dir = os.path.join(os.path.dirname(os.path.abspath(args.scenario)), "..", "results")
    os.makedirs(results_dir, exist_ok=True)
    out_path = os.path.join(
        results_dir, f"{scenario['name']}.{time.strftime('%Y%m%d-%H%M%S')}.json"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    for c in checks:
        print(f"[{'PASS' if c['pass'] else 'FAIL'}] {c['check']}")
    print(f"tools used: {tools_used}")
    print(f"skills loaded: {skills_loaded}")
    print(f"result: {out_path}")
    sys.exit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
