"""Per-kind run setup + uniform report wrapper for client harnesses.

`setup_run` resolves everything a client harness needs to wire up its
subprocess (token, server config, prompt). `report_and_save` is the
banner + JSON write at the end. Each handles the pr-review/plan kind
split so individual client agents stay short and don't repeat the
dispatch.

Client harnesses still own the parts that differ per binary:
  - resolving / spawning the binary (codex / gemini-cli / goose)
  - injecting MCP server config (CLI flags vs. temp settings.json vs.
    temp config.yaml — the wire format varies)
  - parsing the binary's stream-json events into (calls, final_text)
"""

from __future__ import annotations

import os
import sys
from typing import Any

from _common.pr import find_review_url, resolve_pr_number
from _common.report import render_report, write_result_json
from _common.tokens import resolve_github_token, resolve_hf_token


def setup_run(scenario: dict) -> dict[str, Any]:
    """Resolve token, server config, prompt, and (for pr-review) PR state.

    Returns a dict with:
      - kind: "pr-review" | "plan"
      - token: resolved bearer token string (used directly when the
        client materializes auth into a config file, e.g. gemini-cli /
        goose)
      - token_env_var: "GITHUB_TOKEN" | "HF_TOKEN" — the env-var name
        the client should set in the child process when its config
        takes an env-var *name* rather than a literal token (e.g.
        codex's `bearer_token_env_var`)
      - server_alias: name to register the MCP server under
      - server_endpoint: full URL (e.g. http://localhost:8082/mcp)
      - prompt: final prompt text, PR-substituted for pr-review,
        unchanged for plan
      - repo, pr_number: pr-review only; None for plan
    """
    kind = scenario["kind"]
    server = scenario.get("mcp_server") or {}
    endpoint = server.get("endpoint")
    alias = server.get("alias")
    if not endpoint:
        sys.exit("Scenario YAML must declare mcp_server.endpoint")
    if not alias:
        sys.exit("Scenario YAML must declare mcp_server.alias")

    if kind == "pr-review":
        token = resolve_github_token()
        repo = os.environ.get("REPO", scenario["repo"])
        pr_number = resolve_pr_number(repo, scenario["head_branch"], scenario["scaffolding_script"])
        prompt = scenario["prompt_template"].format(pr_number=pr_number, repo=repo).rstrip()
        return {
            "kind": kind, "token": token, "token_env_var": "GITHUB_TOKEN",
            "server_alias": alias, "server_endpoint": endpoint,
            "repo": repo, "pr_number": pr_number, "prompt": prompt,
        }
    if kind == "plan":
        token = resolve_hf_token()
        return {
            "kind": kind, "token": token, "token_env_var": "HF_TOKEN",
            "server_alias": alias, "server_endpoint": endpoint,
            "repo": None, "pr_number": None,
            "prompt": scenario["prompt_template"].rstrip(),
        }
    sys.exit(f"Unsupported scenario kind for client harnesses: {kind!r}")


def report_and_save(
    *,
    client: str,
    scenario: dict,
    ctx: dict,
    model: str | None,
    calls: list[tuple[str, dict]],
    result: dict,
    final_text: str | None,
    elapsed_s: float,
    timed_out: bool = False,
    error: str | None = None,
) -> None:
    """Render the banner and write the result JSON.

    pr-review fetches the review URL via `gh api` and prints it after
    the banner; plan runs omit the URL line and the JSON field
    entirely (no server-side artifact for plan).
    """
    common_json = dict(
        client=client, scenario_id=scenario["id"], model=model,
        result=result, tool_calls=calls,
        elapsed_ms=int(elapsed_s * 1000),
        error=error, final_text=final_text,
    )
    if ctx["kind"] == "pr-review":
        review_url = find_review_url(ctx["repo"], ctx["pr_number"])
        render_report(
            calls=calls, result=result, review_url=review_url,
            elapsed_s=elapsed_s, timed_out=timed_out, final_text=final_text,
        )
        write_result_json(**common_json, review_url=review_url)
    else:
        render_report(
            calls=calls, result=result,
            elapsed_s=elapsed_s, timed_out=timed_out, final_text=final_text,
        )
        write_result_json(**common_json)
