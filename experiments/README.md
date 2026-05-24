# Experiments

Reproducible end-to-end runs that validate the Skills-over-MCP SEP across
multiple clients and servers. Each run produces an activation signature
and workflow-adherence check against a real MCP server on a real subject
repo — not a reasoning paraphrase.

Per-scenario writeups live at [`docs/findings/scenarios/`](../docs/findings/scenarios/index.md)
(what each one probes, why each MCP server, results per host). External
implementations and cross-cutting community findings live at
[`docs/experimental-findings.md`](../docs/experimental-findings.md).
This directory holds the runnable pieces.

## Layout

```
experiments/
├── scenarios/                 # scenario configs (YAML, language-agnostic)
│   └── <id>.yaml
├── harnesses/                 # one runnable harness per client
│   ├── _common/               # shared evaluator + scenario/PR/report plumbing
│   │   ├── evaluator.py       # single source of truth for the five criteria
│   │   └── tests/             # pytest suite — `uv run ... -m pytest _common/tests/`
│   ├── codex/ fast-agent/ goose/
│   │   └── agent.py           # client-specific spawn + tool-call extraction
├── results/                   # run outputs, git-ignored
└── README.md
```

Pass criteria and per-client skill-read aliases live in
`harnesses/_common/evaluator.py`. Each harness produces a
`list[tuple[name, args]]` from its client's native event stream and
delegates scoring there, so the five-criterion check is identical
across clients.

**Scenarios** are pure data — the prompt template, target repo, skill URI.
Every client (Fast-Agent, Goose, Codex) reads the same YAML and
substitutes `{pr_number}` + `{repo}`. Pass criteria and the mutating
tool set are hardcoded in each harness since they're workflow invariants,
not per-scenario knobs.

**Per-client runners** live in each client's own fork (e.g.
`olaservo/fast-agent:experimental/skills-over-mcp` has the Python runner
at `scripts/skills_e2e_agent/`). They need the client's build system so
they stay with the client.

**Scaffolding scripts** (that produce the PR under review) live in the
subject repo — e.g. `olaservo/code-review-subject:scripts/create-pr-*.sh`.
Subject + scaffolder ship together.

## Conventions

- **One YAML per scenario.** Filename matches `id`.
- **Placeholders** in `prompt_template` use `{pr_number}` and `{repo}`
  (curly-brace, no spaces). Every client's runner substitutes these.
- **Results** go under `results/<ISO-timestamp>-<scenario-id>-<client>-<model>.json`.
  Git-ignored — aggregation is a separate pass.
- **Scenario path is a required positional argument** to each client's
  runner, not an env var or glob default. Keeps each run's inputs
  visible in shell history and CI logs.
- **Client runners do not inject a custom system prompt.** Each client
  falls through to its CLI's native default so contamination matches a
  vanilla user of that CLI. The scenario's `prompt_template` is the only
  task-level signal every client gets.
- **Per-client models** live in the scenario YAML under `models:` as a
  client-id → vendor-specific-identifier map. Picking matching speed
  tiers (haiku / flash / mini) across vendors is a cross-vendor judgment
  call and belongs in the scenario, not in client config.

## Running a scenario

The end-to-end runbook (preflight, scaffold, run, report) lives in
[`.claude/skills/run-scenario/SKILL.md`](../.claude/skills/run-scenario/SKILL.md).
A Claude Code session with CWD inside this repo picks up the skill
automatically — *"run Scenario #1 on fast-agent"* triggers the full
flow.

### First-time setup

The harnesses need two external pieces: the subject repo (for the
scaffold script) and the GitHub MCP server (for the binary that ships
the `pull-requests` skill). `experiments/scripts/bootstrap.sh` clones
them into `experiments/.workspace/` (git-ignored):

```bash
bash experiments/scripts/bootstrap.sh
```

Codex and goose are installed via `cargo install --git` from their
fork branches — see SKILL.md for the exact commands.

### Path conventions

The harnesses and the run-scenario skill resolve cross-repo paths from
env vars, with defaults that match `bootstrap.sh`:

| Variable | Default | Points at |
| :--- | :--- | :--- |
| `SUBJECT_REPO_DIR` | `experiments/.workspace/code-review-subject` | `olaservo/code-review-subject` |
| `MCP_SERVER_DIR` | `experiments/.workspace/github-mcp-server` | `olaservo/github-mcp-server@add-agent-skills` |
| `MCP_SERVER_URL` | `http://localhost:8082/mcp` | running MCP server |
| `AGENT_SKILLS_ENV_FILE` | unset | `.env` with provider keys |

If you keep the dependency repos as sibling clones (rather than under
`.workspace/`), export those env vars to point at your checkouts.

### Manual run

If you'd rather drive a harness directly, scaffold the PR first and
then invoke one client's `agent.py` with the scenario YAML as a
positional argument:

```bash
# 1. Scaffold a fresh PR (idempotent).
bash "$SUBJECT_REPO_DIR/scripts/create-pr-input-validation.sh"

# 2. Run one client's harness — example: fast-agent.
cd experiments/harnesses/fast-agent
ANTHROPIC_API_KEY=... GITHUB_TOKEN=$(gh auth token) \
  uv run agent.py ../../scenarios/pr-review.yaml
```

`PR_NUMBER` is auto-detected from the subject repo's canonical head
branch; set `PR_NUMBER` explicitly to target a specific PR.
