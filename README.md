# Skills Over MCP Working Group

> ⚠️ **Experimental** — This repository is an incubation space for the Skills Over MCP Working Group. Contents are exploratory and do not represent official MCP specifications or recommendations.

**Charter:** [modelcontextprotocol.io/community/skills-over-mcp/charter](https://modelcontextprotocol.io/community/skills-over-mcp/charter) — mission, scope, membership, active work items, and success criteria.
**Project board:** [Skills Over MCP WG](https://github.com/orgs/modelcontextprotocol/projects/38/views/1)
**Meeting notes:** [Skills Over MCP WG discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg)
**Discord:** [#skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084)

## Why Skills Over MCP?

MCP servers give agents tools, but tools alone are insufficient for complex workflows — tool descriptions tell an agent *what* a tool does, not *how to orchestrate* multiple tools to achieve a goal. Skills bridge this gap. They are structured "how-to" knowledge: multi-step workflows, conditional logic, and orchestration instructions that can run to hundreds of lines.

Skills are *context*, and MCP is a *context protocol*. Agents already connect to remote services over MCP to get tools — they can get the know-how to use those tools through the same channel. A remote MCP server can serve both its tools and the instructions for using them together, as a single atomic unit. This also enables automatic discovery (connect to a server, find its skills), dynamic updates (server-side changes flow without reinstall), multi-server composition (skills orchestrating tools across servers), and enterprise distribution (RBAC, multi-tenant, version-adaptive content) — all through infrastructure MCP servers already provide.

See [why-and-when.md](docs/why-and-when.md) for the full value proposition and a guide for when MCP distribution applies vs. simpler alternatives.

## Problem Statement

Native "skills" support in host applications demonstrates demand for rich workflow instructions, but there's no convention for exposing equivalent functionality through MCP primitives. Current limitations include:

- **Server instructions load only at initialization** — new or updated skills require re-initializing the server
- **Complex workflows exceed practical instruction size** — some skills require hundreds of lines of markdown with references to bundled files
- **No discovery mechanism** — users installing MCP servers don't know if there's a corresponding skill they should also install
- **Multi-server orchestration** — skills may need to coordinate tools from multiple servers

See [problem-statement.md](docs/problem-statement.md) for full details.

## Repository Contents

| Document | Description |
| :--- | :--- |
| [Problem Statement](docs/problem-statement.md) | Current limitations and gaps |
| [Why Skills Over MCP?](docs/why-and-when.md) | Value proposition and decision guide |
| [Use Cases](docs/use-cases.md) | Key use cases driving this work |
| [Approaches](docs/approaches.md) | Approaches being explored (not mutually exclusive) |
| [Open Questions](docs/open-questions.md) | Unresolved questions with community input |
| [Experimental Findings](docs/experimental-findings.md) | Results from implementations and testing |
| [Related Work](docs/related-work.md) | SEPs, implementations, and external resources |
| [Decision Log](docs/decisions.md) | Record of key decisions with context and rationale |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to participate.
