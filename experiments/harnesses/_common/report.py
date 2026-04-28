"""Banner printing + results-JSON writing.

The banner labels are emitted by the per-kind evaluator (each criterion
carries its own greppable string). `run-scenario/SKILL.md` step 4 greps
for those literals — when adding a new evaluator, keep its labels stable.
"""

from __future__ import annotations

import datetime as _dt
import json
import sys
from pathlib import Path

_BANNER_WIDTH = 72

# Sentinel: distinguishes "scenario has no notion of a review URL"
# (omit the line entirely) from "scenario expected one but lookup
# returned None" (still print, with a hint). pr-review scenarios pass
# review_url= explicitly even when the lookup fails; plan scenarios
# don't pass it at all.
_UNSET = object()


def render_report(
    *,
    calls: list[tuple[str, dict]],
    result: dict,
    review_url=_UNSET,
    elapsed_s: float,
    timed_out: bool = False,
    final_text: str | None = None,
    out=sys.stdout,
) -> None:
    print(file=out)
    print("=" * _BANNER_WIDTH, file=out)
    print("Ordered tool calls:", file=out)
    if not calls:
        print("  (none)", file=out)
    for i, (name, args) in enumerate(calls):
        compact = {k: v for k, v in (args or {}).items() if k != "body"}
        print(f"  [{i}] {name}  {json.dumps(compact, default=str)[:180]}", file=out)
    print(file=out)

    for criterion in result["criteria"]:
        status = "PASS" if criterion["ok"] else "FAIL"
        extra = f" ({criterion['note']})" if criterion.get("note") else ""
        print(f"  {criterion['label']:<32} {status}{extra}", file=out)
    print(f"  {'overall':<32} {'PASS' if result['overall'] else 'FAIL'}", file=out)
    # Informational rows: behavioral signals that don't gate `overall`.
    # Printed after `overall` so grep patterns for the criteria block stay
    # tight, but still in the banner so the run-scenario report sees them.
    for info in result.get("info", []):
        print(f"  {info['label']:<32} {info['value']}", file=out)
    print(file=out)

    if result.get("other_calls"):
        print("Tool calls outside prescribed workflow:", file=out)
        for i, name in result["other_calls"]:
            print(f"  [{i}] {name}", file=out)
        print(file=out)

    if review_url is not _UNSET:
        # Only PR-review scenarios produce a review URL. Suppressed for
        # plan-only scenarios where there's no server-side artifact.
        print(f"Review URL: {review_url or '(not found via gh api)'}", file=out)
    print(f"Wall-clock: {elapsed_s:.1f}s{'  (TIMED OUT)' if timed_out else ''}", file=out)
    print("=" * _BANNER_WIDTH, file=out)
    print(file=out)
    if final_text is not None:
        print("Final assistant response:", file=out)
        print(final_text or "(no assistant text captured)", file=out)


def _flatten_criteria(result: dict) -> dict:
    """Flatten the criteria list + raw extras into a single keyed dict for JSON.

    pr-review's historical JSON shape (skill_before_write, comments_ok,
    create_pending_ok, no_bypass, submit_ok, comment_count,
    single_shot_indices, verdict) is preserved by this flattening — each
    criterion contributes `key -> ok` and the evaluator's `raw` contributes
    extras like `comment_count` and `verdict`. Result-shape consumers can
    treat the whole flattened dict as the criteria payload.
    """
    flat = {c["key"]: c["ok"] for c in result["criteria"]}
    flat.update(result.get("raw", {}))
    return flat


def write_result_json(
    *,
    client: str,
    scenario_id: str,
    model: str | None,
    result: dict,
    tool_calls: list[tuple[str, dict]],
    review_url=_UNSET,
    elapsed_ms: int,
    error: str | None = None,
    final_text: str | None = None,
    results_dir: Path | None = None,
) -> Path:
    """Write `results/<ISO-UTC>-<scenario>-<client>-<model>.json`.

    Written on every run, including crash paths — the file is the
    record that the run happened.
    """
    target_dir = results_dir or (Path(__file__).resolve().parents[2] / "results")
    target_dir.mkdir(parents=True, exist_ok=True)

    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    model_slug = (model or "unspecified").replace("/", "_").replace(":", "_")
    path = target_dir / f"{ts}-{scenario_id}-{client}-{model_slug}.json"

    payload = {
        "client": client,
        "criteria": _flatten_criteria(result),
        "elapsed_ms": elapsed_ms,
        "model": model,
        "overall": result["overall"],
        "scenario_id": scenario_id,
        "tool_calls": [{"args": dict(args or {}), "name": name} for name, args in tool_calls],
    }
    if review_url is not _UNSET:
        payload["review_url"] = review_url
    if final_text is not None:
        payload["final_text"] = final_text
    if error is not None:
        payload["error"] = error

    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )
    return path
