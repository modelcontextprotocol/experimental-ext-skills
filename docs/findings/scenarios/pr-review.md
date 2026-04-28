# Scenario: pr-review

> **N=5 caveat.** Per-cell pass rates below aggregate 5 trials per
> client, all run 2026-04-27. Treat as samples, not fixed behavior;
> wrapper-level outcomes (which dispatch primitive each fork emits)
> are stable across trials, criterion-level outcomes are not.

**MCP server:** [`olaservo/github-mcp-server@add-agent-skills`](https://github.com/olaservo/github-mcp-server/tree/add-agent-skills) · **Scenario YAML:** [`experiments/scenarios/pr-review.yaml`](../../../experiments/scenarios/pr-review.yaml) · **Skill:** `pull-requests` (served as `skill://pull-requests/SKILL.md`)

## What this probes

Skill-access primitives at the tool-call boundary. The same PR-review
prompt runs across fast-agent, gemini-cli, codex, and goose — each
fork wraps the underlying `resources/read` differently. The
`skill-read-before-write` criterion checks whether a resource read is
visible at the tool-call layer *before* any mutating PR tool. What
each fork actually emits matters:

- **fast-agent** → `read_skill(path=...)` — host-side wrapper that invokes `get_resource` underneath
- **codex** → `read_mcp_resource(uri=...)` — the MCP primitive directly
- **goose** → `load_skill(name=...)` — name-based helper; no `read_mcp_resource` visible at the tool boundary
- **gemini-cli** → `activate_skill(name=...)` — same pattern as goose

Two of the four (`load_skill`, `activate_skill`) hide the underlying
resource read from the tool-call boundary — whether they internally
invoke `read_mcp_resource` is unobservable from the agent or server
side. Wrappers that hide the read break server-side features keyed on
resource access: subscription-based updates (`resources/updated`),
access-based caching, telemetry.

## Why this server

`github-mcp-server` is tool-rich, widely deployed, and PR review is a
well-understood workflow with clear ground truth — that combination
makes adherence measurable. The skill teaches a multi-step orchestration
(`create_pending_review` → `add_comment_to_pending_review` (Nx) →
`submit_pending_review`); the host either follows that shape or it
doesn't, and the failure modes are easy to read.

## Setup

- Server runs with `DISABLE_INSTRUCTIONS=true` — required contamination
  control. The server's `instructions` field would otherwise leak skill
  activation hints; the only signal the model should get is the
  `<available_skills>` catalog.
- Each trial scaffolds a fresh PR via
  [`create-pr-input-validation.sh`](https://github.com/olaservo/code-review-subject)
  on `feature/input-validation-enhancement` so the subject under review
  is identical across trials and runs are independent.
- Trials are run sequentially (never two clients concurrent against
  the same server) because `_find_review_url` collides on the last
  review for the PR otherwise.

## Findings

Per-criterion pass rate (n/5 per client). Models per
[scenarios YAML](../../../experiments/scenarios/pr-review.yaml).

| Client | Wrapper observed | skill-read-before-write | create-pending-review | add-comment(s) | submit-pending-with-verdict | no-single-shot-bypass | **overall** |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| fast-agent | `read_skill(path=...)` | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | **5/5** |
| goose | `load_skill(name=...)` | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | **5/5** |
| gemini-cli | `activate_skill(name=...)` | 2/5 | 5/5 | 5/5 | 5/5 | 5/5 | **2/5** |
| codex | `read_mcp_resource(uri=...)` | 2/5 | 4/5 | 2/5 | 0/5 | 1/5 | **0/5** |

Sample wall-clocks (median per client): fast-agent ~48s, gemini-cli
~43s, codex ~165s, goose ~206s. Codex and goose run substantially
longer because their default tool-output verbosity drives more tokens
through the model.

### Three distinct outcome patterns, not a continuum

**fast-agent and goose: clean PASS.** Both hit all five criteria on
every trial. Wrapper choice (`read_skill` vs `load_skill`) doesn't
predict reliability — what matters is that the wrapper is *plumbed
through to the model* such that activation is the model's natural
first move. Both helpers shipped with this property in their
respective forks.

**gemini-cli: workflow correct, activation flaky.** All five trials
posted a real review with the right shape — pending review created,
multiple inline comments (5–10 per trial), proper REQUEST_CHANGES
verdict, no single-shot bypass. The *only* failure mode was
`skill-read-before-write` itself: 3/5 trials reached the mutating
calls without an `activate_skill` visible in the tool-call stream.
That's a real signal — gemini-cli's `<available_skills>` catalog
appears to feed enough skill content into the model's prompt that
the workflow shape is internalized even when explicit activation is
skipped. From a SEP perspective this is the worst possible outcome:
the model behaves correctly *without* the observable resource read
that downstream features (telemetry, subscription, audit) depend on.

**codex: workflow shape broken.** A different failure mode entirely.
0/5 trials submitted properly (`submit-pending-with-verdict` 0/5,
verdict always `None`); 4/5 triggered single-shot bypass — the SEP
anti-pattern of `pull_request_review_write(method=create, event=...)`
in one call. When create-pending succeeds (4/5) the agent attaches at
most one comment (count=1 in 2/5 trials, count=0 in 3/5) before
attempting a malformed submit-shape. The skill is read in 2/5 trials,
but reading the skill doesn't fix the submission shape — codex's
`gpt-5.1-codex` consistently produces a different mental model of
"submit a review" that bypasses the staged-review workflow even when
the skill body says otherwise.

### Behavioral observations from N=5

- **fast-agent self-corrects mid-flow:** trial 1 emitted two
  `submit_pending` calls (verdicts `REQUEST_CHANGES` then `COMMENT`);
  the second is a no-op against an already-submitted review. The
  banner reports the first, which is the one that actually landed on
  the PR. Doesn't affect overall PASS but worth knowing — the agent
  sometimes attempts a verdict revision after the workflow has closed.
- **goose's planning interleaves with skill activation:** every trial
  emits at least one `todo__todo_write` before `load_skill`. Without
  `gate_tools: [pull_request_review_write, add_comment_to_pending_review]`
  in the scenario YAML's evaluator config (or the equivalent for
  pr-review's `MUTATING_TOOLS` list), the implicit fallback gate would
  treat the todo as the gate and fail goose for "skill-read after first
  call." `MUTATING_TOOLS` in the pr-review evaluator already does this;
  no scenario change needed.
- **codex's bypass pattern is consistent across trials:** the
  `bypass_indices` are clustered (e.g. `[6, 7, 8, 9]` in trial 4,
  `[7, 8, 9, 10]` in trial 5) — the agent fires a sequence of
  malformed `pull_request_review_write` calls in rapid succession,
  not a single mistaken call. This points at the model emitting a
  workflow shape it learned elsewhere and the wrapper not coercing
  it back into the staged-review path.

### Comparison to prior single-trial findings

The 2026-04-23 single-trial findings reported goose FAIL and gemini-cli
FAIL on `skill-read-before-write`. With N=5 on 2026-04-27:

- **goose flipped to consistent PASS (5/5).** The fork's `load_skill`
  wrapper now reliably surfaces a name-matching dispatch ahead of
  mutating calls. Either the fork tightened up between dates or the
  earlier observation was a single-trial flake.
- **gemini-cli held the FAIL pattern but at a flake rate (2/5).** Not
  a stable FAIL — the activation works ~40% of the time. Worth a
  larger N before claiming the rate.

This is the kind of shift that vindicates moving from N=1 to repeated
sampling: a single trial would have led to "goose can't dispatch
skill-reads," which is no longer accurate.

## Open question

Should SEP require that skill access surface `read_mcp_resource` at
the tool-call layer? If yes, ergonomic wrappers (`load_skill`,
`activate_skill`) still need to emit observable primitive calls. If
no, forks are free to hide the primitive but portability suffers for
server-side features that depend on observing resource reads — and
the gemini-cli pattern (correct workflow without activation visible)
becomes much harder to interpret as either pass or fail.

## Related

- Per-client criterion code: [`experiments/harnesses/_common/evaluators/pr_review.py`](../../../experiments/harnesses/_common/evaluators/pr_review.py) — `SKILL_READ_ALIASES` encodes the harness author's editorial judgment about which dispatches satisfy the SEP per fork
- Reproduce locally: [`run-scenario` skill — pr-review sub-page](../../../.claude/skills/run-scenario/scenarios/pr-review.md)
- Per-trial logs (transient, this run): `/tmp/runs/pr-review/{client}-{N}.log`
