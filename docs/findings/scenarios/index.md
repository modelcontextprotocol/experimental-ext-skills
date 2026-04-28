# Cross-Client Scenarios

These scenarios run the same prompt across four MCP-aware clients
(fast-agent, gemini-cli, codex, goose) pointed at a server that exposes
skills via `extensions["io.modelcontextprotocol/skills"]` +
`skill://` resource URIs. Each scenario is a small **probe** of one
specific aspect of skills-over-MCP — not a benchmark of model quality.
The point is to see whether the loading mechanism behaves consistently
across hosts, and where host implementations diverge.

If you're new here, **start with [pr-review](pr-review.md)** — it's the
most-replicated scenario and demonstrates the canonical setup. The
other three are exploratory probes of specific mechanics; treat their
single-trial outcomes as samples, not stable behavior.

| Scenario | What it probes | MCP server | Maturity |
| :--- | :--- | :--- | :--- |
| [pr-review](pr-review.md) | Skill-access primitives — how the four host wrappers (`read_skill`, `read_mcp_resource`, `load_skill`, `activate_skill`) surface a skill read at the tool-call boundary, and whether wrappers that hide the read break server-side observability | github-mcp-server (tool-rich, widely-deployed proxy for real PR-review work) | Stable — multiple trials per client |
| [hf-jobs-plan](hf-jobs-plan.md) | Plan-kind output — whether skill conventions reliably shape a structured artifact (PEP 723 UV script with HF_TOKEN forwarding + Trackio instrumentation) under a server-side dry-run intercept | hf-mcp-server (real-world need for structured launch artifacts; intercept lets us grade without spending compute) | Exploratory — N=1 |
| [hf-train-with-monitoring](hf-train-with-monitoring.md) | Cross-skill composition — whether agents independently activate a second skill (`huggingface-trackio`) named only by topic in the first skill (`huggingface-llm-trainer`), driven by `<available_skills>` catalog visibility alone | hf-mcp-server (same domain as hf-jobs-plan, varies the *composition* axis while holding server + task constant) | Exploratory — N=1 |
| [transformers-js-demo](transformers-js-demo.md) | Code-output skill — whether a skill bundling 7 reference files reliably steers code generation onto the right API (`@huggingface/transformers`, `pipeline()`, `dispose()`) when untrained agents tend to hallucinate older APIs | hf-mcp-server (authoritative knowledge near the model registry — exercises the skills-as-resources idea) | Exploratory — N=1 |

## How to read these pages

Each scenario page has the same structure:

1. **What this probes** — the specific aspect of skills-over-MCP being tested
2. **Why this server** — what made this MCP server the right substrate
3. **Setup** — pointer to the scenario YAML and any server-side flags
4. **Findings** — what happened, per client
5. **Open questions** — what's worth probing next

For the runnable harness and full results JSON, see
[`experiments/`](../../../experiments/). To reproduce a scenario
locally, the [`run-scenario`](../../../.claude/skills/run-scenario/SKILL.md)
skill walks through preflight → run → report.

## Future probes

- **File-based skills as a baseline** — comparing the same scenarios
  against agents loading skills from a local directory (no MCP) would
  let us isolate what the MCP loading path adds vs. what's just
  "having the skill in context." Tracked separately.
