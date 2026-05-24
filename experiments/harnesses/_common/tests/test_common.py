"""Regression tests for the shared harness plumbing.

The evaluator is the one component whose correctness determines every
finding, so it gets the most coverage. Scenario loading + result JSON
writing get enough tests to catch shape drift but not every permutation.

Run from harnesses/:
    uv run --with pyyaml --with pytest python -m pytest _common/tests/
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest
import yaml

_HARNESSES_DIR = Path(__file__).resolve().parents[2]
if str(_HARNESSES_DIR) not in sys.path:
    sys.path.insert(0, str(_HARNESSES_DIR))

from _common import (  # noqa: E402
    evaluate, load_scenario, render_report, write_result_json,
)
from _common.setup import setup_run  # noqa: E402


SKILL_URI = "skill://pull-requests/SKILL.md"

PR_SCENARIO = {
    "id": "test-pr",
    "kind": "pr-review",
    "expected_skill_uri": SKILL_URI,
}

HF_SKILL_URI = "skill://huggingface-llm-trainer/SKILL.md"
HF_REF_URI = "skill://huggingface-llm-trainer/references/training_methods.md"
PLAN_SCENARIO = {
    "id": "test-plan",
    "kind": "plan",
    "expected_skill_uri": HF_SKILL_URI,
    "gate_tools": ["hf_jobs"],
    "required_phrases": [
        {"key": "p_trl",     "any_of": ["TRL Jobs"]},
        {"key": "p_secrets", "any_of": ["$HF_TOKEN", "secrets:"]},
    ],
}


def _flat(result):
    """Helper: flatten criteria + raw into a single dict for legacy-shape assertions."""
    return {**{c["key"]: c["ok"] for c in result["criteria"]}, **result["raw"]}


def _read(path: str = SKILL_URI) -> tuple[str, dict]:
    return ("read_mcp_resource", {"uri": path})


def _create() -> tuple[str, dict]:
    return ("pull_request_review_write", {"method": "create", "pullNumber": 7})


def _comment(line: int = 10) -> tuple[str, dict]:
    return ("add_comment_to_pending_review", {"line": line})


def _submit(event: str = "REQUEST_CHANGES") -> tuple[str, dict]:
    return ("pull_request_review_write", {"method": "submit_pending", "event": event})


# ---------------------------------------------------------------------- pr-review evaluator

def test_pr_happy_path_passes_all_five():
    calls = [_read(), _create(), _comment(), _comment(42), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    assert r["overall"] is True
    f = _flat(r)
    assert f["comment_count"] == 2
    assert f["verdict"] == "REQUEST_CHANGES"


def test_pr_invalid_verdict_fails_submit():
    calls = [_read(), _create(), _comment(),
             ("pull_request_review_write", {"method": "submit_pending", "event": "WAT"})]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    assert _flat(r)["submit_ok"] is False
    assert r["overall"] is False


def test_pr_skill_read_after_first_write_fails_criterion_one():
    calls = [_create(), _read(), _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    f = _flat(r)
    assert f["skill_before_write"] is False
    assert f["create_pending_ok"] is True  # other criteria still measurable
    assert r["overall"] is False


def test_pr_wrong_skill_uri_does_not_count_as_read():
    calls = [("read_mcp_resource", {"uri": "skill://other/SKILL.md"}),
             _create(), _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    assert _flat(r)["skill_before_write"] is False
    assert r["other_calls"] == []  # wrong-URI read still expected, not flagged


def test_pr_comment_before_create_does_not_satisfy_comments_ok():
    calls = [_read(), _comment(), _create(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    f = _flat(r)
    assert f["comment_count"] == 1
    assert f["comments_ok"] is False


def test_pr_single_shot_bypass_is_flagged():
    # method="create" with event set is the SEP's single-shot bypass.
    single_shot = ("pull_request_review_write",
                   {"method": "create", "event": "APPROVE"})
    calls = [_read(), single_shot, _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    f = _flat(r)
    assert f["no_bypass"] is False
    assert f["single_shot_indices"] == [1]


def test_pr_unrelated_calls_appear_in_other_calls():
    calls = [
        ("pull_request_read", {}),
        _read(), _create(), _comment(),
        ("list_issues", {}),
        _submit(),
    ]
    r = evaluate(PR_SCENARIO, calls, client_id="codex")
    assert r["overall"] is True  # informational only
    assert (0, "pull_request_read") in r["other_calls"]
    assert (4, "list_issues") in r["other_calls"]


# ---------------------------------------------------------------------- alias divergence

def test_fast_agent_accepts_read_skill_not_read_mcp_resource():
    # fast-agent: {read_skill} only.
    r1 = evaluate(PR_SCENARIO, [_read(), _create(), _comment(), _submit()],
                  client_id="fast-agent")
    r2 = evaluate(PR_SCENARIO, [("read_skill", {"path": SKILL_URI}), _create(), _comment(), _submit()],
                  client_id="fast-agent")
    assert _flat(r1)["skill_before_write"] is False
    assert _flat(r2)["skill_before_write"] is True


def test_goose_accepts_both_read_aliases():
    for read_call in [_read(), ("read_skill", {"path": SKILL_URI})]:
        r = evaluate(PR_SCENARIO, [read_call, _create(), _comment(), _submit()],
                     client_id="goose")
        assert _flat(r)["skill_before_write"] is True


def test_goose_credits_load_skill_with_matching_name():
    calls = [("load_skill", {"name": "pull-requests"}),
             _create(), _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="goose")
    assert _flat(r)["skill_before_write"] is True
    assert r["overall"] is True


def test_helper_with_wrong_skill_name_does_not_count():
    calls = [("load_skill", {"name": "other-skill"}),
             _create(), _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="goose")
    assert _flat(r)["skill_before_write"] is False


def test_goose_disambiguated_skill_name_is_credited():
    calls = [("load_skill", {"name": "github_skills__pull-requests"}),
             _create(), _comment(), _submit()]
    r = evaluate(PR_SCENARIO, calls, client_id="goose")
    assert _flat(r)["skill_before_write"] is True
    assert r["overall"] is True


# ---------------------------------------------------------------------- plan evaluator

def _hf_read(path: str = HF_SKILL_URI) -> tuple[str, dict]:
    return ("read_mcp_resource", {"uri": path})


_PLAN_HAPPY_TEXT = (
    "I'd use the TRL Jobs package and forward $HF_TOKEN via secrets: "
    "{HF_TOKEN: $HF_TOKEN} to access the gated model."
)


def _info_value(result: dict, label: str) -> str:
    return next(i["value"] for i in result["info"] if i["label"] == label)


def test_plan_happy_path_passes_both_criteria():
    calls = [_hf_read(), _hf_read(HF_REF_URI)]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    assert r["overall"] is True
    f = _flat(r)
    assert f["skill_before_plan"] is True
    assert f["plan_covers_prescriptions"] is True
    # Informational: refs read tracked but not gated.
    assert _info_value(r, "references-read") == "1"


def test_plan_skipped_skill_md_fails_first_criterion():
    # Read only a reference, not SKILL.md — fails skill-read-before-plan.
    # The reference still counts toward the informational refs-read line,
    # which proves they're decoupled.
    calls = [_hf_read(HF_REF_URI)]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    f = _flat(r)
    assert f["skill_before_plan"] is False
    assert _info_value(r, "references-read") == "1"
    assert r["overall"] is False


def test_plan_no_references_does_not_fail_overall():
    # Reading SKILL.md alone is a legitimate path — shouldn't punish runs
    # where the skill body was self-sufficient. references-read=0 is data,
    # not a failure mode.
    calls = [_hf_read()]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    assert r["overall"] is True
    assert _info_value(r, "references-read") == "0"


def test_plan_skill_read_after_gate_call_fails_first():
    # Even if skill is read, doing it AFTER the first gate call fails the gating.
    calls = [("hf_jobs", {"operation": "run"}), _hf_read(), _hf_read(HF_REF_URI)]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    f = _flat(r)
    assert f["skill_before_plan"] is False
    assert r["overall"] is False


def test_plan_missing_phrase_consolidates_into_single_criterion():
    text = "I'd use the TRL Jobs package."  # no $HF_TOKEN / secrets: mention
    calls = [_hf_read(), _hf_read(HF_REF_URI)]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=text)
    f = _flat(r)
    assert f["plan_covers_prescriptions"] is False
    # Note carries which phrase keys missed — preserves diagnostic granularity
    # in a single criterion.
    note = next(c["note"] for c in r["criteria"] if c["key"] == "plan_covers_prescriptions")
    assert note == "missing=['p_secrets']"
    assert r["raw"]["missing_phrase_keys"] == ["p_secrets"]


def test_plan_phrase_match_is_case_insensitive():
    text = "i'd run trl jobs and pass $hf_token through secrets:"
    calls = [_hf_read(), _hf_read(HF_REF_URI)]
    r = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=text)
    f = _flat(r)
    assert f["plan_covers_prescriptions"] is True


# ---------------------------------------------------------------------- plan / dry-run path

# Dry-run scenarios: scenario omits `gate_tools` so the plan evaluator
# uses the first non-skill call as the gate for `skill-read-before-plan`.
# Phrase-grep widens to include call arguments so prescriptions inside
# the agent's submitted script are visible.

DRY_RUN_SCENARIO = {
    "id": "hf-jobs-dry",
    "kind": "plan",
    "expected_skill_uri": HF_SKILL_URI,
    "required_phrases": [
        {"key": "p_trl",     "any_of": ["TRL Jobs"]},
        {"key": "p_secrets", "any_of": ["$HF_TOKEN", "secrets:"]},
    ],
}


def _hf_jobs_call(script: str = "TRL Jobs and $HF_TOKEN secrets:") -> tuple[str, dict]:
    return ("hf_jobs", {"operation": "uv", "args": {"script": script, "secrets": {"HF_TOKEN": "$HF_TOKEN"}}})


def test_dry_run_phrases_match_against_call_args():
    # Final text says "Job submitted!" only — prescriptions live in the
    # script the agent passed to hf_jobs. With the union haystack, the
    # criterion still passes.
    calls = [_hf_read(), _hf_jobs_call()]
    r = evaluate(DRY_RUN_SCENARIO, calls, client_id="codex", final_text="Job submitted!")
    f = _flat(r)
    assert f["plan_covers_prescriptions"] is True


def test_dry_run_emits_two_criteria():
    calls = [_hf_read(), _hf_jobs_call()]
    r = evaluate(DRY_RUN_SCENARIO, calls, client_id="codex", final_text="")
    keys = [c["key"] for c in r["criteria"]]
    assert keys == ["skill_before_plan", "plan_covers_prescriptions"]
    assert r["overall"] is True


def test_dry_run_skill_read_after_first_call_fails():
    # When gate_tools is empty, the first non-skill-read call is
    # the implicit gate. Reading SKILL.md after that fails the criterion.
    calls = [_hf_jobs_call(), _hf_read()]
    r = evaluate(DRY_RUN_SCENARIO, calls, client_id="codex", final_text="Job submitted!")
    f = _flat(r)
    assert f["skill_before_plan"] is False
    assert r["overall"] is False


def test_dry_run_phrase_in_call_args_only_still_matches():
    # Every prescription is in the script arg, none in final_text.
    script_with_all = "TRL Jobs / $HF_TOKEN / secrets: {HF_TOKEN: $HF_TOKEN}"
    calls = [_hf_read(), _hf_jobs_call(script=script_with_all)]
    r = evaluate(DRY_RUN_SCENARIO, calls, client_id="codex", final_text="(empty)")
    assert r["overall"] is True


def test_discovery_tools_dont_anchor_implicit_gate():
    """`list_mcp_resources` is protocol-level catalog enumeration,
    not an action — it shouldn't be treated as the gate when the
    fallback path is in effect (no gate_tools).
    """
    scenario = {
        "id": "discovery", "kind": "plan",
        "expected_skill_uri": HF_SKILL_URI,
        "required_phrases": [],  # criterion only — no phrase coverage
    }
    calls = [
        ("list_mcp_resources", {}),  # discovery, before SKILL.md read
        _hf_read(),
    ]
    r = evaluate(scenario, calls, client_id="codex", final_text="")
    f = _flat(r)
    assert f["skill_before_plan"] is True


def test_dry_run_gate_tools_anchor_skill_read_criterion():
    """gate_tools makes housekeeping calls (todo writes, etc.) not count
    as the gate for skill-read-before-plan, which matters for agentic
    clients like goose that plan before activating skills.
    """
    scenario = {**DRY_RUN_SCENARIO, "gate_tools": ["hf_jobs"]}
    calls = [
        ("todo__todo_write", {"content": "plan it"}),
        _hf_read(),                  # skill activation comes after the todo
        _hf_jobs_call(),             # actual gate
    ]
    r = evaluate(scenario, calls, client_id="goose", final_text="Job submitted!")
    f = _flat(r)
    # Without gate_tools the todo at index 0 would be the implicit gate
    # and the criterion would FAIL. With gate_tools=[hf_jobs] only the
    # hf_jobs call (index 2) anchors, so the skill read at 1 wins.
    assert f["skill_before_plan"] is True
    assert r["overall"] is True


def test_dry_run_gate_tools_still_fails_when_skill_after_gate():
    scenario = {**DRY_RUN_SCENARIO, "gate_tools": ["hf_jobs"]}
    calls = [_hf_jobs_call(), _hf_read()]
    r = evaluate(scenario, calls, client_id="codex", final_text="Job submitted!")
    f = _flat(r)
    assert f["skill_before_plan"] is False


def test_goose_load_skill_with_path_form_credited_as_reference():
    """goose's load_skill {"name": "<skill>/<path>"} form should resolve
    to the same skill (canonical name from the first segment) and be
    classified as a reference read, not silently ignored.
    """
    scenario = {**DRY_RUN_SCENARIO, "gate_tools": ["hf_jobs"]}
    path_form = ("load_skill", {"name": "huggingface-llm-trainer/scripts/train_sft_example.py"})
    calls = [_hf_read(), path_form, _hf_jobs_call()]
    r = evaluate(scenario, calls, client_id="goose", final_text="Job submitted!")
    f = _flat(r)
    assert f["skill_before_plan"] is True
    assert r["raw"]["reference_reads"] == [1]
    # The path-form load_skill must NOT land in other_calls — it's a
    # legitimate skill-read dispatch for goose.
    assert all(name != "load_skill" for _, name in r["other_calls"])


# ---------------------------------------------------------------------- multi-skill (cross-skill composition)

HF_TRACKIO_URI = "skill://huggingface-trackio/SKILL.md"

MULTI_SCENARIO = {
    "id": "multi-skill",
    "kind": "plan",
    "expected_skill_uris": [HF_SKILL_URI, HF_TRACKIO_URI],
    "gate_tools": ["hf_jobs"],
    "required_phrases": [
        {"key": "p_alert", "any_of": ["trackio.alert"]},
    ],
}


def _trackio_read() -> tuple[str, dict]:
    return ("read_mcp_resource", {"uri": HF_TRACKIO_URI})


def test_multi_skill_passes_when_both_read_before_gate():
    calls = [_hf_read(), _trackio_read(), _hf_jobs_call("trackio.alert(...)")]
    r = evaluate(MULTI_SCENARIO, calls, client_id="codex", final_text="")
    f = _flat(r)
    assert f["skill_before_plan"] is True
    assert f["plan_covers_prescriptions"] is True
    assert r["overall"] is True
    assert r["raw"]["missed_skills"] == []


def test_multi_skill_fails_when_one_skill_missed():
    # Only llm-trainer was read; trackio activation skipped.
    calls = [_hf_read(), _hf_jobs_call("trackio.alert(...)")]
    r = evaluate(MULTI_SCENARIO, calls, client_id="codex", final_text="")
    f = _flat(r)
    assert f["skill_before_plan"] is False
    assert r["raw"]["missed_skills"] == ["huggingface-trackio"]
    # Banner note surfaces the diagnostic.
    skill_crit = next(c for c in r["criteria"] if c["key"] == "skill_before_plan")
    assert "missed=['huggingface-trackio']" in skill_crit["note"]


def test_multi_skill_fails_when_one_skill_after_gate():
    # llm-trainer read before gate, trackio after — partial activation.
    calls = [_hf_read(), _hf_jobs_call("trackio.alert(...)"), _trackio_read()]
    r = evaluate(MULTI_SCENARIO, calls, client_id="codex", final_text="")
    f = _flat(r)
    assert f["skill_before_plan"] is False


def test_single_skill_uri_still_works_via_backward_compat():
    # Legacy YAML using `expected_skill_uri` (singular) keeps working —
    # the evaluator normalizes it to a list of one internally.
    legacy = {
        "id": "legacy", "kind": "plan",
        "expected_skill_uri": HF_SKILL_URI,
        "gate_tools": ["hf_jobs"],
        "required_phrases": [{"key": "p", "any_of": ["TRL"]}],
    }
    calls = [_hf_read(), _hf_jobs_call("TRL Jobs")]
    r = evaluate(legacy, calls, client_id="codex", final_text="")
    assert r["overall"] is True


def test_dry_run_missing_phrase_in_both_haystack_parts_fails():
    # Use a bare hf_jobs call (no secrets dict) so $HF_TOKEN really is
    # absent from both final_text and call args.
    script_with_one = "TRL Jobs only — no token mentioned"
    bare_call = ("hf_jobs", {"operation": "uv", "args": {"script": script_with_one}})
    calls = [_hf_read(), bare_call]
    r = evaluate(DRY_RUN_SCENARIO, calls, client_id="codex", final_text="(empty)")
    f = _flat(r)
    assert f["plan_covers_prescriptions"] is False
    assert r["raw"]["missing_phrase_keys"] == ["p_secrets"]


# ---------------------------------------------------------------------- scenario

def _write_yaml(path: Path, **fields) -> None:
    path.write_text(yaml.safe_dump(fields, sort_keys=False), encoding="utf-8")


def test_load_scenario_pr_review_happy_path(tmp_path: Path):
    path = tmp_path / "s.yaml"
    _write_yaml(
        path,
        id="test", kind="pr-review", repo="a/b", head_branch="main", scaffolding_script="s.sh",
        prompt_template="PR #{pr_number} on {repo}",
        expected_skill_uri=SKILL_URI,
    )
    s = load_scenario(path)
    assert s["id"] == "test"
    assert s["kind"] == "pr-review"
    assert s["prompt_template"].format(pr_number=7, repo="a/b") == "PR #7 on a/b"


def test_load_scenario_plan_does_not_require_pr_fields(tmp_path: Path):
    path = tmp_path / "s.yaml"
    _write_yaml(
        path,
        id="plan-test", kind="plan",
        prompt_template="just a plan",
        expected_skill_uri=HF_SKILL_URI,
    )
    s = load_scenario(path)
    assert s["kind"] == "plan"


def test_load_scenario_missing_kind_exits(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    _write_yaml(path, id="x", repo="a/b", head_branch="main", scaffolding_script="s.sh",
                prompt_template="...", expected_skill_uri=SKILL_URI)
    with pytest.raises(SystemExit) as ei:
        load_scenario(path)
    assert "kind" in str(ei.value)


def test_load_scenario_unknown_kind_exits(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    _write_yaml(path, id="x", kind="bogus", prompt_template="...", expected_skill_uri=SKILL_URI)
    with pytest.raises(SystemExit) as ei:
        load_scenario(path)
    assert "unknown kind" in str(ei.value)


def test_load_scenario_pr_missing_repo_exits(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    _write_yaml(path, id="x", kind="pr-review", prompt_template="...",
                expected_skill_uri=SKILL_URI)
    with pytest.raises(SystemExit) as ei:
        load_scenario(path)
    assert "missing fields" in str(ei.value)


# ---------------------------------------------------------------------- report

def test_write_result_json_pr_shape(tmp_path: Path):
    calls = [_read(), _create(),
             ("add_comment_to_pending_review",
              {"line": 10, "body": "secret_body_should_be_preserved_in_json"}),
             _submit("APPROVE")]
    result = evaluate(PR_SCENARIO, calls, client_id="codex")
    path = write_result_json(
        client="codex", scenario_id="pr-review", model="gpt-5.1-codex",
        result=result, tool_calls=calls,
        review_url="https://example.com/r/1", elapsed_ms=12345,
        results_dir=tmp_path,
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["client"] == "codex"
    assert payload["overall"] is True
    assert payload["criteria"]["verdict"] == "APPROVE"
    assert payload["criteria"]["skill_before_write"] is True
    # Filename convention: <ISO-UTC>-<scenario>-<client>-<model>.json
    assert path.name.endswith("-pr-review-codex-gpt-5.1-codex.json")
    # Body preserved in JSON (only stripped from stdout preview).
    assert payload["tool_calls"][2]["args"]["body"].startswith("secret_body")


def test_write_result_json_plan_shape(tmp_path: Path):
    calls = [_hf_read(), _hf_read(HF_REF_URI)]
    result = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    path = write_result_json(
        client="codex", scenario_id="hf-jobs-plan", model="gpt-5.1-codex",
        result=result, tool_calls=calls, elapsed_ms=4200,
        final_text=_PLAN_HAPPY_TEXT,
        results_dir=tmp_path,
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["overall"] is True
    assert payload["criteria"]["skill_before_plan"] is True
    assert payload["criteria"]["plan_covers_prescriptions"] is True
    # raw["reference_reads"] preserves the informational signal in JSON
    # even though it's not a pass/fail criterion.
    assert payload["criteria"]["reference_reads"] == [1]
    assert payload["final_text"] == _PLAN_HAPPY_TEXT
    # No review_url for plan scenarios.
    assert "review_url" not in payload


def test_write_result_json_crash_path_records_error(tmp_path: Path):
    result = evaluate(PR_SCENARIO, [], client_id="goose")
    path = write_result_json(
        client="goose", scenario_id="pr-review", model="claude-haiku-4-5-20251001",
        result=result, tool_calls=[], review_url=None, elapsed_ms=50,
        error="connection refused", results_dir=tmp_path,
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["overall"] is False
    assert payload["tool_calls"] == []
    assert payload["error"] == "connection refused"


def test_render_report_emits_pr_greppable_banner():
    # run-scenario/SKILL.md step 4 greps for these literals. Lock them.
    calls = [_read(), _create(), _comment(), _submit("COMMENT")]
    result = evaluate(PR_SCENARIO, calls, client_id="codex")
    buf = io.StringIO()
    render_report(calls=calls, result=result, review_url=None, elapsed_s=1.5, out=buf)
    text = buf.getvalue()
    for literal in [
        "skill-read-before-write",
        "create-pending-review",
        "add-comment(s)",
        "submit-pending-with-verdict",
        "no-single-shot-bypass",
        "overall",
        "Review URL:",
        "Wall-clock:",
    ]:
        assert literal in text
    # `body` arg is stripped from stdout preview (privacy / log size).
    assert "secret_body" not in text


def test_setup_run_plan_resolves_token_and_skips_pr_state(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "hf_test")
    scenario = {
        "id": "hf-jobs-plan", "kind": "plan",
        "expected_skill_uri": HF_SKILL_URI,
        "prompt_template": "do a plan",
        "mcp_server": {"endpoint": "http://localhost:8083/mcp", "alias": "hf_skills"},
    }
    ctx = setup_run(scenario)
    assert ctx["kind"] == "plan"
    assert ctx["token"] == "hf_test"
    assert ctx["token_env_var"] == "HF_TOKEN"
    assert ctx["server_alias"] == "hf_skills"
    assert ctx["server_endpoint"] == "http://localhost:8083/mcp"
    assert ctx["repo"] is None
    assert ctx["pr_number"] is None
    # Plan prompts have no {pr_number}/{repo} substitution.
    assert ctx["prompt"] == "do a plan"


def test_setup_run_pr_review_uses_github_token_env_var(monkeypatch, tmp_path):
    monkeypatch.setenv("GITHUB_TOKEN", "gh_test")
    monkeypatch.setenv("PR_NUMBER", "42")  # bypass `gh pr list`
    scenario = {
        "id": "pr-review", "kind": "pr-review",
        "expected_skill_uri": SKILL_URI,
        "prompt_template": "review #{pr_number} on {repo}",
        "mcp_server": {"endpoint": "http://localhost:8082/mcp", "alias": "github_skills"},
        "repo": "owner/sandbox", "head_branch": "f", "scaffolding_script": "ignored.sh",
    }
    ctx = setup_run(scenario)
    assert ctx["kind"] == "pr-review"
    assert ctx["token"] == "gh_test"
    assert ctx["token_env_var"] == "GITHUB_TOKEN"
    assert ctx["repo"] == "owner/sandbox"
    assert ctx["pr_number"] == 42
    assert ctx["prompt"] == "review #42 on owner/sandbox"


def test_setup_run_missing_alias_exits():
    scenario = {
        "id": "x", "kind": "plan",
        "expected_skill_uri": HF_SKILL_URI,
        "prompt_template": "...",
        "mcp_server": {"endpoint": "http://localhost:8083/mcp"},  # no alias
    }
    with pytest.raises(SystemExit) as ei:
        setup_run(scenario)
    assert "alias" in str(ei.value)


def test_render_report_emits_plan_banner_without_review_url():
    calls = [_hf_read(), _hf_read(HF_REF_URI)]
    result = evaluate(PLAN_SCENARIO, calls, client_id="codex", final_text=_PLAN_HAPPY_TEXT)
    buf = io.StringIO()
    render_report(calls=calls, result=result, elapsed_s=2.0, out=buf)
    text = buf.getvalue()
    for literal in [
        "skill-read-before-plan",
        "plan-covers-prescriptions",
        "references-read",  # informational, printed after overall
        "Wall-clock:",
    ]:
        assert literal in text
    # Plan scenarios omit the Review URL line entirely.
    assert "Review URL:" not in text
