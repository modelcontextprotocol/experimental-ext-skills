"""PR-number resolution and review-URL lookup via the `gh` CLI."""

from __future__ import annotations

import os
import subprocess
import sys


def resolve_pr_number(repo: str, head_branch: str, scaffolding_script: str) -> int:
    """Return the open PR number on `repo` for `head_branch`.

    Honors a PR_NUMBER env-var override; otherwise runs `gh pr list`.
    Exits with a pointer to the scaffolding script if no PR is found —
    the expected workflow is: scaffold, then run the harness.
    """
    env_val = os.environ.get("PR_NUMBER")
    if env_val:
        try:
            return int(env_val)
        except ValueError:
            sys.exit(f"PR_NUMBER={env_val!r} is not an integer")

    try:
        out = subprocess.check_output(
            [
                "gh", "pr", "list",
                "--repo", repo,
                "--head", head_branch,
                "--state", "open",
                "--json", "number",
                "--jq", ".[0].number",
            ],
            encoding="utf-8",
        ).strip()
    except Exception as exc:
        sys.exit(
            f"PR_NUMBER not set and auto-detect failed: {exc}. "
            f"Run {scaffolding_script} first, or pass PR_NUMBER explicitly."
        )
    if not out:
        sys.exit(
            f"No open PR on {repo} head={head_branch}. "
            f"Run {scaffolding_script} first."
        )
    return int(out)


def find_review_url(repo: str, pr_number: int) -> str | None:
    """Return the URL of the most recent review posted to `repo#pr_number`.

    The MCP server exposes no direct handle to the review it just
    submitted, and neither do any of the client CLIs. Grab the last
    review on the PR via `gh api` — the reviews array is append-only,
    so the most-recent entry is the one we posted (assuming no
    concurrent runs, which is a documented guardrail).
    """
    try:
        out = subprocess.check_output(
            [
                "gh", "api",
                f"repos/{repo}/pulls/{pr_number}/reviews",
                "--jq", ".[-1].html_url",
            ],
            encoding="utf-8",
        ).strip()
    except Exception:
        return None
    return out or None
