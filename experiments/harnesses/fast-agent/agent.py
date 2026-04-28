"""Generic scenario runner for fast-agent — dispatches by scenario kind.

Exercises the activation primitive of the Skills-over-MCP SEP. For
`kind: pr-review`, the model must walk the three-step pending-review
workflow (Scenario #1). For `kind: plan`, the model must read the
named skill and produce a plan whose prose covers prescribed elements,
without ever calling the forbidden tools (Scenario #2).

SECURITY -- do not point this at untrusted repos / endpoints. PR
diffs and skill content are attacker-controlled on public sources;
hostile content can redirect the agent. Keep target endpoints sandboxed.

Pre-reqs vary by kind:
  pr-review: ANTHROPIC_API_KEY, GITHUB_TOKEN, MCP server on the scenario's
             endpoint without --read-only, and a reviewable PR (scaffold
             with `scaffolding_script` from the YAML).
  plan:      ANTHROPIC_API_KEY, MCP server on the scenario's endpoint.

Usage:
    cd experiments/harnesses/fast-agent
    GITHUB_TOKEN=$(gh auth token) uv run agent.py ../../scenarios/pr-review.yaml
    HF_TOKEN=hf_xxx              uv run agent.py ../../scenarios/hf-jobs-plan.yaml

Windows: prepend `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` so Rich's
block-drawing characters don't crash the cp1252 console.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import (  # noqa: E402
    evaluate,
    load_scenario,
    parse_scenario_arg,
    report_and_save,
    setup_run,
)

from fast_agent import FastAgent  # noqa: E402


# fast-agent resolves `fastagent.config.yaml` at import; the @fast.agent
# decorator needs scenario values at module-import time. So this runs
# at module scope, not under `if __name__ == "__main__"`.
_SCENARIO_PATH = parse_scenario_arg(sys.argv)
SCENARIO = load_scenario(_SCENARIO_PATH)
CTX = setup_run(SCENARIO)

# fast-agent's fastagent.config.yaml expects the bearer token under the
# expected env-var name ("GITHUB_TOKEN" for github_skills, "HF_TOKEN"
# for hf_skills) — `Authorization: "Bearer ${VAR}"`. setup_run resolves
# the token; we only need to make it visible to fast-agent under the
# right name.
os.environ[CTX["token_env_var"]] = CTX["token"]

PROMPT = CTX["prompt"]
MODEL = os.environ.get("FAST_AGENT_MODEL") or SCENARIO.get("models", {}).get("fast-agent")
SERVER_ALIAS = CTX["server_alias"]

fast = FastAgent(f"skills-over-mcp scenario: {SCENARIO['id']}")


def _extract_tool_calls(agent) -> list[tuple[str, dict]]:
    """Walk message_history; return [(bare_name, args), ...].

    fast-agent namespaces MCP tools as `<server>__<tool>`; strip so the
    evaluator matches bare names.
    """
    runner = agent.runner
    calls: list[tuple[str, dict]] = []
    for msg in runner.message_history:
        if not msg.tool_calls:
            continue
        for req in msg.tool_calls.values():
            params = req.params
            raw = getattr(params, "name", None) or ""
            name = raw.split("__", 1)[1] if "__" in raw else raw
            args = dict(getattr(params, "arguments", None) or {})
            calls.append((name, args))
    return calls


@fast.agent(
    name="runner",
    # No custom instruction — fall through to fast-agent's default so
    # the activation test sees only this CLI's native system prompt.
    model=MODEL,
    servers=[SERVER_ALIAS],
)
async def main() -> int:
    print(f"Scenario: {_SCENARIO_PATH}")
    print(f"Kind:    {CTX['kind']}")
    if CTX["kind"] == "pr-review":
        print(f"Target:  {CTX['repo']} PR #{CTX['pr_number']}")
    print(f"Server:  {SERVER_ALIAS}")
    print(f"Model:   {MODEL}")
    print(f"Prompt:  {PROMPT}")
    print()

    response = None
    calls: list[tuple[str, dict]] = []
    error: str | None = None
    elapsed = 0.0
    # fast-agent runs in-process, so its tools (write_text_file etc.)
    # resolve relative paths to *this* Python process's CWD. Drop into
    # a tempdir so any write lands there and is discarded when the
    # harness exits. fastagent.config.yaml is resolved at import time,
    # before this chdir, so config lookup is unaffected.
    prev_cwd = os.getcwd()
    with tempfile.TemporaryDirectory(prefix="skills-e2e-fast-agent-", ignore_cleanup_errors=True) as tmp:
        os.chdir(tmp)
        try:
            async with fast.run() as agent:
                start = time.monotonic()
                try:
                    response = await agent.send(PROMPT)
                except Exception as exc:
                    error = f"{type(exc).__name__}: {exc}"
                    print(f"\n[fast-agent raised] {error}", file=sys.stderr)
                elapsed = time.monotonic() - start
                try:
                    calls = _extract_tool_calls(agent)
                except Exception as exc:
                    error = error or f"tool-call extraction failed: {exc}"
        finally:
            os.chdir(prev_cwd)

    final_text = response if isinstance(response, str) else str(response) if response else None

    result = evaluate(SCENARIO, calls, client_id="fast-agent", final_text=final_text)
    report_and_save(
        client="fast-agent", scenario=SCENARIO, ctx=CTX, model=MODEL,
        calls=calls, result=result, final_text=final_text,
        elapsed_s=elapsed, error=error,
    )
    return 0 if result["overall"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
