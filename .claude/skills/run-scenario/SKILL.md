---
name: run-scenario
description: Run a Skills-over-MCP cross-client scenario end-to-end against the right MCP server, execute the named client's harness, and report the criteria banner. Branches on scenario kind — `pr-review` runs against `github-mcp-server` and scaffolds a fresh PR; `plan` scenarios (hf-jobs-plan, hf-train-with-monitoring, transformers-js-demo) run against `hf-mcp-server` with `HF_JOBS_DRY_RUN=true`. Use when asked to run a scenario, reproduce Scenarios #1–#4, or test a client (fast-agent, codex, goose).
---

# run-scenario

One end-to-end scenario run against one client. Codifies the runbook
(preflight → scaffold → run → report) and the guardrails that aren't
obvious from reading the harness code alone.

## Inputs

- **client** (required): `fast-agent` | `codex` | `goose`.
- **scenario** (optional): scenario id (YAML filename stem). Default: `pr-review`.
- **pr_number** (optional, pr-review only): target a specific open PR
  instead of the auto-detected head of `feature/input-validation-enhancement`.

## Scenarios

The scenario's `kind` field decides which MCP server to talk to and
whether the scaffold step runs. After preflight, **read the matching
sub-page below** for scenario-specific scaffold/banner/notes — sub-pages
are loaded on demand only.

| Scenario | Kind | Server | Sub-page | Probe |
| :--- | :--- | :--- | :--- | :--- |
| `pr-review` | `pr-review` | github-mcp-server :8082 | [scenarios/pr-review.md](scenarios/pr-review.md) | Skill-access primitives across host wrappers |
| `hf-jobs-plan` | `plan` | hf-mcp-server :8083 | [scenarios/hf-jobs-plan.md](scenarios/hf-jobs-plan.md) | Plan-kind output (PEP 723 + Trackio) under dry-run |
| `hf-train-with-monitoring` | `plan` | hf-mcp-server :8083 | [scenarios/hf-train-with-monitoring.md](scenarios/hf-train-with-monitoring.md) | Cross-skill composition via catalog visibility |
| `transformers-js-demo` | `plan` | hf-mcp-server :8083 | [scenarios/transformers-js-demo.md](scenarios/transformers-js-demo.md) | Code-output skill (HTML/JS, no execution) |

For an outside-reader narrative on what each scenario probes and why
that specific MCP server, see [docs/findings/scenarios/index.md](../../../docs/findings/scenarios/index.md).

## Workspace assumptions

The skill resolves cross-repo paths from these env vars. First-time
contributors run `experiments/scripts/bootstrap.sh` to populate
`experiments/.workspace/` (git-ignored) with the canonical clones;
existing users with sibling clones export the env vars to point at
their own checkouts instead.

| Variable | Default | What it points at |
| :--- | :--- | :--- |
| `SUBJECT_REPO_DIR` | `experiments/.workspace/code-review-subject` | Clone of `olaservo/code-review-subject` (pr-review only — has the scaffold script) |
| `MCP_SERVER_DIR` | `experiments/.workspace/github-mcp-server` | Clone of `olaservo/github-mcp-server@add-agent-skills` (built binary lives here) |
| `HF_MCP_SERVER_DIR` | `experiments/.workspace/hf-mcp-server` | Clone of `olaservo/hf-mcp-server@skills-over-mcp-experiment` (`pnpm build` artifacts at `packages/app/dist/`) |
| `MCP_SERVER_URL` | `http://localhost:8082/mcp` | Where the github-mcp-server listens (pr-review) |
| `HF_MCP_SERVER_URL` | `http://localhost:8083/mcp` | Where the hf-mcp-server listens (plan scenarios) |
| `AGENT_SKILLS_ENV_FILE` | unset | Absolute path to a `.env` containing `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `HF_TOKEN` |

Defaults are relative to the WG repo root, so they work as-is when
Claude Code's CWD is somewhere inside this repo.

## Workflow

### 1. Preflight

Branches on scenario kind. Read `experiments/scenarios/<scenario>.yaml`
to determine kind + endpoint.

**pr-review (kind: `pr-review`)** — needs `github-mcp-server` on `:8082`:

```bash
curl -s -o /dev/null -w "%{http_code}" "${MCP_SERVER_URL:-http://localhost:8082/mcp}"
```
Expect `200`. If not running, launch from `$MCP_SERVER_DIR`:
```bash
cd "${MCP_SERVER_DIR:-experiments/.workspace/github-mcp-server}"
GITHUB_PERSONAL_ACCESS_TOKEN=$(gh auth token) \
  DISABLE_INSTRUCTIONS=true \
  ./github-mcp-server.exe http --port 8082 --toolsets=all
