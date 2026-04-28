# Scenario: transformers-js-demo

> **N=1 caveat.** Results below are single-trial. Pass-rate replication pending; treat individual outcomes as samples, not stable behavior.

**MCP server:** [`olaservo/hf-mcp-server@skills-over-mcp-experiment`](https://github.com/olaservo/hf-mcp-server/tree/skills-over-mcp-experiment) · **Scenario YAML:** [`experiments/scenarios/transformers-js-demo.yaml`](../../../experiments/scenarios/transformers-js-demo.yaml) · **Skill:** [`transformers-js`](https://github.com/huggingface/skills/tree/main/skills/transformers-js)

## What this probes

Code-output skill loading. The agent reads `transformers-js` (a
JavaScript-output skill bundling 7 reference files) and writes a
self-contained browser HTML demo. **No tool execution** — the artifact
is the agent's response itself. This swaps the loading mechanism's
target from a tool-call-shape skill (the previous three) to a
prose-output skill, and probes whether prominent in-body prescriptions
translate into the agent's output.

The three graded phrases come from the skill body specifically:

- `@huggingface/transformers` — the v4 package name. Untrained agents
  reach for the older `@xenova/transformers`.
- `pipeline()` — the API the skill leads with.
- `dispose()` — memory-management rule the skill flags with a ⚠️
  warning + capital MUST + bold formatting.

## Why this server

Authoritative knowledge for a JS library belongs near the registry of
that library's models — exercises the skills-as-resources idea where
the server attaches reference materials and the skill body points at
them. The 7 reference files (including official examples) are the
load-bearing part of this scenario, so the test is whether the host
follows the skill's pointers into those references when generating code.

## Findings

| Client + model | Activated? | Package | API | `dispose()` |
| :--- | :--- | :--- | :--- | :--- |
| fast-agent (claude-haiku-4-5) | yes | `@huggingface/transformers` | `pipeline()` | **missed** (39s wall) |
| codex (gpt-5.1-codex-mini) | yes | `@huggingface/transformers` | `pipeline()` | covered (30s wall) — **PASS overall** |
| goose (claude-sonnet-4-6) | yes | `@huggingface/transformers` | `pipeline()` | **missed** (~60s wall) |
| gemini-cli (gemini-2.5-flash) | **no** | wrong package | `pipeline()` (from training data) | missed |

Two distinct failure modes surface in the same scenario:

1. **Catalog-activation skipping** (gemini) — the host doesn't engage
   with `<available_skills>` at all this run, goes straight from
   `update_topic` → `write_file`. The protocol mechanism works for
   activation when the host engages with the catalog, but engagement
   itself is a host-side policy decision.
2. **Prescription skimming** (claude variants miss `dispose()`) —
   in-body emphasis on a specific rule (bold + ⚠️ + capital MUST)
   isn't sufficient to guarantee adherence even when the skill is
   read. claude-sonnet-4-6 missed it too.

Codex's pass on all three prescriptions is consistent with the same
model passing hf-jobs-plan and hf-train-with-monitoring. Whether
that reflects how `codex` ranks `<available_skills>` versus how
`gemini-cli` ranks them, or model-level differences in following
emphasized rules, the harness can't disambiguate from a single run.

Gemini-2.5-flash's skipping varies between runs — in
`hf-train-with-monitoring` it activated `huggingface-llm-trainer`
but missed the second skill; here it activated nothing. Suggests
sampling-temperature noise on top of whatever host-side
skill-ranking heuristic is in play.

## Open question

The dispose-rule miss is interesting on its own — *what makes a
SKILL.md prescription stick?* SKILL.md uses bold + ⚠️ + capital MUST
and still gets skimmed. Lower-priority follow-up: probe whether
reorganizing the rule (top of file, code-block-first, etc.) changes
adherence rates.

## Related

- Each agentic client's planning step (`todo__todo_write` for goose,
  `update_topic` for gemini-cli, `list_mcp_resources` for codex)
  fires before skill activation — the harness's plan evaluator needed
  a small "neutral tools" set so the `skill-read-before-plan`
  fallback gate doesn't fire on these. The set is empirical (one entry
  per observed client), not a normative claim.
- Reproduce locally: [`run-scenario` skill — transformers-js-demo sub-page](../../../.claude/skills/run-scenario/scenarios/transformers-js-demo.md)
