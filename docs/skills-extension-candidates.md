# Skills Extension Candidates

A tracker of MCP servers, dev tools, SDKs, and skills repositories that are candidates for adopting the skills extension proposed in [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

**Inclusion criterion.** An entry belongs here if it already ships skills in some non-MCP form (separate install path, plugin marketplace, framework-native provider), pairs an MCP server with a separate skills repo, or has an in-flight SEP-2640 implementation.

## Snapshot

| Server | Repo | Author / Org | Notes |
| :--- | :--- | :--- | :--- |
| FastMCP 3.0 Skills | [jlowin/fastmcp#2694](https://github.com/jlowin/fastmcp/issues/2694) — [docs](https://gofastmcp.com/servers/providers/skills) | FastMCP | Framework with its own native skills provider |
| chrome-devtools-mcp | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Google (ChromeDevTools) | Bundles a [`skills/`](https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/main/skills) folder, but requires separate install — not served via MCP |
| hf-mcp-server | [huggingface/hf-mcp-server](https://github.com/huggingface/hf-mcp-server) | Hugging Face | Official HF MCP server (Hub APIs + Gradio); no skills exposure today |
| Hugging Face skills library | [huggingface/skills](https://github.com/huggingface/skills) | Hugging Face | 13 SKILL.md skills paired with `hf-mcp-server` via Cursor `.mcp.json`; distributed outside MCP today |
| github-mcp-server | [github/github-mcp-server](https://github.com/github/github-mcp-server) | GitHub | SEP-2640 demo branch in [#2428](https://github.com/github/github-mcp-server/pull/2428) (WIP, not for merge) |
| Azure Skills Plugin | [microsoft/azure-skills](https://github.com/microsoft/azure-skills) | Microsoft | 25 Azure SKILL.md skills bundled with Azure MCP Server + Foundry MCP; distributed as a plugin, not via MCP |