```
`DISABLE_INSTRUCTIONS=true` is a required contamination control — the
server's `instructions` field would otherwise leak activation hints;
the only signal the model should get is the `<available_skills>` catalog.

**plan kind (hf-jobs-plan, hf-train-with-monitoring, transformers-js-demo)** —
needs `hf-mcp-server` on `:8083` with the dry-run intercept:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"preflight","version":"0"}}}' \
  --max-time 5 "${HF_MCP_SERVER_URL:-http://localhost:8083/mcp}"
```
Bare GET returns 400; the JSON-RPC POST above returns 200 when the
server is healthy. If not running, launch from `$HF_MCP_SERVER_DIR`:
```bash
cd "${HF_MCP_SERVER_DIR:-experiments/.workspace/hf-mcp-server}"
set -a && . "$AGENT_SKILLS_ENV_FILE" && set +a
DEFAULT_HF_TOKEN="$HF_TOKEN" \
  WEB_APP_PORT=8083 \
  HF_JOBS_DRY_RUN=true \
  node packages/app/dist/server/streamableHttp.js
```
`HF_JOBS_DRY_RUN=true` is required — `hf_jobs("uv", ...)` and
`hf_jobs("run", ...)` will otherwise submit real training jobs to the
account behind `HF_TOKEN`. The intercept returns a synthetic "captured
spec" response without contacting the API; the agent's submission
shape (script, secrets, hardware tier) is still graded from the call
args, just not executed.

The hf-mcp-server doesn't currently have a `DISABLE_INSTRUCTIONS` knob —
its `instructions` field has been edited to drop the skills-pointer
sentence (commit `9ed5f31` on `skills-over-mcp-experiment`) so it
shouldn't bias activation, but watch for regressions if the branch
moves.

