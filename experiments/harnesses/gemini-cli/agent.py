"""Generic scenario runner for gemini-cli — dispatches by scenario kind.

Drives `node bundle/gemini.js --output-format stream-json` and parses
its JSONL event stream. Server endpoint, alias, and the auth token
come from the scenario YAML via `setup_run`. Pass criteria live in
`_common/evaluators/`.

SECURITY -- do not point at untrusted repos / endpoints (see
fast-agent/agent.py).

Pre-reqs:
- Built bundle at $GEMINI_CLI_ROOT/bundle/gemini.js (clone the fork
  branch experimental/skills-over-mcp, then `npm install && npm run build`).
- `node` on PATH.
- GEMINI_API_KEY.
- pr-review: GITHUB_TOKEN (or `gh auth token`).
- plan:      HF_TOKEN.
- The MCP server the scenario points at, running on its declared port.

Usage:
    cd experiments/harnesses/gemini-cli
    GITHUB_TOKEN=$(gh auth token) GEMINI_API_KEY=... \\
        uv run agent.py ../../scenarios/pr-review.yaml
    HF_TOKEN=hf_xxx GEMINI_API_KEY=... \\
        uv run agent.py ../../scenarios/hf-jobs-plan.yaml
"""

# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6.0", "psutil>=5.9"]
# ///

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import psutil

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import (  # noqa: E402
    evaluate,
    load_scenario,
    parse_scenario_arg,
    report_and_save,
    setup_run,
)


_DEFAULT_TIMEOUT_S = 240


def _resolve_bundle_path() -> Path:
    root_env = os.environ.get("GEMINI_CLI_ROOT")
    if not root_env:
        sys.exit(
            "GEMINI_CLI_ROOT is required. Clone the fork branch and build:\n"
            "  git clone --branch experimental/skills-over-mcp "
            "https://github.com/olaservo/gemini-cli.git <path>\n"
            "  (cd <path> && npm install && npm run build)\n"
            "  export GEMINI_CLI_ROOT=<path>"
        )
    bundle = Path(root_env).resolve() / "bundle" / "gemini.js"
    if not bundle.exists():
        sys.exit(f"gemini-cli bundle not built at {bundle} -- run `npm install && npm run build` first.")
    return bundle


def _write_gemini_settings(home: Path, *, alias: str, endpoint: str, token: str) -> None:
    """Write `.gemini/settings.json` registering the MCP server with
    Bearer auth. GEMINI_CLI_HOME directs gemini-cli to this temp dir.
    """
    gemini_dir = home / ".gemini"
    gemini_dir.mkdir(parents=True, exist_ok=True)
    (gemini_dir / "settings.json").write_text(
        json.dumps({
            "mcpServers": {
                alias: {
                    "httpUrl": endpoint,
                    "headers": {"Authorization": f"Bearer {token}"},
                },
            },
        }, indent=2),
        encoding="utf-8",
    )


def _extract_tool_calls(events: list[dict], *, alias: str) -> tuple[list[tuple[str, dict]], str]:
    """Walk gemini-cli's JSONL events.

    Schema:
        {"type":"tool_use","tool_name":"<name>","parameters":{...}}
        {"type":"message","role":"assistant","content":"<text>"}

    gemini-cli prefixes MCP tools as `mcp_<server_id>_<tool>` (see
    packages/core/src/tools/mcp-tool.ts); strip for evaluator matching.
    Built-ins (read_mcp_resource, activate_skill, activate-skill) have
    no prefix.
    """
    calls: list[tuple[str, dict]] = []
    response_text = ""
    prefix = f"mcp_{alias}_"
    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        if etype == "tool_use":
            name = event.get("tool_name")
            if not isinstance(name, str):
                continue
            params = event.get("parameters") if isinstance(event.get("parameters"), dict) else {}
            calls.append((name.removeprefix(prefix), params))
        elif (
            etype == "message"
            and event.get("role") == "assistant"
            and isinstance(event.get("content"), str)
        ):
            response_text += event["content"]
    return calls, response_text


