"""Plan evaluator (`kind: plan`) — skill-activation scenarios.

Tests whether the agent reads the relevant skill and produces output
(prose and/or tool-call inputs) that reflects the skill's prescriptions.

Phrase-grep evaluates against the union of the agent's final text and
all tool-call argument values. In dry-run scenarios the prescriptions
land inside the submitted script (in the call's `script` arg) rather
than in the final assistant response, so we have to look at both.

Criteria emitted:

  1. skill-read-before-plan      — read SKILL.md before any gate-tool call
                                   (or before any non-skill-read call if
                                   no gate tools are configured)
  2. plan-covers-prescriptions   — every required phrase matched somewhere
                                   in the agent's text or call args

  INFO (doesn't gate `overall`)
    - references-read              — count of reads under the skill beyond
                                     SKILL.md. High = agent followed the
                                     reference trail; low/zero is consistent
                                     with SKILL.md being self-sufficient.

Scenario YAML must declare ONE of:
  expected_skill_uri:   skill://<name>/SKILL.md         (single-skill activation)
  expected_skill_uris:  [skill://<a>/SKILL.md, ...]     (multi-skill, all required)
plus:
  required_phrases:     [{ key, any_of: [str, ...] }]   (case-insensitive)
  gate_tools:           [list of tool names]            (optional)

Multi-skill scenarios pass `skill-read-before-plan` only when *every*
listed skill's SKILL.md was read before the gate. The criterion's
`note` lists which skills were read and which were missed, e.g.
`read=[a,b] missed=[c]`. This tests cross-skill composition driven
by the host's `<available_skills>` catalog — one skill mentions
another by name, and the agent independently reads both.

`gate_tools` declares which tool calls anchor the
"skill-read-before-plan" criterion. The skill must be read before any
gate-tool invocation; calls to other tools (housekeeping like
`todo__todo_write`, read-only inspections, etc.) don't count as gates,
which avoids spurious failures on agentic clients that plan before
activating skills.
"""

from __future__ import annotations

import json
import re
from typing import Any

from _common.tokens import skill_name_from_arg

# Reuse pr_review's tool aliases — these are *resource-read* dispatches,
# not PR-specific. Skill activation goes through the same per-client
# paths regardless of which skill is being read.
from _common.evaluators.pr_review import SKILL_READ_ALIASES

# Tools that don't anchor the skill-read-before-plan criterion when
# the gate falls back to "first non-skill-read call." Two flavors:
#
#   - protocol-level catalog navigation (`list_mcp_resources`,
#     `list_resources`) is part of the SEP discovery flow, not an
#     action the skill needs to precede
#   - agent-internal planning/housekeeping calls (e.g. goose →
#     `todo__todo_write`) fire before the agent decides to take any
#     real action; gating against them would falsely fail any client
#     whose planning step happens before skill activation
#
# Scenarios can still declare `gate_tools` for an explicit anchor;
# this list only matters in the fallback path.
DISCOVERY_TOOLS = frozenset({
    "list_mcp_resources",
    "list_resources",
    "todo__todo_write",  # goose's built-in planning
})


def _matches_phrase(text: str, candidates: list[str]) -> bool:
    return any(re.search(re.escape(c), text, re.IGNORECASE) for c in candidates)


def _phrase_haystack(final_text: str | None, calls: list[tuple[str, dict]]) -> str:
    """Concatenate the agent's final text with all call argument values.

    For dry-run scenarios the prescriptions live inside the agent's
    submitted script — e.g. an `hf_jobs` call's `script` arg contains
    the PEP 723 marker, the Trackio import, etc. The final assistant
    response in those runs is often just "Job submitted!" and grepping
    only that misses the real signal.
    """
    parts: list[str] = [final_text or ""]
    for _, args in calls:
        if args:
            parts.append(json.dumps(args, default=str))
    return "\n".join(parts)


def _read_target(args: dict) -> str:
    return args.get("uri") or args.get("path") or args.get("name") or ""


