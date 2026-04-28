"""Generic scenario runner for codex — dispatches by scenario kind.

Drives `codex exec --json` and parses its JSONL event stream. Server
endpoint, alias, and the auth-token env-var name come from the
scenario YAML via `setup_run`. Pass criteria live in
`_common/evaluators/`.

SECURITY -- do not point at untrusted repos / endpoints (see
fast-agent/agent.py).

Pre-reqs:
- `codex` from the fork branch: `cargo install --git
  https://github.com/olaservo/codex.git --branch skills-over-mcp
  --locked codex-cli`. Upstream npm `@openai/codex` lacks the fork
  changes and will silently misbehave. Or set CODEX_BIN=/abs/path/codex.exe.
- pr-review: GITHUB_TOKEN (or `gh auth token`).
- plan:      HF_TOKEN.
- OPENAI_API_KEY (mirrored to CODEX_API_KEY to force API-key auth
  over any cached ChatGPT session). Easiest:
  `uv run --env-file <.env> agent.py ...`.
- The MCP server the scenario points at, running on its declared port.

Usage:
    cd experiments/harnesses/codex
    GITHUB_TOKEN=$(gh auth token) \\
        uv run --env-file /path/to/.env agent.py ../../scenarios/pr-review.yaml
    HF_TOKEN=hf_xxx \\
        uv run --env-file /path/to/.env agent.py ../../scenarios/hf-jobs-plan.yaml
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


# 600s matches what gpt-5.1-codex needs on the default 200K-TPM OpenAI
# tier; smaller tiers routinely exceed 180s. Override per run with
# CODEX_TIMEOUT_S=<seconds>.
_DEFAULT_TIMEOUT_S = 600


def _resolve_codex_command() -> list[str]:
    explicit = os.environ.get("CODEX_BIN")
    if explicit:
        path = Path(explicit)
        if not path.exists():
            sys.exit(f"CODEX_BIN points at a path that does not exist: {path}")
        resolved = str(path)
    else:
        resolved = shutil.which("codex")
        if resolved is None:
            sys.exit(
                "`codex` not found on PATH and CODEX_BIN not set. See the "
                "module docstring for the fork install command."
            )
    # Windows npm shims ship as `.cmd`; CreateProcess can't exec them.
    if os.name == "nt" and resolved.lower().endswith((".cmd", ".bat")):
        return ["cmd", "/c", resolved]
    return [resolved]


def _extract_tool_calls(events: list[dict]) -> tuple[list[tuple[str, dict]], str | None]:
    """Walk codex's JSONL events.

    codex's `read_mcp_resource` is a built-in but emits through the
    same pipeline as MCP dispatches, so it arrives as `mcp_tool_call`
    with tool="read_mcp_resource" — no special-casing needed.
    Schema: codex-rs/exec/src/exec_events.rs.
    """
    calls: list[tuple[str, dict]] = []
    final_text: str | None = None
    for event in events:
        if event.get("type") != "item.completed":
            continue
        item = event.get("item") or {}
        it_type = item.get("type")
        if it_type == "mcp_tool_call":
            name = item.get("tool") or ""
            args = item.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            if not isinstance(args, dict):
                args = {}
            calls.append((name, args))
        elif it_type == "agent_message":
            text = item.get("text")
            if isinstance(text, str):
                final_text = text
    return calls, final_text


def _run_codex(cmd: list[str], env: dict[str, str], timeout_s: float, cwd: str | None = None):
    """Stream JSONL from codex stdout, echoing to stderr. Returns
    (events, exit_code, timed_out).
    """
    events: list[dict] = []
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=cwd,
        # UTF-8 forced — Windows cp1252 crashes on curly quotes / em-dashes.
        text=True, encoding="utf-8", errors="replace", bufsize=1,
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
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                print(f"[non-JSON codex stdout] {line}", file=sys.stderr)
                continue
            events.append(event)
            etype = event.get("type", "?")
            if etype == "item.completed":
                item = event.get("item") or {}
                it_type = item.get("type", "?")
                if it_type == "mcp_tool_call":
                    print(
                        f"  >> {item.get('tool')}  server={item.get('server')}  "
                        f"status={item.get('status')}",
                        file=sys.stderr,
                    )
                elif it_type == "agent_message":
                    preview = (item.get("text") or "")[:120]
                    print(f"  >> agent: {preview}...", file=sys.stderr)
            elif etype == "turn.failed":
                print(f"  !! turn.failed: {event.get('error')}", file=sys.stderr)
            elif etype == "error":
                print(f"  !! error: {event.get('message')}", file=sys.stderr)
    finally:
        timer.cancel()
        proc.wait()
    stderr_tail = (proc.stderr.read() if proc.stderr else "") or ""
    if stderr_tail.strip():
        print("--- codex stderr ---", file=sys.stderr)
        print(stderr_tail, file=sys.stderr)
    if timed_out["fired"]:
        print(f"\n!! TIMED OUT after {timeout_s:.0f}s", file=sys.stderr)
    return events, proc.returncode, timed_out["fired"]


def main() -> int:
    codex_prefix = _resolve_codex_command()
    scenario_path = parse_scenario_arg(sys.argv)
    scenario = load_scenario(scenario_path)
    ctx = setup_run(scenario)
    model = os.environ.get("CODEX_MODEL") or scenario.get("models", {}).get("codex")
    if not model:
        sys.exit(
            "No codex model. Scenario YAML should carry `models.codex: <id>`; "
            "override with CODEX_MODEL=<id>."
        )

    prompt = ctx["prompt"]
    # Optional nudge for activation experiments; keeps shared scenario YAML
    # pristine while letting us probe weaker-model behavior.
    prompt_suffix = os.environ.get("CODEX_PROMPT_SUFFIX")
    if prompt_suffix:
        prompt = f"{prompt}\n\n{prompt_suffix.strip()}"

    print(f"Scenario: {scenario_path}")
    print(f"Kind:    {ctx['kind']}")
    if ctx["kind"] == "pr-review":
        print(f"Target:  {ctx['repo']} PR #{ctx['pr_number']}")
    print(f"Model:   {model}")
    print(f"Server:  {ctx['server_alias']} -> {ctx['server_endpoint']}")
    print(f"Prompt:  {prompt}")
    print()

    # Make the resolved token visible to codex under its expected env-var
    # name so `bearer_token_env_var` resolves at request time.
    env = {**os.environ, ctx["token_env_var"]: ctx["token"]}
    # `codex exec` prefers CODEX_API_KEY (exec/src/lib.rs:286), which
    # short-circuits the ChatGPT-account auth path — necessary when
    # that account can't access the requested model.
    if "OPENAI_API_KEY" in env and not env.get("CODEX_API_KEY"):
        env["CODEX_API_KEY"] = env["OPENAI_API_KEY"]

    alias = ctx["server_alias"]
    cmd = [
        # The harness runs codex from a hermetic tempdir (containment for
        # any files the agent writes), which isn't a git repo. codex's
        # default trust check refuses to run there without this flag.
        *codex_prefix, "exec", "--json", "--full-auto", "--skip-git-repo-check",
        "-m", model,
        "-c", f'mcp_servers.{alias}.url="{ctx["server_endpoint"]}"',
        "-c", f'mcp_servers.{alias}.bearer_token_env_var="{ctx["token_env_var"]}"',
    ]
    reasoning = os.environ.get("CODEX_REASONING_EFFORT")
    if reasoning:
        cmd.extend(["-c", f'model_reasoning_effort="{reasoning}"'])
    cmd.append(prompt)

    timeout_s = float(os.environ.get("CODEX_TIMEOUT_S") or _DEFAULT_TIMEOUT_S)
    error: str | None = None
    events: list[dict] = []
    rc = -1
    timed_out = False
    elapsed = 0.0
    # Hermetic CWD: any file the agent writes lands in tmp and is
    # discarded when the harness exits. Codex itself doesn't depend
    # on the harness CWD; this just contains side effects.
    with tempfile.TemporaryDirectory(prefix="skills-e2e-codex-", ignore_cleanup_errors=True) as tmp:
        start = time.monotonic()
        try:
            events, rc, timed_out = _run_codex(cmd, env, timeout_s, cwd=tmp)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            print(f"\n[codex subprocess failed] {error}", file=sys.stderr)
        elapsed = time.monotonic() - start

    if timed_out:
        error = error or f"timeout after {timeout_s:.0f}s"
    elif rc != 0 and not error:
        print(f"\n[codex exec exited non-zero: {rc}]", file=sys.stderr)
        error = f"codex exit code {rc}"

    calls, final_text = _extract_tool_calls(events)
    result = evaluate(scenario, calls, client_id="codex", final_text=final_text)
    report_and_save(
        client="codex", scenario=scenario, ctx=ctx, model=model,
        calls=calls, result=result, final_text=final_text,
        elapsed_s=elapsed, timed_out=timed_out, error=error,
    )
    return 0 if result["overall"] else 1


if __name__ == "__main__":
    sys.exit(main())
