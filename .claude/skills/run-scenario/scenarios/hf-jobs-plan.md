# Scenario: hf-jobs-plan

**Kind:** `plan` · **Server:** hf-mcp-server :8083 (with `HF_JOBS_DRY_RUN=true`) · **YAML:** [`experiments/scenarios/hf-jobs-plan.yaml`](../../../../experiments/scenarios/hf-jobs-plan.yaml)

A real HF Jobs training prompt — *"Fine-tune
`meta-llama/Llama-3.2-1B-Instruct` on `databricks/databricks-dolly-15k`
using Hugging Face Jobs"* — gated by the dry-run intercept. The agent's
submitted script (the `script` arg of the `hf_jobs` call) is graded
for prescriptions from the `huggingface-llm-trainer` skill: PEP 723
metadata, `HF_TOKEN` secret forwarding, Trackio instrumentation.

## Banner — `skill-read-before-plan`

```bash
grep -B 1 -A 14 "skill-read-before-plan" /tmp/verify-run.log
```

Criteria to report:

- `skill-read-before-plan`
- `plan-covers-prescriptions` with `missing=[...]` on failure
- `references-read N` (informational, not pass/fail)
- `Wall-clock: ...`

## Goose-specific: gate_tools

Goose's agentic planning interleaves `todo__todo_write` calls with
skill activation. The scenario YAML's `gate_tools: [hf_jobs]` field
anchors the *skill-read-before-plan* criterion to the meaningful
action; without it, housekeeping calls are mistaken for the gate
and the criterion falsely fails or passes.
