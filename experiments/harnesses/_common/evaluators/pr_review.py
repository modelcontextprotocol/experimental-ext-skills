"""PR-review evaluator (Scenario #1 — `kind: pr-review`).

Criterion 1 ("skill-read-before-write") asks for "evidence that the
resource was actually read via MCP" — i.e. a protocol-level
`resources/read` happened, not a specific tool name. We match on tool
names because the server-side signal isn't visible from a client
transcript, but the per-client alias lists below include every helper
that demonstrably dispatches `resources/read` internally when the
target is an MCP-served skill:

  - codex      `read_mcp_resource` (uri arg)
  - fast-agent `read_skill` (path arg)
  - goose      `read_mcp_resource` (uri) / `read_skill` (path) /
               `load_skill` (name) — the last dispatches resources/read
               when the name resolves to an MCP entry
               (crates/goose/src/agents/platform_extensions/skills.rs L216)

Each alias is matched against the expected skill name by inspecting
`uri`, `path`, or `name` in its args — whichever the tool uses.
"""

from __future__ import annotations

from typing import Any

from _common.tokens import skill_name_from_arg

VALID_VERDICTS = {"APPROVE", "REQUEST_CHANGES", "COMMENT"}
MUTATING_TOOLS = {"pull_request_review_write", "add_comment_to_pending_review"}

SKILL_READ_ALIASES = {
    "codex":      {"read_mcp_resource"},
    "fast-agent": {"read_skill"},
    "goose":      {"read_mcp_resource", "read_skill", "load_skill"},
}


def evaluate(
    *,
    scenario: dict,
    calls: list[tuple[str, dict]],
    client_id: str,
    final_text: str | None = None,  # unused for pr-review
) -> dict[str, Any]:
    expected_skill_uri = scenario["expected_skill_uri"]
    expected_skill_name = skill_name_from_arg(expected_skill_uri)
    skill_read_names = SKILL_READ_ALIASES[client_id]

    read_skill_idx = None
    first_mutating_idx = None
    create_idx = None
    submit_idx = None
    single_shot_indices: list[int] = []
    comment_indices: list[int] = []
    verdict = None
    other_calls: list[tuple[int, str]] = []

    for i, (name, args) in enumerate(calls):
        args = args or {}
        is_skill_read = name in skill_read_names
        is_mutating = name in MUTATING_TOOLS

        if is_skill_read:
            target = args.get("uri") or args.get("path") or args.get("name") or ""
            if (
                skill_name_from_arg(target) == expected_skill_name
                and read_skill_idx is None
            ):
                read_skill_idx = i

        if is_mutating and first_mutating_idx is None:
            first_mutating_idx = i

        if name == "pull_request_review_write":
            method = args.get("method")
            event = args.get("event")
            if method == "create":
                if event:
                    single_shot_indices.append(i)
                elif create_idx is None:
                    create_idx = i
            elif method == "submit_pending":
                if submit_idx is None:
                    submit_idx = i
                    verdict = event

        if name == "add_comment_to_pending_review":
            comment_indices.append(i)

        if not (is_skill_read or is_mutating):
            other_calls.append((i, name))

    skill_before_write = (
        read_skill_idx is not None
        and (first_mutating_idx is None or read_skill_idx < first_mutating_idx)
    )
    create_pending_ok = create_idx is not None
    comments_ok = create_idx is not None and any(ci > create_idx for ci in comment_indices)
    submit_ok = (
        submit_idx is not None
        and verdict in VALID_VERDICTS
        and (create_idx is None or submit_idx > create_idx)
    )
    no_bypass = not single_shot_indices

    comment_count = len(comment_indices)
    criteria = [
        {"key": "skill_before_write", "label": "skill-read-before-write",
         "ok": skill_before_write, "note": None},
        {"key": "create_pending_ok", "label": "create-pending-review",
         "ok": create_pending_ok, "note": None},
        {"key": "comments_ok", "label": "add-comment(s)",
         "ok": comments_ok, "note": f"count={comment_count}"},
        {"key": "submit_ok", "label": "submit-pending-with-verdict",
         "ok": submit_ok, "note": f"verdict={verdict}"},
        {"key": "no_bypass", "label": "no-single-shot-bypass",
         "ok": no_bypass,
         "note": (f"bypass_indices={single_shot_indices}" if single_shot_indices else None)},
    ]

    return {
        "overall": all(c["ok"] for c in criteria),
        "criteria": criteria,
        "raw": {
            "comment_count": comment_count,
            "single_shot_indices": single_shot_indices,
            "verdict": verdict,
        },
        "other_calls": other_calls,
    }