def _run_gemini(cmd: list[str], env: dict[str, str], timeout_s: float, cwd: str | None = None):
    events: list[dict] = []
    proc = subprocess.Popen(
        cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, cwd=cwd, text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    assert proc.stdout is not None
    timed_out = {"fired": False}

    def _kill_on_timeout() -> None:
        timed_out["fired"] = True
        try:
            parent = psutil.Process(proc.pid)
            for child in parent.children(recursive=True):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            parent.kill()
        except psutil.NoSuchProcess:
            pass
        except Exception as exc:
            print(f"!! kill_on_timeout failed: {exc}", file=sys.stderr)

    timer = threading.Timer(timeout_s, _kill_on_timeout)
    timer.start()
    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                print(f"[non-JSON gemini stdout] {line}", file=sys.stderr)
                continue
            events.append(event)
            etype = event.get("type") if isinstance(event, dict) else None
            if etype == "tool_use":
                print(
                    f"  >> {event.get('tool_name')}  "
                    f"args={json.dumps(event.get('parameters') or {}, default=str)[:120]}",
                    file=sys.stderr,
                )
            elif etype == "message" and event.get("role") == "assistant":
                preview = (event.get("content") or "")[:120]
                if preview.strip():
                    print(f"  >> agent: {preview}...", file=sys.stderr)
    finally:
        timer.cancel()
        proc.wait()
    stderr_tail = (proc.stderr.read() if proc.stderr else "") or ""
    if stderr_tail.strip():
        print("--- gemini stderr ---", file=sys.stderr)
        print(stderr_tail, file=sys.stderr)
    if timed_out["fired"]:
        print(f"\n!! TIMED OUT after {timeout_s:.0f}s", file=sys.stderr)
    return events, proc.returncode, timed_out["fired"]


def main() -> int:
    node = shutil.which("node")
    if node is None:
        sys.exit("`node` not found on PATH. Install Node.js and re-run.")
    bundle = _resolve_bundle_path()

    scenario_path = parse_scenario_arg(sys.argv)
    scenario = load_scenario(scenario_path)

    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("GEMINI_API_KEY is required")
    ctx = setup_run(scenario)
    model = os.environ.get("GEMINI_MODEL") or scenario.get("models", {}).get("gemini-cli")
    prompt = ctx["prompt"]
    alias = ctx["server_alias"]

    print(f"Scenario: {scenario_path}")
    print(f"Kind:    {ctx['kind']}")
    if ctx["kind"] == "pr-review":
        print(f"Target:  {ctx['repo']} PR #{ctx['pr_number']}")
    print(f"Model:   {model or '(gemini-cli default)'}")
    print(f"Server:  {alias} -> {ctx['server_endpoint']}")
    print(f"Bundle:  {bundle}")
    print(f"Prompt:  {prompt}")
    print()

    timeout_s = float(os.environ.get("GEMINI_TIMEOUT_S") or _DEFAULT_TIMEOUT_S)
    error: str | None = None
    events: list[dict] = []
    rc = -1
    timed_out = False
    elapsed = 0.0

    with tempfile.TemporaryDirectory(prefix="skills-e2e-gemini-", ignore_cleanup_errors=True) as tmp:
        home = Path(tmp)
        _write_gemini_settings(home, alias=alias, endpoint=ctx["server_endpoint"], token=ctx["token"])
        env = {
            **os.environ,
            ctx["token_env_var"]: ctx["token"],
            "GEMINI_CLI_HOME": str(home),
        }
        cmd = [
            node, str(bundle),
            "--prompt", prompt,
            "--output-format", "stream-json",
            # yolo auto-approves tool calls; manual approval would hang
            # the subprocess since we run non-interactively.
            "--approval-mode", "yolo",
            "--allowed-mcp-server-names", alias,
        ]
        if model:
            cmd.extend(["--model", model])

        start = time.monotonic()
        try:
            # Hermetic CWD: any `write_file` lands in `home` (the temp
            # dir already used for .gemini/settings.json) and is
            # discarded when the harness exits.
            events, rc, timed_out = _run_gemini(cmd, env, timeout_s, cwd=str(home))
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            print(f"\n[gemini subprocess failed] {error}", file=sys.stderr)
        elapsed = time.monotonic() - start

    if timed_out:
        error = error or f"timeout after {timeout_s:.0f}s"
    elif rc != 0 and not error:
        print(f"\n[gemini-cli exited non-zero: {rc}]", file=sys.stderr)
        error = f"gemini exit code {rc}"

    calls, final_text = _extract_tool_calls(events, alias=alias)
    result = evaluate(scenario, calls, client_id="gemini-cli", final_text=final_text)
    report_and_save(
        client="gemini-cli", scenario=scenario, ctx=ctx, model=model,
        calls=calls, result=result, final_text=final_text,
        elapsed_s=elapsed, timed_out=timed_out, error=error,
    )
    return 0 if result["overall"] else 1


if __name__ == "__main__":
    sys.exit(main())