def evaluate(
    *,
    scenario: dict,
    calls: list[tuple[str, dict]],
    client_id: str,
    final_text: str | None = None,
) -> dict[str, Any]:
    # Accept either a single URI or a list. Multi-skill scenarios test
    # cross-skill composition: every listed skill's SKILL.md must be read.
    expected_skill_uris: list[str] = (
        scenario.get("expected_skill_uris")
        or [scenario["expected_skill_uri"]]
    )
    expected_skill_names = [skill_name_from_arg(uri) for uri in expected_skill_uris]
    gate_tools = set(scenario.get("gate_tools") or [])
    required_phrases: list[dict] = scenario.get("required_phrases", [])
    skill_read_names = SKILL_READ_ALIASES[client_id]

    # First-read index per expected skill; None until that skill's
    # SKILL.md (or bare-name lookup) appears in the call stream.
    skill_md_idxs: dict[str, int | None] = {n: None for n in expected_skill_names}
    reference_reads: list[int] = []
    gate_indices: list[int] = []
    other_calls: list[tuple[int, str]] = []

    for i, (name, args) in enumerate(calls):
        args = args or {}
        is_skill_read = name in skill_read_names
        is_gate = name in gate_tools

        if is_skill_read:
            target = _read_target(args)
            target_name = skill_name_from_arg(target)
            if target_name in skill_md_idxs:
                # Distinguish SKILL.md read from supporting-reference read.
                # SKILL.md is the canonical activation read; references are
                # the deeper trail through the skill directory.
                if target.endswith("SKILL.md") or target == target_name:
                    if skill_md_idxs[target_name] is None:
                        skill_md_idxs[target_name] = i
                else:
                    reference_reads.append(i)

        if is_gate:
            gate_indices.append(i)

        if not is_skill_read:
            other_calls.append((i, name))

    # Pick the gate to compare skill_md_idx against. Priority:
    #   1. configured gate_tools — explicit anchor
    #   2. first non-skill-read call — implicit fallback when not
    #      configured (preserves the criterion's meaning even on
    #      under-specified scenarios)
    if gate_indices:
        gate_idx: int | None = gate_indices[0]
    elif gate_tools:
        # Gates configured but none called — no anchor; criterion passes
        # if SKILL.md was read at all.
        gate_idx = None
    else:
        gate_idx = next(
            (i for i, (n, _) in enumerate(calls)
             if n not in skill_read_names and n not in DISCOVERY_TOOLS),
            None,
        )
    # Every expected skill must be read, and read before the gate.
    read_skills = [n for n, idx in skill_md_idxs.items() if idx is not None]
    missed_skills = [n for n, idx in skill_md_idxs.items() if idx is None]
    skill_before_plan = (
        not missed_skills
        and (
            gate_idx is None
            or all(idx < gate_idx for idx in skill_md_idxs.values() if idx is not None)
        )
    )
    # Diagnostic note for the banner — only when something's off, and
    # only meaningful for multi-skill scenarios.
    skill_note: str | None = None
    if not skill_before_plan and len(expected_skill_names) > 1:
        skill_note = f"read={read_skills} missed={missed_skills}"

    haystack = _phrase_haystack(final_text, calls)
    missing_phrase_keys: list[str] = []
    for entry in required_phrases:
        if not _matches_phrase(haystack, entry["any_of"]):
            missing_phrase_keys.append(entry["key"])
    plan_covers = not missing_phrase_keys
    plan_note = None if plan_covers else f"missing={missing_phrase_keys}"

    criteria = [
        {"key": "skill_before_plan", "label": "skill-read-before-plan",
         "ok": skill_before_plan, "note": skill_note},
        {"key": "plan_covers_prescriptions", "label": "plan-covers-prescriptions",
         "ok": plan_covers, "note": plan_note},
    ]
    info = [
        {"label": "references-read", "value": str(len(reference_reads))},
    ]

    return {
        "overall": all(c["ok"] for c in criteria),
        "criteria": criteria,
        "info": info,
        "raw": {
            "skill_md_indices": skill_md_idxs,
            "missed_skills": missed_skills,
            "reference_reads": reference_reads,
            "missing_phrase_keys": missing_phrase_keys,
            "final_text_chars": len(final_text or ""),
        },
        "other_calls": other_calls,
    }
