# Problem Statement

[Agent Skills](https://agentskills.io/home) support in AI applications demonstrates demand for rich workflow instructions, but there's no convention for exposing equivalent functionality through MCP primitives.

## Current Limitations

- **Server instructions load only at initialization** — new or updated skills require re-initializing the server
- **Complex workflows exceed practical instruction size** — some skills require hundreds of lines of markdown with references to bundled files, scripts, and examples
- **No discovery mechanism** — users installing MCP servers from a registry don't know if there's a corresponding skill they should also install
- **Multi-server orchestration** — skills may need to coordinate tools from multiple servers, which doesn't fit the single-server instruction model

## Broader Context

Skills discoverability is a specific instance of a more general MCP challenge: context-as-resources discoverability and standardization of client host behavior around non-tool primitives. The ecosystem has largely optimized for tools, and patterns for how clients discover and consume other forms of context — including skills — remain underdeveloped. Solutions in this space are likely to have implications beyond skills alone.

## Key Use Cases

See [use-cases.md](use-cases.md) for detailed use cases and community input. In summary:

1. **Complex Workflow Orchestration** — Multi-step workflows requiring 875+ lines of instruction (e.g., [mcpGraph](https://github.com/TeamSparkAI/mcpGraph))
2. **Conditional Workflows** — Branching instructions dynamically loaded based on context
3. **Multi-Server Composition** — Skills leveraging tools from multiple off-the-shelf servers
4. **Progressive Disclosure** — Skills broken into linked file sets, loaded on demand

## Open Questions

See [open-questions.md](open-questions.md) for the full list of unresolved questions with community input.
