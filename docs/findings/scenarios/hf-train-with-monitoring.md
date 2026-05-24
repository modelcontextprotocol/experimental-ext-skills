# Scenario: hf-train-with-monitoring

> **N=1 caveat.** Results below are single-trial. Pass-rate replication pending; treat individual outcomes as samples, not stable behavior.

**MCP server:** [`olaservo/hf-mcp-server@skills-over-mcp-experiment`](https://github.com/olaservo/hf-mcp-server/tree/skills-over-mcp-experiment) · **Scenario YAML:** [`experiments/scenarios/hf-train-with-monitoring.yaml`](../../../experiments/scenarios/hf-train-with-monitoring.yaml) · **Skills:** [`huggingface-llm-trainer`](https://github.com/huggingface/skills/tree/main/skills/huggingface-llm-trainer) + [`huggingface-trackio`](https://github.com/huggingface/skills/tree/main/skills/huggingface-trackio)

## What this probes

Cross-skill composition driven by `<available_skills>` catalog
visibility alone. The prompt:

> *"Fine-tune `meta-llama/Llama-3.2-1B-Instruct` on
> `databricks/databricks-dolly-15k` using Hugging Face Jobs, with
> Trackio alerts that fire on loss spikes."*

The `huggingface-llm-trainer` skill mentions "Trackio" by name as the
prescribed monitoring tool, but the actual alerts API
(`trackio.alert(...)`, `AlertLevel.WARN`, webhook setup) lives in
`huggingface-trackio/references/alerts.md` — a separate skill. **No
`skill://` cross-references exist** in either skill's body, so
successfully covering both prescriptions requires the agent to
independently activate the second skill from catalog visibility — the
host's `<available_skills>` block enumerating every skill by name and
description.

## Why this server

Same hf-mcp-server as `hf-jobs-plan`, deliberately. Holding server +
task domain constant lets us vary the *composition* axis cleanly: the
only difference from hf-jobs-plan is the second skill being required
implicitly via the prompt's "Trackio alerts" phrase.

## Findings

| Client + model | `skill-read-before-plan` |
| :--- | :--- |
| fast-agent (claude-haiku-4-5) | PASS — reads `huggingface-llm-trainer/SKILL.md` then `huggingface-trackio/SKILL.md` in two consecutive calls |
| codex (gpt-5.1-codex-mini) | PASS — same pattern, both `SKILL.md` URIs read before submitting |
| goose (claude-sonnet-4-6) | PASS — reads both `SKILL.md` files **and** follows the trail to `huggingface-trackio/references/alerts.md` |

All three hosts surface multi-skill activation from catalog visibility
alone. This is the protocol working as intended — one skill's body
names another by topic, and the agent locates and reads it via the
same `read_mcp_resource` / `read_skill` / `load_skill` path.

## Open question

Should the SEP say anything normative about how hosts surface or rank
`<available_skills>` for the model, or is that strictly a host-side
concern? The mechanism (catalog + name reference) works across the
clients tested; any divergence to investigate is in host policy, not
protocol.

## Related

- Reproduce locally: [`run-scenario` skill — hf-train-with-monitoring sub-page](../../../.claude/skills/run-scenario/scenarios/hf-train-with-monitoring.md)