**LLM API keys.** If `$AGENT_SKILLS_ENV_FILE` is exported, use it;
otherwise ask the user for the path (do not cache in Claude memory —
it's per-user, not portable across sessions/machines):
```bash
set -a && . "$AGENT_SKILLS_ENV_FILE" && set +a
```
The codex runner instead expects the file via `uv run --env-file
"$AGENT_SKILLS_ENV_FILE"` — its child process needs the env, not the
parent shell. Plan scenarios additionally need `HF_TOKEN` exported so
the harness's `setup_run` can resolve auth for the `hf_skills` server.

### 2. Scaffold (pr-review only)

See [scenarios/pr-review.md](scenarios/pr-review.md). Skip for plan-kind
scenarios.

### 3. Run the client harness

Per-client invocation from `experiments/harnesses/<client>/`. Always
redirect to a log file so the criteria banner survives the Bash-tool
30 000-char output truncation.

Each harness now runs the agent in a hermetic tempdir, so any
`write_file`/`write_text_file`/shell-curl-output goes to `$TEMP/skills-e2e-*`
and is discarded on exit — no more `*.html`, `dolly_*.json`, etc.
accumulating in the harness directories.

The examples below use one scenario YAML per client; substitute
`../../scenarios/<scenario>.yaml` for the scenario you're running.

**fast-agent** — Python library-embed. Windows: prepend
`PYTHONIOENCODING=utf-8 PYTHONUTF8=1` so Rich's block-drawing
characters don't crash the cp1252 console:
```bash
cd experiments/harnesses/fast-agent
# pr-review:
GITHUB_TOKEN=$(gh auth token) ANTHROPIC_API_KEY=... \
  uv run agent.py ../../scenarios/pr-review.yaml >/tmp/verify-run.log 2>&1
# plan kind:
HF_TOKEN=hf_xxx ANTHROPIC_API_KEY=... \
  uv run agent.py ../../scenarios/hf-jobs-plan.yaml >/tmp/verify-run.log 2>&1
echo "exit=$?"
```
Override the model with `FAST_AGENT_MODEL=<id>` to probe different
tiers without editing the scenario YAML.

**codex** — Python subprocess driving a built Rust binary. Loads env
via `--env-file` so the codex child process gets `OPENAI_API_KEY`
(mirrored to `CODEX_API_KEY` to force API-key auth over any cached
ChatGPT session) along with `HF_TOKEN`/`GITHUB_TOKEN`:
```bash
cd experiments/harnesses/codex
# pr-review:
GITHUB_TOKEN=$(gh auth token) \
  uv run --env-file "$AGENT_SKILLS_ENV_FILE" agent.py \
  ../../scenarios/pr-review.yaml >/tmp/verify-run.log 2>&1
# plan kind (HF_TOKEN sourced via --env-file):
uv run --env-file "$AGENT_SKILLS_ENV_FILE" agent.py \
  ../../scenarios/hf-jobs-plan.yaml >/tmp/verify-run.log 2>&1
echo "exit=$?"
```
Codex's TPM-tier sensitivity is scenario-specific — see
[scenarios/pr-review.md](scenarios/pr-review.md) for the
known-working `CODEX_MODEL` combo on the default 200K-TPM tier.

**goose** — Python subprocess driving `goose run --output-format
stream-json`. The harness writes a hermetic `GOOSE_PATH_ROOT` tempdir
with the MCP extension pre-configured; the user's `~/.config/goose/`
is never touched:
```bash
cd experiments/harnesses/goose
# pr-review:
GITHUB_TOKEN=$(gh auth token) ANTHROPIC_API_KEY=... \
  uv run agent.py ../../scenarios/pr-review.yaml >/tmp/verify-run.log 2>&1
# plan kind:
HF_TOKEN=hf_xxx ANTHROPIC_API_KEY=... \
  uv run agent.py ../../scenarios/hf-train-with-monitoring.yaml >/tmp/verify-run.log 2>&1
echo "exit=$?"
```

### 4. Report

Grep the log for the banner. The banner-greppable label and per-criterion
list depend on scenario kind — see the scenario sub-page for the exact
list to expect:

- `scenarios/pr-review.md` — banner label `skill-read-before-write`
- `scenarios/hf-jobs-plan.md`, `hf-train-with-monitoring.md`,
  `transformers-js-demo.md` — banner label `skill-read-before-plan`

Common to all kinds, also report:

- Any calls under *Tool calls outside prescribed workflow* —
  informational, not criterion failures.
- Self-correction patterns (e.g. `delete_pending` then re-create,
  re-reading the skill mid-task) — worth flagging as behavioral observations.
- `Wall-clock: ...` line.

## Constraints

- **Never run two client harnesses concurrently against the same
  server.** For pr-review they share the subject PR — `_find_review_url`
  grabs the last review on the PR via `gh api`, so another client
  posting during your run leaks into the URL you report. For plan
  kind, concurrent runs may interleave dry-run intercept logs and
  confuse server-side telemetry. Each client's tool-call history is
  process-local and safe; the URL and any criterion-affecting server
  state isn't.

- **Codex binary**: install via `cargo install --git
  https://github.com/olaservo/codex.git --branch skills-over-mcp
  --locked codex-cli`. That puts `codex` on PATH at
  `~/.cargo/bin/codex`; the harness's `shutil.which("codex")` picks
  it up. If your cargo prefix is non-default (e.g. `D:` to avoid
  filling `C:`), set `CODEX_BIN=/abs/path/codex.exe` — `which` only
  checks PATH.

- **Goose binary**: install via `cargo install --git
  https://github.com/olaservo/goose.git --branch mcp-skills-sep
  --no-default-features --features rustls-tls --locked goose-cli`.
  Override path with `GOOSE_BIN=/abs/path/goose[.exe]`.

- **Do not modify** `fastagent.config.yaml` or `~/.codex/config.toml`
  to reach the MCP server. All runners inject server config in-memory
  (codex via `-c` flags, goose via temp `config.yaml`); global config
  edits create hidden state that contaminates future runs. fast-agent's
  `fastagent.config.yaml` IS in-tree but pre-declares both
  `github_skills` and `hf_skills` servers — the scenario YAML's
  `mcp_server.alias` selects which one.

- **Single-trial caveat.** Treat individual outcomes as samples,
  not stable behavior. Run a second pass before reporting "the model
  does X" rather than "the model did X this run."

## After the run

- All criteria PASS reproduces the corresponding row of
  `docs/findings/scenarios/<scenario>.md` for this client + scenario + model.
- Failures: the banner's per-criterion diagnostics (`count=0`,
  `verdict=None`, `single_shot_indices=[N]`, `missed=[...]`)
  point at the cause. Attach the `/tmp/verify-run.log` tail to the report.
