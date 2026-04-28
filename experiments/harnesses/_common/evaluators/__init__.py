"""Scenario-kind dispatch for the activation evaluator.

Each evaluator returns the same shape so the banner renderer and
results-JSON writer don't need to know which kind they're scoring:

    {
        "overall": bool,
        "criteria": [
            {"key": str, "label": str, "ok": bool, "note": str | None},
            ...
        ],
        "raw": {<kind-specific extras for JSON>},
        "other_calls": [(int, str), ...],   # (call_index, tool_name)
    }

`label` is the banner string that `run-scenario/SKILL.md` step 4 greps
for; treat it as part of the public contract.
"""

from __future__ import annotations

from typing import Any

from . import plan as _plan
from . import pr_review as _pr_review

_BY_KIND = {
    "pr-review": _pr_review.evaluate,
    "plan": _plan.evaluate,
}


def evaluate(
    scenario: dict,
    calls: list[tuple[str, dict]],
    *,
    client_id: str,
    final_text: str | None = None,
) -> dict[str, Any]:
    """Score `calls` against `scenario`'s criteria. Dispatches by `kind`."""
    kind = scenario.get("kind")
    if kind not in _BY_KIND:
        raise ValueError(
            f"Unknown scenario kind {kind!r}. Known kinds: {sorted(_BY_KIND)}"
        )
    return _BY_KIND[kind](
        scenario=scenario,
        calls=calls,
        client_id=client_id,
        final_text=final_text,
    )
