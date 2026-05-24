# Client Research: Model-facing MCP Resource & SEP-2640 Support

> **Scope.** This page tracks two related areas of client support:
>
> 1. **Model-facing MCP resource loading** — does the client expose a tool that lets the model read MCP resources by URI? This is the SHOULD proposed in [modelcontextprotocol/modelcontextprotocol#2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527) and is verifiable today. The bulk of this page is this survey.
> 2. **SEP-2640 skills extension support** — once [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) finalizes, this page will also track which clients implement the extension. SEP-2640-related issues and PRs are tracked per-client in the "Open issues/PRs to watch" column rather than via a separate status field.
>
> **Why these are tracked together.** SEP-2640 layers skills on top of MCP resources. If a host's progressive-disclosure flow involves the model itself loading L2/L3 skill content from `skill://…` or related resource URIs, then the resource-read affordance for the model becomes critical for skills. A client's resource-loading shape today is a strong predictor of how it'll fit SEP-2640 tomorrow.
>
> See also [**skills-extension-candidates.md**](skills-extension-candidates.md) for the matching server-side tracker: MCP servers, dev tools, SDKs, and skills repositories that are candidates for adopting SEP-2640.
>

## At-a-glance comparison

Category values: **Framework** = SDK/library you build agents on top of · **CLI** = end-user coding agent or CLI · **IDE** = editor-embedded chat surface.

| Client | Category | Tool exposed to model? | Tool name(s) | Tool signature | Calls `resources/read` on connected server? | Enablement gate | End-user docs? | Open issues/PRs to watch |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **codex** (OpenAI) | CLI | Yes | `read_mcp_resource`, `list_mcp_resources`, `list_mcp_resource_templates` | `(server, uri)` — server explicitly named | Yes — handler calls `session.read_resource()` | Any MCP server is configured (`params.mcp_tools.is_some()`) | No — only the LLM-visible tool description; an internal steer tells the model to prefer `tool_search` | _none yet — add as found_ |
| **goose** (Block) | CLI | Yes | `read_resource`, `list_resources` | `(extension_name, uri)` on `read_resource` — `extension_name` required; `list_resources` takes an optional `extension_name` filter | Yes — `ExtensionManager::read_resource` → `client.read_resource(...)` | ≥1 enabled extension reports `ServerCapabilities::resources` | Yes — [`extension-manager-mcp.md`](https://github.com/block/goose/blob/main/documentation/docs/mcp/extension-manager-mcp.md) | _none yet — add as found_ |
| **fast-agent** | Framework | Yes (multiplexed) | `get_resource`, `list_resources` | `(uri, server_name)` — also handles bundled `internal://` URIs through the same tool | Yes for MCP URIs — `_run_current_agent_get_resource_call` → `agent.get_resource(uri, namespace=server_name)`; `internal://` URIs short-circuit to bundled resources | Unconditional for every `SmartAgent` | Partial — `smart_prompt.md` instructs the model; design rationale in `plan/done/internal_resources.md`; no dedicated README section | _none yet — add as found_ |
| **vscode** (GitHub Copilot) | IDE | Yes (FS-provider indirection) | `copilot_readFile`, `copilot_listDirectory` (general-purpose, not MCP-specific) | `(path)` — accepts `mcp-resource://…` URIs as paths; the FS provider routes to MCP RPC | Yes — `mcp-resource://` URIs route via `IFileService` → `McpResourceFilesystem` provider → `r.readResource(...)` MCP RPC ([`mcpResourceFilesystem.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpResourceFilesystem.ts)) | Server must advertise `McpCapability.Resources`; model needs a URI to pass (typically obtained from user attachment or from an MCP tool's `resource_link` response) | No explicit doc, but mechanism is operational. [Connor Peet's comment on #2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527#issuecomment-4282395437) is the clearest write-up | _none yet — add as found_ |
| **opencode** | CLI | No | — (internal `readResource` only) | — | Internal only — `readResource()` exists in [`packages/opencode/src/mcp/index.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/mcp/index.ts) but is invoked only when the user attaches a resource via file picker; `mcp.tools()` in `prompt.ts` forwards MCP *tools* but never a resource-read tool | n/a | Docs (`mcp-servers.mdx`) advertise tool forwarding only | _none yet — add as found_ |
| **deepagents** (LangChain) | Framework | No | — | — | n/a — delegates MCP wiring to [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters) via `load_mcp_tools()` (in [`mcp_tools.py`](https://github.com/langchain-ai/deepagents/blob/main/src/deepagents/mcp_tools.py)); that adapter only converts MCP tools, not resources | n/a | No mention in README | **Upstream-blocked**: needs a change in `langchain-mcp-adapters` (or a deepagents wrapper around `client.read_resource()`) |
| **strands-agents** (AWS) | Framework | No (internal SDK only) | — | — | Internal only — `MCPClient.read_resource_sync()` and `list_resources_sync()` in [`mcp_client.py`](https://github.com/strands-agents/sdk-python/blob/main/src/strands/tools/mcp/mcp_client.py) call MCP `resources/read` / `resources/list`, but `MCPAgentTool` (the only adapter) wraps `mcp.types.Tool` only and `MCPClient.load_tools()` (the `ToolProvider` interface) returns tools only | n/a | _unknown — verify_ | _none yet — add as found_ |
| **Claude Code** (closed source, reference) | CLI | Yes | `ReadMcpResourceTool` | `(server, uri)` per [public docs](https://code.claude.com/docs/en/tools-reference) | Documented; source not verifiable | n/a | Yes — public tools reference page | n/a |
| **adk-python** (Google ADK) | Framework | Yes _(unverified — first pass below)_ | `load_mcp_resource` | Two-shot — discovers resources first, then takes a `resource_name` to read | Yes — `MCPToolset.read_resource()` calls `session.read_resource(uri)` ([`mcp_toolset.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/mcp_tool/mcp_toolset.py)) | Toolset must be configured with at least one MCP server | _unknown — verify_ | _none yet — add as found_ |
| **agent-framework** (Microsoft) | Framework | No (tools-only client bridge) | — | — | n/a — `MCPTool` / `MCPStdioTool` / `MCPStreamableHTTPTool` / `MCPWebsocketTool` in [`_mcp.py`](https://github.com/microsoft/agent-framework/blob/main/python/packages/core/agent_framework/_mcp.py) materialize MCP *tools* into the agent's tool registry; no `read_resource` callsite found in client code (only in a test) | n/a | Samples cover MCP tool integration only | _none yet — add as found_ |
| **cline** | IDE | No | — | — | n/a — depends on `@modelcontextprotocol/sdk` for MCP, but zero matches for `resources/read` / `readResource` / `read_resource` in source. Tools-only bridge | n/a | MCP docs cover tools and config only | _none yet — add as found_ |
| **crewAI** | Framework | No | — | — | n/a — `crewai-tools` MCP adapter ([`mcp_adapter.py`](https://github.com/crewAIInc/crewAI-tools/blob/main/crewai_tools/adapters/mcp_adapter.py)) is built on `mcpadapt` and converts MCP tools only — same upstream-blocked pattern as smolagents | n/a | MCP adapter docs cover tools only | **Upstream-blocked** by `mcpadapt` (shared with smolagents) |
| **hermes-agent** (Nous Research) | CLI | Yes | `mcp_{server}_read_resource`, `mcp_{server}_list_resources` (one pair per connected server) | `(uri)` — server is encoded in the tool name | Yes — `_make_read_resource_handler()` in [`tools/mcp_tool.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_tool.py) calls `session.read_resource(uri)` and registers the tool per server | Two gates: `tools.resources` config flag (default on) AND server's advertised `capabilities.resources` | Yes — [`features/mcp.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) and [`guides/use-mcp-with-hermes.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md) | _none yet — add as found_ |
| **mastra** | Framework | No (internal SDK only) | — | — | Internal only — [`resource.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/actions/resource.ts) exposes a `read(uri)` SDK method that calls `client.readResource(uri)`, but it is **not** registered as an LLM-facing tool; the model-facing tool bridge converts MCP tools only | n/a | SDK docs cover the action; no LLM-tool exposure | _none yet — add as found_ |
| **Roo-Code** | IDE | No | — | — | n/a — [`McpHub.ts`](https://github.com/RooCodeInc/Roo-Code/blob/main/src/services/mcp/McpHub.ts) imports `ReadResourceResultSchema` from the SDK but does not register a model-facing resource-read tool; the MCP hub maps tools only | n/a | _unknown — verify_ | _none yet — add as found_ |

## Cross-cutting observations

1. **Three implementation patterns for model-facing MCP resource access.**
   1. **Dedicated MCP resource tools** — Codex, Goose, Claude Code: explicit `read_mcp_resource` / `read_resource` (+ optional `list_*`) registered alongside other MCP tools. Most discoverable by the model; closest literal reading of #2527.
   2. **Multiplexed resource tool** — fast-agent: one `get_resource` tool handles both bundled (`internal://`) and MCP URIs behind a single name. Simpler surface for the model; relies on URI scheme to disambiguate.
   3. **FS-provider indirection via namespaced URIs** — VS Code: no MCP-specific tool. A dedicated URI scheme (`mcp-resource://`) is registered with the filesystem service so the generic `readFile` / `listDirectory` tools transparently reach MCP `resources/read`. Reuses the agent's existing file-reading affordance; costs nothing in tool-count budget. Downside: no `list` equivalent — the model can only read URIs it's been handed.

2. **Dedicated-tool implementers converge on `(server, uri)`.** Codex, Goose, fast-agent, and Claude Code all take an explicit server identifier alongside the URI. hermes-agent is the remaining variant in pattern (1)'s family: it encodes server-in-tool-name (one tool per server) and takes only `(uri)`.

3. **Trust models diverge.** Per-server enablement (Goose), unconditional-when-MCP-configured (Codex), or capability-gated FS provider (VS Code). For skills-over-MCP this matters because the "who can read what" boundary is currently set by each host individually — a portable skill that depends on `resources/read` will work or not based on whether the host considers MCP resource access a model-grade affordance.

4. **Discoverability differs sharply between patterns.** Pattern (1) hosts pair `read_*` with a `list_*` so the model can enumerate resources on its own. Pattern (2) (fast-agent) has `list_resources`. Pattern (3) (VS Code) has *no list equivalent* — the model can only read a URI it's been handed (user attachment → chat context, or an MCP tool returning a `resource_link`). For skills this matters: a `skill://index.json`-style enumeration model implicitly assumes the model can either *list* or be *told* what's available. Pattern (3) needs the index handed in via attachment or a dedicated tool result.

5. **VS Code's FS-provider pattern is worth its own consideration for skills.** Because `mcp-resource://` URIs are first-class in the file service, *any* tool that takes a path argument in VS Code can transparently read MCP resources — including, in principle, a skill loader. The skills-over-MCP design could lean on this by treating `skill://server/name/SKILL.md` as just another URI scheme registered with the host's file abstraction. This is closer to a registry-style integration (cf. how VS Code surfaces skills via `ChatSessionCustomizationProvider` rather than as system-prompt content).

## Per-client deep dives

### Agent SDKs / frameworks

#### fast-agent _(verified)_

Verified at commit [`502d32e`](https://github.com/evalstate/fast-agent/commit/502d32e266f3221d744977f38b7a9b4bc5b93947).

- **Model-facing tool:** `get_resource` registered in [`smart_agent.py`](https://github.com/evalstate/fast-agent/blob/main/src/fast_agent/agents/smart_agent.py) via `agent.add_tool(...)`. The dispatcher in the same file routes `internal://` to bundled resources; everything else hits the connected MCP server via `agent.get_resource(uri, namespace=server_name)` → MCP `resources/read`.
- **Signature:** `(uri, server_name)` — multiplexed across bundled and MCP URIs by scheme. MCP behavior depends on what the model passes for `server_name`.

---

#### adk-python (Google ADK) _(first pass — verify before citing)_

- **MCP integration:** [`src/google/adk/tools/mcp_tool/`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/mcp_tool) package — `MCPToolset` is the entry point used by callers to connect an ADK agent to an MCP server.
- **Resource RPC wired:** [`mcp_toolset.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/mcp_tool/mcp_toolset.py) exposes `async def read_resource()` which calls `session.read_resource(uri)`.
- **Model-facing tool:** [`load_mcp_resource_tool.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/mcp_tool/load_mcp_resource_tool.py) defines `load_mcp_resource`. Per the first-pass scan, the tool is two-shot — first invocation lists resources, then the model picks a `resource_name` for the second call. **Verify the exact schema and confirm it's registered alongside the other ADK tools the agent sees.**
- **Why interesting:** ADK is one of two clients in the gap (with hermes-agent) that may already satisfy #2527 — and it's also the client with the most rigorous skill validation in the parallel skills survey, so this is where the spec extension and the resource-tool extension converge.

---

#### agent-framework (Microsoft) _(first pass — verify before citing)_

- **MCP integration:** Multi-transport client tools (`MCPTool` + Stdio/HTTP/Websocket variants) in [`_mcp.py`](https://github.com/microsoft/agent-framework/blob/main/python/packages/core/agent_framework/_mcp.py), with .NET equivalents under [`dotnet/src/Microsoft.Agents.AI.Hosting.OpenAI/Responses/Models/`](https://github.com/microsoft/agent-framework/tree/main/dotnet/src/Microsoft.Agents.AI.Hosting.OpenAI/Responses/Models). Tools-only bridge; zero `read_resource` callsites in source (only in tests).
- **Why on the list:** dual-stack Python/.NET framework with rich skills metadata in the parallel skills survey. The asymmetry — skills support without resource-tool support — is the kind of gap a #2527-aligned PR would close.

---

#### crewAI _(first pass — verify before citing)_

- **MCP integration:** [`mcp_adapter.py`](https://github.com/crewAIInc/crewAI-tools/blob/main/crewai_tools/adapters/mcp_adapter.py) imports `mcp` + `mcpadapt.core` and converts MCP tools to CrewAI `BaseTool` objects.
- **Resource RPC wired:** No — adapter handles only `Tool` types.
- **Model-facing tool:** None.
- **Why on the list:** Same upstream block as **smolagents** — both depend on [`mcpadapt`](https://github.com/grll/mcpadapt), which is tools-only. A single upstream change in `mcpadapt` flips both clients. This is the highest-leverage adapter-library target identified so far.

---

#### deepagents (LangChain) _(verified)_

Verified at commit [`a64ff43`](https://github.com/langchain-ai/deepagents/commit/a64ff430f14b76607dfb1d78234f928ed88a3af0).

- **MCP wiring is outsourced** to `langchain_mcp_adapters.tools.load_mcp_tools()` (called from [`mcp_tools.py`](https://github.com/langchain-ai/deepagents/blob/main/src/deepagents/mcp_tools.py)). The upstream adapter does not expose `resources/read` as a tool — zero hits for resource-read in deepagents source.
- **What it would take:** either upstream adds a resource-read tool, or deepagents wraps `client.read_resource()` outside the adapter.

---

#### mastra _(first pass — verify before citing)_

- **MCP integration:** [`packages/mcp/src/client/`](https://github.com/mastra-ai/mastra/tree/main/packages/mcp/src/client) imports `@modelcontextprotocol/sdk`. [`resource.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/actions/resource.ts) exposes `async read(uri)` which calls `this.client.readResource(uri)`.
- **Resource RPC wired:** Yes, but **internal SDK only**. `ResourceClientActions` is an SDK surface for callers, not registered as an LLM-facing tool.
- **Model-facing tool:** No. The model-facing tool bridge converts MCP tools only; resources require explicit code to invoke.
- **Why on the list:** Mastra's skill versioning architecture (content-addressable BlobStore, draft→publish lifecycle) is the most sophisticated. Unlocking resource-read at the model boundary would be a small change relative to the rest of the framework — the SDK plumbing already exists.

---

#### strands-agents _(verified)_

Verified at commit [`8638fc2`](https://github.com/strands-agents/sdk-python/commit/8638fc2d629e32b7b5839f4c106d5aedcdf764c9) (2026-05-04). Strands matches the **mastra pattern**: resource RPC wired in the SDK, but no model-facing tool.

- **Resource RPC wired but unbridged:** `MCPClient.read_resource_sync()`, `list_resources_sync()`, and `list_resource_templates_sync()` in [`mcp_client.py`](https://github.com/strands-agents/sdk-python/blob/main/src/strands/tools/mcp/mcp_client.py) are SDK-public methods, but [`MCPAgentTool`](https://github.com/strands-agents/sdk-python/blob/main/src/strands/tools/mcp/mcp_agent_tool.py) only wraps `mcp.types.Tool` and delegates to `call_tool_async(...)`. Outside tests, nothing in the repo invokes the resource methods.
- **Why on the list:** Strands has its own local-filesystem skills implementation at [`agent_skills.py`](https://github.com/strands-agents/sdk-python/blob/main/src/strands/vended_plugins/skills/agent_skills.py), so the framework already does progressive disclosure. Wiring resource-read to the model is the obvious next step for an MCP-backed skill story.

---

### Coding agents / CLIs

#### codex (OpenAI) _(verified)_

Verified at commit [`67849d9`](https://github.com/openai/codex/commit/67849d950d843c954102adb0db0e11f993aefdb7).

- **Model-facing tools:** `read_mcp_resource`, `list_mcp_resources`, `list_mcp_resource_templates` defined at [`mcp_resource_tool.rs`](https://github.com/openai/codex/blob/main/codex-rs/tools/src/mcp_resource_tool.rs); registered unconditionally when an MCP server is configured. Handler at [`mcp_resource.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/mcp_resource.rs) → `session.read_resource()`.
- **Signature:** `(server, uri)` — model names the server explicitly. No user-facing doc; an internal steer tells the model to prefer `tool_search`.

---

#### goose (AAIF) _(verified)_

Verified at commit [`45d8bf8`](https://github.com/aaif-goose/goose/commit/45d8bf81d09d478ceedba8f6d1f0ad906123a981).

- **Model-facing tools:** `read_resource`, `list_resources` registered in [`ext_manager.rs`](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/platform_extensions/ext_manager.rs) when at least one extension reports `ServerCapabilities::resources`. Dispatch flows through [`extension_manager.rs`](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/extension_manager.rs) → `client.read_resource(...)` → MCP `resources/read`. Documented at [`extension-manager-mcp.md`](https://github.com/block/goose/blob/main/documentation/docs/mcp/extension-manager-mcp.md).
- **Signature:** `(extension_name, uri)` on `read_resource` — `extension_name` is required. `list_resources` takes an optional `extension_name` filter; the tool description directs the model to call `list_resources` first when ownership is unknown.

---

#### hermes-agent (Nous Research) _(verified)_

Verified at commit [`72ff3e9`](https://github.com/NousResearch/hermes-agent/commit/72ff3e909c73b625ee244ab5ea3d0608ee85dcf3) (2026-05-23).

- **MCP integration:** Full integration in [`tools/mcp_tool.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_tool.py).
- **Resource RPC wired:** Yes — `_make_read_resource_handler()` calls `await server.session.read_resource(uri)`.
- **Model-facing tools:** Yes — both `mcp_{safe_name}_read_resource` (taking `uri`) and `mcp_{safe_name}_list_resources` (no parameters) registered per connected server via `_build_utility_schemas()`. Conditionally registered when the server advertises `capabilities.resources` AND the per-server `tools.resources` config flag is on (default).
- **Signature:** `(uri)` — server is encoded in the tool name (one tool per server), so the model implicitly selects the server by selecting the tool. **Distinct from every other pattern surveyed**: not `(server, uri)`, not `(uri)`-with-probing, not URI-virtualized — it's *one tool per server*. The matching `list_resources` per server gives the model a discovery affordance without cross-server probing.
- **End-user docs:** [`features/mcp.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) and [`guides/use-mcp-with-hermes.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md) both document the utility wrappers. (Minor doc/code mismatch: the user-facing docs name the tools as bare `read_resource` / `list_resources`, but the actual model-facing names include the `mcp_{server}_` prefix.)
- **Why interesting:** With adk-python, this is the second of the seven gap-clients that already satisfies #2527. The per-server-tool naming is also a candidate disambiguation pattern for skills-over-MCP.

---

#### Claude Code (closed source — reference only)

Claude Code is closed source so we cannot verify the loader, but the [public tools reference](https://code.claude.com/docs/en/tools-reference) documents `ReadMcpResourceTool` accepting `server` and `uri` parameters.  Listed here as a reference data point for the `(server, uri)` signature shape also adopted by Codex and fast-agent.

---

#### opencode _(verified)_

Verified at commit [`ce89bcb`](https://github.com/anomalyco/opencode/commit/ce89bcb8e238401ea8fee000dc54539057d47dc4).

- **Tools forwarded to the model** in [`packages/opencode/src/mcp/index.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/mcp/index.ts) via `client.callTool()`; tool naming convention `{server_name}:{tool_name}`.
- **Resource-read is UI-only:** `readResource()` in the same file is invoked from the file picker, never registered as an LLM tool. Docs ([`mcp-servers.mdx`](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/docs/mcp-servers.mdx)) advertise tool forwarding only.

---

### IDE extensions

#### vscode (GitHub Copilot) _(verified)_

Verified at commits [`530cb5d`](https://github.com/microsoft/vscode/commit/530cb5de713aec2e96059e2f6cf41a95403cdb3d) (vscode core) and [`9e668cb`](https://github.com/microsoft/vscode-copilot-chat/commit/9e668cb12144c701cf0f2c6b3458c00fe3da20f1) (Copilot Chat extension). VS Code is the unique pattern here: no MCP-specific tool — generic `copilot_readFile` / `copilot_listDirectory` tools transparently reach MCP servers via filesystem-provider indirection on a custom URI scheme.

- **URI scheme + FS provider:** [`McpResourceURI`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpTypes.ts) defines `mcp-resource://` URIs that encode the MCP server's definition ID in the authority — self-routing. [`McpResourceFilesystem`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpResourceFilesystem.ts) is registered for that scheme; `_readURIInner` decodes the URI, looks up the `McpServer`, and calls `r.readResource(...)` — the MCP `resources/read` RPC. Capability-gated on `McpCapability.Resources`.
- **`resource_link` pre-wrap:** when an MCP tool returns a `resource_link`, [`mcpLanguageModelToolContribution.ts`](https://github.com/microsoft/vscode-copilot-chat/blob/main/src/extension/conversation/vscode-node/mcpLanguageModelToolContribution.ts) converts it into an `mcp-resource://` URI so the model can re-read it later via `copilot_readFile`.
- **Caveat — discoverability:** the model can only read a URI it has been handed (user attachment, or an MCP tool's `resource_link`). No `list_mcp_resources`-equivalent. [Connor Peet on PR #2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527#issuecomment-4282395437) is the clearest write-up of this pattern.

---

#### cline _(first pass — verify before citing)_

- **MCP integration:** Depends on `@modelcontextprotocol/sdk` per `package.json`; MCP server config + UI surfaced in the IDE.
- **Resource RPC wired:** No callsite found — zero matches for `resources/read` / `readResource` / `read_resource` in source.
- **Model-facing tool:** None. The MCP integration is currently tools + UI configuration; resources aren't reached.
- **Why on the list:** Cline has the most extensive skills implementation in the parallel survey (incl. the admin-locked enterprise `globalSkills` primitive), so the absence of resource-read is a notable asymmetry. Worth a careful re-check given the SDK is already wired.

---

#### Roo-Code _(first pass — verify before citing)_

- **MCP integration:** [`McpHub.ts`](https://github.com/RooCodeInc/Roo-Code/blob/main/src/services/mcp/McpHub.ts) imports from `@modelcontextprotocol/sdk/types.js`, including `ReadResourceResultSchema`.
- **Resource RPC wired:** Schema imports suggest the capability is reachable, but no explicit `readResource` handler was found in `McpHub` on first pass; the hub maps tools only (the observed pattern is `tools = (response?.tools).map(...)`).
- **Model-facing tool:** No.
- **Why on the list:** Roo-Code has both a skills implementation and an MCP hub, and the SDK type imports indicate someone *intended* to surface resources at some point. Worth a thorough read of `McpHub.ts` to confirm whether resources are partially implemented or simply unused.

## Takeaways for SEP-2640 (skills extension)

- **Likely six of fourteen open-source clients surveyed** (Codex, Goose, fast-agent, VS Code, hermes-agent — verified — plus adk-python on first-pass evidence pending verification) satisfy #2527's SHOULD; closed-source Claude Code's public docs confirm it does too. Goose and hermes-agent also satisfy the implicit expectation that this be documented for end users.
- **Three implementation patterns** for model-facing MCP resource access — all support the layering Peter sketches in his #2640 comment, but with different costs:
  - **Dedicated tools, `(server, uri)`** (Codex, Goose, Claude Code, fast-agent — fast-agent is also multiplexed across `internal://`): explicit `read_resource` registered alongside other MCP tools. Most discoverable; closest literal reading of #2527.
  - **One tool per server, `(uri)`** (hermes-agent): server is encoded in the tool name (`mcp_{server}_read_resource`), so the model selects the server by selecting the tool. Trades catalog tokens for unambiguity. Pairs with `mcp_{server}_list_resources` so the model has a per-server discovery affordance.
  - **FS-provider indirection via namespaced URIs** (VS Code): no MCP-specific tool. `mcp-resource://` URIs are registered with the file service; generic `readFile` / `listDirectory` tools transparently reach `resources/read`. Costs nothing in tool-count budget; loses `list` affordance.

  Reliability implication: each pattern enforces server identity differently — explicit parameter (`(server, uri)`), tool choice (per-server tool), or URI authority (`mcp-resource://<server-id>/...`). **The spec should nudge implementations to keep server identity mandatory** so a skill always resolves to its owning server. Otherwise the host has to probe every connected server when the model omits it — either silently picking the wrong one, or iterating through all of them at the cost of latency and tokens.
- **Adapter libraries block two "no" rows.** **crewAI** depends on [`mcpadapt`](https://github.com/grll/mcpadapt); **deepagents** depends on [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters). Both adapters are tools-only — the unlock for either client lives in the adapter, not the client repo.
- **Internal SDK without LLM-tool exposure** (mastra, strands-agents) is its own pattern: the resource RPC is wired in the SDK but not bridged to the model. Closing this gap is typically smaller-scope than wiring the RPC from scratch.
