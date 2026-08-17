# Experiments

Scenario harnesses for exercising SEP-2640 v1 (`skills/list` + `skills/get` + `resources/directory/read`) against real hosts and servers. This tree was restarted from scratch for the v1 protocol methods; the earlier multi-host harnesses (fast-agent, hermes, HF demos) built against the index.json draft live on the `feature/resource-sep-early-findings` branch for reference.

Current harnesses:

- [`goose/`](goose/) — drives the goose CLI (branch `skills-sep-2640-port` of `olaservo/goose`) against a running SEP-2640 server.

Conventions shared by all harnesses: the runner never spawns the MCP server — it connects to an already-running server at the scenario's `mcp_server.endpoint` — and the scenario file is always an explicit `--scenario <path>` argument.
