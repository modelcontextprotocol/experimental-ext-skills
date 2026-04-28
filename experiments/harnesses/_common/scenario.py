"""Scenario YAML loader with per-kind required-field validation."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

# Fields every scenario must declare regardless of kind.
_BASE_REQUIRED = ("id", "kind", "prompt_template")
# Either of these must be present (single or multi-skill).
_SKILL_URI_FIELDS = ("expected_skill_uri", "expected_skill_uris")

# Fields required by specific scenario kinds, in addition to the base set.
_PER_KIND_REQUIRED: dict[str, tuple[str, ...]] = {
    "pr-review": ("repo", "head_branch", "scaffolding_script"),
    "plan": (),  # plan scenarios run read-only; no scaffolding/repo plumbing.
}


def load_scenario(path: Path) -> dict:
    """Load and validate a scenario YAML. Exits on missing file or fields."""
    if not path.exists():
        sys.exit(f"Scenario YAML not found at {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        sys.exit(f"Scenario YAML at {path} did not parse to a mapping")

    missing = [f for f in _BASE_REQUIRED if not data.get(f)]
    if missing:
        sys.exit(f"Scenario YAML at {path} is missing required fields: {', '.join(missing)}")
    if not any(data.get(f) for f in _SKILL_URI_FIELDS):
        sys.exit(
            f"Scenario YAML at {path} must declare one of: "
            f"{', '.join(_SKILL_URI_FIELDS)}"
        )

    kind = data["kind"]
    if kind not in _PER_KIND_REQUIRED:
        sys.exit(f"Scenario YAML at {path} declares unknown kind {kind!r}; "
                 f"known kinds: {', '.join(sorted(_PER_KIND_REQUIRED))}")
    kind_missing = [f for f in _PER_KIND_REQUIRED[kind] if not data.get(f)]
    if kind_missing:
        sys.exit(f"Scenario YAML at {path} (kind={kind}) is missing fields: "
                 f"{', '.join(kind_missing)}")
    return data


def parse_scenario_arg(argv: list[str]) -> Path:
    """Parse the required positional scenario-YAML path, ignoring flags."""
    args = [a for a in argv[1:] if not a.startswith("-")]
    if len(args) != 1:
        sys.exit(
            "Usage: agent.py <scenario-yaml-path>\n"
            "The scenario YAML path is a required positional argument."
        )
    return Path(args[0]).resolve()
