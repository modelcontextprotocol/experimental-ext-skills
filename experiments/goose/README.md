# goose scenario harness

Runs one scenario against the goose CLI and a running SEP-2640 server, and records two things: what was **discoverable** (the server's declared capability and `skills/list` names, probed directly on the wire, plus whether the model could enumerate the skills from its own instructions) and what was **used** (every tool call goose made, which skills were loaded, which resources were read).

## Prerequisites

- A goose build with skills-over-MCP support: branch `skills-sep-2640-port` of `olaservo/goose` (`cargo build -p goose-cli`). Point the harness at the binary with `--goose` or `GOOSE_BIN`.
- A running SEP-2640 server. Reference: draft PR [github/github-mcp-server#3046](https://github.com/github/github-mcp-server/pull/3046), branch `olaservo:feature/agent-skills-v2` — `go build -o github-mcp-server-skills.exe ./cmd/github-mcp-server`, then `./github-mcp-server-skills.exe http --port 8082`. The harness never starts the server; it connects to the scenario's `mcp_server.endpoint`.
- Auth: the scenario's `mcp_server.bearer_cmd` (default `gh auth token`) is run once and sent as a `Authorization: Bearer …` header by both the wire probe and goose.
- An LLM provider goose can use. The harness writes an isolated goose config (nothing in your real config is touched); provider credentials come from the system keyring or provider env vars as usual. Defaults: `anthropic` / `claude-sonnet-4-6`, overridable per scenario.

## Run

```
uv run --with pyyaml run_scenario.py --scenario scenarios/discovery-and-load.yaml
```

The result JSON lands in `results/`, the isolated goose config root in a temp dir (path printed; it contains the bearer token, delete when done). Exit code is 0 only if every check passed.

## Scenario format

```yaml
name: discovery-and-load
mcp_server:
  endpoint: http://localhost:8082/mcp
  bearer_cmd: gh auth token        # optional, this is the default
provider: anthropic                # optional
model: claude-sonnet-4-6           # optional
prompt: |
  ...single user turn given to goose...
expect:
  extension_declared: true         # server declares io.modelcontextprotocol/skills
  discovered: [create-issue]       # ⊆ wire skills/list names AND each appears in the reply text
  loaded: [create-issue]           # ⊆ the `name` args of load_skill calls goose made
  tools: [load_skill]              # optional, ⊆ tool names goose called
```

Every `expect` key is optional; omitted keys are recorded but not asserted. The harness grades nothing else — it logs the full tool-call trace and the reply tail so a human can read what actually happened.
