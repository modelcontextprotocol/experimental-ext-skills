# Scenario: pr-review

**Kind:** `pr-review` · **Server:** github-mcp-server :8082 · **YAML:** [`experiments/scenarios/pr-review.yaml`](../../../../experiments/scenarios/pr-review.yaml)

PR-review prompt run against `github-mcp-server` serving the
`pull-requests` skill as `skill://pull-requests/SKILL.md`. Probes
whether the client surfaces a resource-read at the tool-call boundary
before any mutating PR tool — the four hosts wrap that read differently
(`read_skill`, `read_mcp_resource`, `load_skill`, `activate_skill`),
which is the primary signal this scenario captures.

## Scaffold the PR

The scaffold script is idempotent — closes any open PR on
`feature/input-validation-enhancement`, rebuilds the branch, opens
fresh on `olaservo/code-review-subject`:

```bash
cd "${SUBJECT_REPO_DIR:-experiments/.workspace/code-review-subject}"
bash scripts/create-pr-input-validation.sh
```

Capture the new PR URL from the final stdout line. An exit-1 just
after `gh pr create` complaining "already exists" is not a failure —
the branch was still pushed fresh.

If the user passed `pr_number`, skip the scaffold and target that
existing open PR instead.

## Codex model on this scenario

Known-working combo on the default 200K-TPM OpenAI tier:
`CODEX_MODEL=gpt-5.1-codex CODEX_TIMEOUT_S=600`. The pr-review
scenario's `gpt-5.1-codex-mini` accumulates ~170K tokens of tool
output before writing comments and trips TPM limits repeatedly within
180s. (Plan scenarios are usually under 30s and `gpt-5.1-codex-mini`
works fine there.)

## Banner — `skill-read-before-write`

```bash
grep -B 1 -A 20 "skill-read-before-write" /tmp/verify-run.log
```

Five criteria to report:

- `skill-read-before-write`
- `create-pending-review`
- `add-comment(s)` with `count=N`
- `submit-pending-with-verdict` with `verdict=...`
- `no-single-shot-bypass` with `bypass_indices=[...]` if any

Plus diagnostics common to all scenarios:

- `Review URL: ...` line
- `Wall-clock: ...`

## Concurrency

Two clients running pr-review concurrently corrupts the URL report —
`_find_review_url` grabs the last review on the subject PR via `gh
api`, so another client posting during your run leaks into the URL
you return. Serialize pr-review runs.
