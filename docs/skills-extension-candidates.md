# Skills Extension Candidates

A tracker of MCP servers, dev tools, SDKs, and skills repositories that are candidates for adopting the skills extension proposed in [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

**Inclusion criterion.** An entry belongs here if it already ships skills in some non-MCP form (separate install path, plugin marketplace, framework-native provider), pairs an MCP server with a separate skills repo, or has an in-flight SEP-2640 implementation.

> See also [**client-mcp-support.md**](client-mcp-support.md) for the matching client-side survey: which open-source MCP hosts already let the model load resources by URI (the prerequisite for any client to consume what these candidates would expose).

## Snapshot

| Server | Repo | Author / Org | Issue/PR tracker | Notes |
| :--- | :--- | :--- | :--- | :--- |
| FastMCP 3.0 Skills | [jlowin/fastmcp](https://github.com/jlowin/fastmcp) — [docs](https://gofastmcp.com/servers/providers/skills) | FastMCP | [#2694](https://github.com/jlowin/fastmcp/issues/2694) | Framework with its own native skills provider using MCP Resources; doesn't yet reflect SEP-2640 |
| chrome-devtools-mcp | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Google (ChromeDevTools) | _none yet_ | Bundles a [`skills/`](https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/main/skills) folder, but requires separate install — not served via MCP |
| hf-mcp-server | [huggingface/hf-mcp-server](https://github.com/huggingface/hf-mcp-server) | Hugging Face | _none yet_ | Official HF MCP server (Hub APIs + Gradio); could serve the associated skills from [huggingface/skills](https://github.com/huggingface/skills) instead of installing separately |
| github-mcp-server | [github/github-mcp-server](https://github.com/github/github-mcp-server) | GitHub | [#2428](https://github.com/github/github-mcp-server/pull/2428) (WIP demo, not for merge) | SEP-2640 demo branch |
| Azure Skills Plugin | [microsoft/azure-skills](https://github.com/microsoft/azure-skills) | Microsoft | _none yet_ | 25 Azure SKILL.md skills bundled with [Azure MCP Server](https://github.com/microsoft/mcp/tree/main/servers/Azure.Mcp.Server) + Foundry MCP; distributed as a plugin, not via MCP |
| Figma MCP | _TBD_ | Figma | _none yet_ | Contact: Discord `adityamuttur` — candidate for SEP-2640 testing |
| Adobe MCP | _TBD_ | Adobe | _none yet_ | Contact: Discord `justinmathew8592` — candidate for SEP-2640 testing |
