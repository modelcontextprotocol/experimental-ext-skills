# Scenario: hf-jobs-plan

> **N=1 caveat.** Results below are single-trial. Pass-rate replication pending; treat individual outcomes as samples, not stable behavior.

**MCP server:** [`olaservo/hf-mcp-server@skills-over-mcp-experiment`](https://github.com/olaservo/hf-mcp-server/tree/skills-over-mcp-experiment) · **Scenario YAML:** [`experiments/scenarios/hf-jobs-plan.yaml`](../../../experiments/scenarios/hf-jobs-plan.yaml) · **Skill:** [`huggingface-llm-trainer`](https://github.com/huggingface/skills/tree/main/skills/huggingface-llm-trainer)

## What this probes

Plan-kind output. The skill teaches the agent to produce a structured
*plan* — a PEP 723 UV script with `HF_TOKEN` secret forwarding and
Trackio instrumentation — rather than free-form code or chat. Tests
whether skill conventions can shape output format reliably across
clients when the underlying request is a real-looking training prompt:

> *"Fine-tune `meta-llama/Llama-3.2-1B-Instruct` on
> `databricks/databricks-dolly-15k` using Hugging Face Jobs."*

The agent's submitted script (the `script` arg of the `hf_jobs` call)
is graded for those skill prescriptions — PEP 723 metadata, secret
forwarding, Trackio import.

## Why this server

Hugging Face's job-submission domain has a real-world need for
structured launch artifacts; getting the script shape wrong is a
silent failure mode that costs compute. The dry-run intercept
(`HF_JOBS_DRY_RUN=true`) makes execution safe — the agent's submission
shape is graded from the call args, just not actually executed. That
combination — non-trivial domain, observable artifact, no compute
cost — is hard to get out of a contrived test scenario.

The point is to show the SEP loading mechanism works on a non-trivial
server out-of-tree, not to grade model competence at HF training.

## Setup

- Server runs with `HF_JOBS_DRY_RUN=true` — server-side intercept
  absorbs `hf_jobs("uv", ...)` and `hf_jobs("run", ...)` calls and
  returns a synthetic "captured spec" response without contacting the
  HF API.
- Server's `instructions` field has been edited to drop the
  skills-pointer sentence (commit `9ed5f31`) so it shouldn't bias
  activation; watch for regressions if the branch moves.

## Findings

- All three clients PASS overall: skill activates, prescriptions land
  in the submitted script, dry-run intercept absorbs the side effect.
- Each client uses its native skill-read dispatch — `read_skill`
  (fast-agent), `read_mcp_resource` (codex), `load_skill` (goose) —
  direct evidence that `extensions["io.modelcontextprotocol/skills"]`
  + `skill://` URIs + `resources/read` is the actual cross-host
  contract.
- A naive prompt that says *"do not launch the job"* directly contradicts
  the `huggingface-llm-trainer` skill's directive #1
  (*"MUST create the training script AND submit the job immediately"*).
  Different hosts resolve that conflict differently — observed in
  early runs that some hosts followed the skill directive over the
  user instruction while fast-agent + claude held back at the plan
  stage. Reframing to a natural training request (skill directive
  aligned with user intent) eliminates the contamination, but the
  conflict-resolution divergence is itself a real signal worth its
  own scenario.
- Goose's agentic planning interleaves `todo__todo_write` calls with
  skill activation — a `gate_tools: [hf_jobs]` field in the scenario
  YAML is required to anchor the *skill-read-before-plan* criterion
  to the meaningful action; otherwise housekeeping calls are mistaken
  for the gate.

## Related

- [`huggingface-llm-trainer` skill source](https://github.com/huggingface/skills/tree/main/skills/huggingface-llm-trainer)
- Reproduce locally: [`run-scenario` skill — hf-jobs-plan sub-page](../../../.claude/skills/run-scenario/scenarios/hf-jobs-plan.md)
