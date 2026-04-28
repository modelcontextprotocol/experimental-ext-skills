# Scenario: hf-train-with-monitoring

**Kind:** `plan` · **Server:** hf-mcp-server :8083 (with `HF_JOBS_DRY_RUN=true`) · **YAML:** [`experiments/scenarios/hf-train-with-monitoring.yaml`](../../../../experiments/scenarios/hf-train-with-monitoring.yaml)

Cross-skill composition probe. Prompt: *"Fine-tune
`meta-llama/Llama-3.2-1B-Instruct` on `databricks/databricks-dolly-15k`
using Hugging Face Jobs, with Trackio alerts that fire on loss
spikes."* The `huggingface-llm-trainer` skill names "Trackio" by
topic, but the alerts API (`trackio.alert(...)`, webhook setup)
lives in a separate `huggingface-trackio` skill — no `skill://`
cross-references between them. The agent must independently activate
the second skill from `<available_skills>` catalog visibility.

## Banner — `skill-read-before-plan`

```bash
grep -B 1 -A 14 "skill-read-before-plan" /tmp/verify-run.log
```

Criteria to report:

- `skill-read-before-plan` with `read=[...] missed=[...]` for the
  multi-skill case (both `huggingface-llm-trainer` and
  `huggingface-trackio` should appear in `read`)
- `plan-covers-prescriptions` with `missing=[...]` on failure
- `references-read N` (informational, not pass/fail; goose has been
  observed following the trail to `huggingface-trackio/references/alerts.md`)
- `Wall-clock: ...`

## Synthesis vs activation

A submitted script can mention `trackio.alert` without the agent
having read `huggingface-trackio` — gemini-2.5-pro has done this
from training-data familiarity. Passing the *content* criterion
(`plan-covers-prescriptions`) does not imply the *catalog navigation*
criterion (`skill-read-before-plan`) passed. Both are independent
signals; report both.
