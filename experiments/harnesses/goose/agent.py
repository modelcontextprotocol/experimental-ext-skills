"""Generic scenario runner for goose — dispatches by scenario kind.

Drives `goose run --output-format stream-json` and parses its JSONL
StreamEvent stream. Server endpoint, alias, and the auth token come
from the scenario YAML via `setup_run`. Pass criteria live in
`_common/evaluators/`.

SECURITY -- do not point at untrusted repos / endpoints (see
fast-agent/agent.py).

Pre-reqs:
- `goose` from the fork branch: `cargo install --git
  https://github.com/olaservo/goose.git --branch mcp-skills-sep
  --no-default-features --features rustls-tls --locked goose-cli`.
  Or set GOOSE_BIN=/abs/path/goose[.exe].
- ANTHROPIC_API_KEY (or whichever provider GOOSE_PROVIDER picks).
- pr-review: GITHUB_TOKEN (or `gh auth token`).
- plan:      HF_TOKEN.
- The MCP server the scenario points at, running on its declared port.

Usage:
    cd experiments/harnesses/goose
    GITHUB_TOKEN=$(gh auth token) ANTHROPIC_API_KEY=... \\
        uv run agent.py ../../scenarios/pr-review.yaml
    HF_TOKEN=hf_xxx ANTHROPIC_API_KEY=... \\
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
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import (  # noqa: E402
    evaluate,
    load_scenario,
    parse_scenario_arg,
    report_and_save,
    setup_run,
)


# 600s accommodates sonnet working through 6+ inline PR comments; at
# 240s it often gets killed mid-commenting on dense reviews. Override
# per run with GOOSE_TIMEOUT_S=<seconds>.
_DEFAULT_TIMEOUT_S = 600
_DEFAULT_PROVIDER = "anthropic"


def _resolve_goose_command() -> list[str]:
    explicit = os.environ.get("GOOSE_BIN")
    if explicit:
        path = Path(explicit)
        if not path.exists():
            sys.exit(f"GOOSE_BIN points at a path that does not exist: {path}")
        resolved = str(path)
    else:
        resolved = shutil.which("goose")
        if resolved is None:
            sys.exit(
                "`goose` not found on PATH and GOOSE_BIN not set. See the "
                "module docstring for the fork install command."
            )
    if os.name == "nt" and resolved.lower().endswith((".cmd", ".bat")):
        return ["cmd", "/c", resolved]
    return [resolved]


def _write_goose_config(
    goose_path_root: Path, *, alias: str, endpoint: str, token: str,
) -> None:
    """Write a config.yaml with the MCP extension pre-registered.

    `--with-streamable-http-extension` doesn't accept headers, so the
    Bearer auth has to go in a config file. GOOSE_PATH_ROOT redirects
    goose's config dirs to a hermetic temp.
    """
    config_dir = goose_path_root / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    config = {
        "extensions": {
            alias: {
                "type": "streamable_http",
                "name": alias,
                "description": f"MCP server registered for skills-over-mcp scenario ({alias})",
                "uri": endpoint,
                "headers": {"Authorization": f"Bearer {token}"},
                "timeout": 60,
                "enabled": True,
            },
        },
    }
    (config_dir / "config.yaml").write_text(
        yaml.safe_dump(config, sort_keys=False), encoding="utf-8"
    )


def _extract_tool_calls(events: list[dict], *, alias: str) -> tuple[list[tuple[str, dict]], str | None]:
    """Walk goose's JSONL stream.

    Schema: {"type":"message","message":{"role":"assistant","content":[
        {"type":"text","text":"..."},
        {"type":"toolRequest","toolCall":{"status":"success",
            "value":{"name":"X","arguments":{...}}}},
    ]}}

    Goose prefixes MCP tools with `<server>__`; strip so the evaluator
    matches bare names. Built-ins (read_mcp_resource, load_skill) have
    no prefix.
    """
    calls: list[tuple[str, dict]] = []
    final_text: str | None = None
    prefix = f"{alias}__"
    for event in events:
        if event.get("type") != "message":
            continue
        msg = event.get("message") or {}
        role = msg.get("role")
        for item in (msg.get("content") or []):
            it_type = item.get("type")
            if it_type == "toolRequest":
                tc = item.get("toolCall") or {}
                if tc.get("status") != "success":
                    continue
                value = tc.get("value") or {}
                name = (value.get("name") or "").removeprefix(prefix)
                args = value.get("arguments") or {}
                if not isinstance(args, dict):
                    args = {}
                calls.append((name, args))
            elif it_type == "text" and role == "assistant":
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    final_text = text
    return calls, final_text


def _run_goose(cmd: list[str], env: dict[str, str], timeout_s: float, cwd: str | None = None):
    """Stream JSONL from goose stdout, echoing to stderr. Returns
    (events, exit_code, timed_out).
    """
    events: list[dict] = []
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=cwd,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    assert proc.stdout is not None
    timed_out = {"fired": False}

    def _kill_on_timeout() -> None:
        # Process-tree kill: Windows TerminateProcess leaves children
        # holding the stdout pipe open, so the reader never sees EOF.
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
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                print(f"[non-JSON goose stdout] {line}", file=sys.stderr)
                continue
            events.append(event)
            etype = event.get("type", "?")
            if etype == "message":
                msg = event.get("message") or {}
                for item in (msg.get("content") or []):
                    it_type = item.get("type")
                    if it_type == "toolRequest":
                        tc = item.get("toolCall") or {}
                        value = tc.get("value") or {}
                        print(f"  >> {value.get('name')}  status={tc.get('status')}", file=sys.stderr)
                    elif it_type == "text" and msg.get("role") == "assistant":
                        preview = (item.get("text") or "")[:120]
                        if preview.strip():
                            print(f"  >> agent: {preview}...", file=sys.stderr)
            elif etype == "error":
                print(f"  !! error: {event.get('error')}", file=sys.stderr)
    finally:
        timer.cancel()
        proc.wait()
    stderr_tail = (proc.stderr.read() if proc.stderr else "") or ""
    if stderr_tail.strip():
        print("--- goose stderr ---", file=sys.stderr)
        print(stderr_tail, file=sys.stderr)
    if timed_out["fired"]:
        print(f"\n!! TIMED OUT after {timeout_s:.0f}s", file=sys.stderr)
    return events, proc.returncode, timed_out["fired"]


def main() -> int:
    goose_prefix = _resolve_goose_command()
    scenario_path = parse_scenario_arg(sys.argv)
    scenario = load_scenario(scenario_path)
    ctx = setup_run(scenario)

    model = (
        os.environ.get("GOOSE_MODEL")
        or os.environ.get("GOOSE_E2E_MODEL")
        or scenario.get("models", {}).get("goose")
    )
    if not model:
        sys.exit(
            "No goose model. Scenario YAML should carry `models.goose: <id>`; "
            "override with GOOSE_MODEL=<id>."
        )
    provider = os.environ.get("GOOSE_PROVIDER") or _DEFAULT_PROVIDER
    prompt = ctx["prompt"]
    alias = ctx["server_alias"]

    print(f"Scenario: {scenario_path}")
    print(f"Kind:    {ctx['kind']}")
    if ctx["kind"] == "pr-review":
        print(f"Target:  {ctx['repo']} PR #{ctx['pr_number']}")
    print(f"Provider/Model:  {provider} / {model}")
    print(f"Server:  {alias} -> {ctx['server_endpoint']}")
    print(f"Prompt:  {prompt}")
    print()

    timeout_s = float(os.environ.get("GOOSE_TIMEOUT_S") or _DEFAULT_TIMEOUT_S)
    error: str | None = None
    events: list[dict] = []
    rc = -1
    timed_out = False
    elapsed = 0.0

    with tempfile.TemporaryDirectory(prefix="skills-e2e-goose-", ignore_cleanup_errors=True) as tmp:
        goose_path_root = Path(tmp)
        _write_goose_config(
            goose_path_root, alias=alias, endpoint=ctx["server_endpoint"], token=ctx["token"],
        )
        env = {
            **os.environ,
            ctx["token_env_var"]: ctx["token"],
            "GOOSE_PATH_ROOT": str(goose_path_root),
            "GOOSE_DISABLE_KEYRING": "1",
        }
        cmd = [
            *goose_prefix, "run",
            "--text", prompt,
            "--output-format", "stream-json",
            "--no-session",
            "--provider", provider,
            "--model", model,
            "-q",
        ]
        start = time.monotonic()
        try:
            # Hermetic CWD: any `write` / shell-curl-output lands in
            # goose_path_root (already used for goose's config dir) and
            # is discarded when the harness exits.
            events, rc, timed_out = _run_goose(cmd, env, timeout_s, cwd=str(goose_path_root))
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            print(f"\n[goose subprocess failed] {error}", file=sys.stderr)
        elapsed = time.monotonic() - start

    if timed_out:
        error = error or f"timeout after {timeout_s:.0f}s"
    elif rc != 0 and not error:
        print(f"\n[goose run exited non-zero: {rc}]", file=sys.stderr)
        error = f"goose exit code {rc}"

    calls, final_text = _extract_tool_calls(events, alias=alias)
    result = evaluate(scenario, calls, client_id="goose", final_text=final_text)
    report_and_save(
        client="goose", scenario=scenario, ctx=ctx, model=model,
        calls=calls, result=result, final_text=final_text,
        elapsed_s=elapsed, timed_out=timed_out, error=error,
    )
    return 0 if result["overall"] else 1


if __name__ == "__main__":
    sys.exit(main())
