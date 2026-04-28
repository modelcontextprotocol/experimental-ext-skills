"""Provider-token resolution + skill-URI canonicalization."""

from __future__ import annotations

import os
import subprocess
import sys


def skill_name_from_arg(val: str) -> str:
    """Map a skill URI/name to the canonical skill name.

    Normalizes all the forms clients use to identify a skill:
      - `skill://pull-requests/SKILL.md`       -> `pull-requests`
      - `pull-requests`                        -> `pull-requests`
      - `pull-requests/scripts/train.py`       -> `pull-requests`
        (goose's `load_skill {"name": "<skill>/<path>"}` form —
        crates/goose/src/agents/platform_extensions/skills.rs)
      - `github_skills__pull-requests`         -> `pull-requests`
        (goose's `<server>__<name>` disambiguation form when two
        servers expose a same-named skill — same source file L555)
    """
    if val.startswith("skill://"):
        val = val.removeprefix("skill://")
    # Take only the first path segment — covers both `skill://name/...`
    # and goose's bare `name/path` form.
    val = val.split("/", 1)[0]
    return val.rsplit("__", 1)[-1]


def resolve_github_token() -> str:
    """Return a GitHub token from env, falling back to `gh auth token`."""
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    try:
        return subprocess.check_output(
            ["gh", "auth", "token"], encoding="utf-8"
        ).strip()
    except Exception as exc:
        sys.exit(
            f"GITHUB_TOKEN not set and `gh auth token` failed: {exc}. "
            f"Export a PAT via GITHUB_TOKEN, or run `gh auth login` first."
        )


def resolve_hf_token() -> str:
    """Return a Hugging Face token from env (HF_TOKEN or DEFAULT_HF_TOKEN)."""
    token = os.environ.get("HF_TOKEN") or os.environ.get("DEFAULT_HF_TOKEN")
    if token:
        return token
    sys.exit(
        "HF_TOKEN not set. Generate one at https://huggingface.co/settings/tokens "
        "and either export HF_TOKEN or source an env-file with `set -a && . FILE && set +a`."
    )
