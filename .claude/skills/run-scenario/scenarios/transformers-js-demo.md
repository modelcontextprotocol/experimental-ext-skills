# Scenario: transformers-js-demo

**Kind:** `plan` · **Server:** hf-mcp-server :8083 (with `HF_JOBS_DRY_RUN=true`) · **YAML:** [`experiments/scenarios/transformers-js-demo.yaml`](../../../../experiments/scenarios/transformers-js-demo.yaml)

Code-output skill probe. The agent reads `transformers-js` (a JS-output
skill bundling 7 reference files) and writes a self-contained browser
HTML demo in its assistant response. There is no execution and no
target tool call — the artifact *is* the response text. Tests the
loading mechanism on a code-output skill rather than a tool-call-shape
skill, and probes whether prominent in-body prescriptions translate
into the agent's output.

The three graded phrases come from the skill body:

- `@huggingface/transformers` — the v4 package name. Untrained agents
  reach for the older `@xenova/transformers`.
- `pipeline()` — the API the skill leads with.
- `dispose()` — memory-management rule the skill flags with a ⚠️ warning.

## Banner — `skill-read-before-plan`

```bash
grep -B 1 -A 14 "skill-read-before-plan" /tmp/verify-run.log
```

Criteria to report:

- `skill-read-before-plan` (catalog activation)
- `plan-covers-prescriptions` with `missing=[...]` on failure — the
  three phrases above
- `references-read N` (informational; the skill ships 7 reference files)
- `Wall-clock: ...`

## Plan-evaluator neutral tools

Each agentic client's planning step (`todo__todo_write` for goose,
`update_topic` for gemini-cli, `list_mcp_resources` for codex) fires
before skill activation. The plan evaluator has a small per-client
"neutral tools" allowlist so the `skill-read-before-plan` fallback
gate doesn't fire on these. The set is empirical (one entry per
observed client), not normative.
