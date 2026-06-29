# Client Research: Model-facing MCP Resource & SEP-2640 Support

> **Scope.** This page tracks two related areas of client support:
>
> 1. **Model-facing MCP resource loading** — does the client expose a tool that lets the model trigger an MCP `resources/read`? This is the SHOULD proposed in [modelcontextprotocol/modelcontextprotocol#2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527) (which phrases it as "by URI"); for survey purposes we also count by-name variants where the framework resolves a model-supplied name to a URI before calling `resources/read` (adk-python is the one such case found). The bulk of this page is this survey.
> 2. **SEP-2640 skills extension support** — as clients ship [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) implementations, this page tracks them. **fast-agent is the first surveyed client to ship one** (registry/install scope — see its deep dive), verified live against the Hugging Face MCP server, which is the first server-side implementation we've interoperated with. SEP-2640-related issues, PRs, and shipped implementations are tracked per-client in the "Open issues/PRs to watch" column rather than via a separate status field.
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
| **fast-agent** | Framework | Yes (multiplexed) | `get_resource` (no model-facing `list_resources`) | `(uri, server_name)` — also handles bundled `internal://` URIs through the same tool | Yes for MCP URIs — `_run_current_agent_get_resource_call` → `agent.get_resource(uri, namespace=server_name)`; `internal://` URIs short-circuit to bundled resources | Unconditional for every `SmartAgent` | Partial — `smart_prompt.md` instructs the model; design rationale in `plan/done/internal_resources.md`; no dedicated README section | **SEP-2640 shipped** (registry/install scope) — consumes the `io.modelcontextprotocol/skills` extension to install SHA256-verified skills from `skill://index.json` ([`mcp_registry.py`](https://github.com/evalstate/fast-agent/blob/main/src/fast_agent/skills/mcp_registry.py), [`skills-over-mcp.md`](https://github.com/evalstate/fast-agent/blob/main/docs/docs/mcp/skills-over-mcp.md)); does not yet read skill resources at model runtime. Verified live against [hf-mcp-server](https://github.com/huggingface/hf-mcp-server). **Watch:** draft [#816](https://github.com/evalstate/fast-agent/pull/816) adds MCP-served skill *runtime* loading (URI-backed manifests, `SkillReader` resource reads, untrusted-content wrapping) |
| **vscode** (GitHub Copilot) | IDE | Yes (FS-provider indirection) | `copilot_readFile`, `copilot_listDirectory` (general-purpose, not MCP-specific) | `(path)` — accepts `mcp-resource://…` URIs as paths; the FS provider routes to MCP RPC | Yes — `mcp-resource://` URIs route via `IFileService` → `McpResourceFilesystem` provider → `r.readResource(...)` MCP RPC ([`mcpResourceFilesystem.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpResourceFilesystem.ts)) | Server must advertise `McpCapability.Resources`; model needs a URI to pass (typically obtained from a user attachment — the earlier Copilot Chat `resource_link`→`mcp-resource://` pre-wrap has since been removed; see deep dive) | No explicit doc, but mechanism is operational. [Connor Peet's comment on #2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527#issuecomment-4282395437) is the clearest write-up | _none yet — add as found_ |
| **opencode** | CLI | No | — (internal `readResource` only) | — | Internal only — `readResource()` exists in [`packages/opencode/src/mcp/index.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/mcp/index.ts) but is invoked only when the user attaches a resource via file picker; `mcp.tools()` in `prompt.ts` forwards MCP *tools* but never a resource-read tool | n/a | Docs (`mcp-servers.mdx`) advertise tool forwarding only | _none yet — add as found_ |
| **deepagents** (LangChain) | Framework | No | — | — | n/a — delegates MCP wiring to [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters) (via `convert_mcp_tool_to_langchain_tool()` / `_build_cached_mcp_tool()` in [`mcp_tools.py`](https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/mcp_tools.py)); that adapter only converts MCP tools, not resources | n/a | No mention in README | **Upstream-blocked**: needs a change in `langchain-mcp-adapters` (or a deepagents wrapper around `client.read_resource()`) |
| **strands-agents** (AWS) | Framework | No (internal SDK only) | — | — | Internal only — `MCPClient.read_resource_sync()` and `list_resources_sync()` in [`mcp_client.py`](https://github.com/strands-agents/harness-sdk/blob/main/strands-py/src/strands/tools/mcp/mcp_client.py) call MCP `resources/read` / `resources/list`, but `MCPAgentTool` (the only adapter) wraps `mcp.types.Tool` only and `MCPClient.load_tools()` (the `ToolProvider` interface) returns tools only | n/a | No — `docs/MCP_CLIENT_ARCHITECTURE.md` and `AGENTS.md` do not mention MCP resources | _none yet — add as found_ |
| **Claude Code** (closed source, reference) | CLI | Yes | `ReadMcpResourceTool` | `(server, uri)` per [public docs](https://code.claude.com/docs/en/tools-reference) | Documented; source not verifiable | n/a | Yes — public tools reference page | n/a |
| **adk-python** (Google ADK) | Framework | Yes (by name, not URI) | `load_mcp_resource` | `(resource_names: array[string])` — model passes catalog names; framework resolves each to a URI and calls `session.read_resource(uri=…)`. The catalog is injected into the model's context by `_append_resources_to_llm_request()` rather than via a separate list call | Yes — `McpToolset.read_resource()` calls `session.read_resource(uri=…)` ([`mcp_toolset.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/mcp_tool/mcp_toolset.py)) | Opt-in via `use_mcp_resources=True` on `McpToolset` (default `False`) | No — no user-facing docs found | _none yet — add as found_ |
| **agent-framework** (Microsoft) | Framework | No (tools-only client bridge) | — | — | n/a — `MCPTool` / `MCPStdioTool` / `MCPStreamableHTTPTool` / `MCPWebsocketTool` in [`_mcp.py`](https://github.com/microsoft/agent-framework/blob/main/python/packages/core/agent_framework/_mcp.py) materialize MCP *tools* into the agent's tool registry; no `read_resource` callsite found in client code (only in a test) | n/a | Samples cover MCP tool integration only | _none yet — add as found_ |
| **cline** | IDE | Yes | `access_mcp_resource` | `(server_name, uri)` | Yes — [`McpHub.readResource(serverName, uri)`](https://github.com/cline/cline/blob/main/apps/vscode/src/services/mcp/McpHub.ts) calls `resources/read`; invoked from [`AccessMcpResourceHandler`](https://github.com/cline/cline/blob/main/apps/vscode/src/core/task/tools/handlers/AccessMcpResourceHandler.ts) | Server's `resources` capability surfaces in system prompt context via the [`mcp.ts` formatter](https://github.com/cline/cline/blob/main/apps/vscode/src/core/prompts/system-prompt/components/mcp.ts) | No dedicated user-facing docs found | _none yet — add as found_ |
| **crewAI** | Framework | No | — | — | n/a — `crewai-tools` MCP adapter ([`mcp_adapter.py`](https://github.com/crewAIInc/crewAI-tools/blob/main/crewai_tools/adapters/mcp_adapter.py)) is built on `mcpadapt` and converts MCP tools only — same upstream-blocked pattern as smolagents | n/a | MCP adapter docs cover tools only | **Upstream-blocked** by `mcpadapt` (shared with smolagents) |
| **hermes-agent** (Nous Research) | CLI | Yes | `mcp_{server}_read_resource`, `mcp_{server}_list_resources` (one pair per connected server) | `(uri)` — server is encoded in the tool name | Yes — `_make_read_resource_handler()` in [`tools/mcp_tool.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_tool.py) calls `session.read_resource(uri)` and registers the tool per server | Two gates: `tools.resources` config flag (default on) AND server's advertised `capabilities.resources` | Yes — [`features/mcp.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) and [`guides/use-mcp-with-hermes.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md) | _none yet — add as found_ |
| **mastra** | Framework | No (internal SDK only) | — | — | Internal only — [`resource.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/actions/resource.ts) exposes a `read(uri)` SDK method that calls `client.readResource(uri)`, but it is **not** registered as an LLM-facing tool; the model-facing tool bridge converts MCP tools only | n/a | SDK docs cover the action; no LLM-tool exposure | _none yet — add as found_ |

## Cross-cutting observations

1. **Three implementation patterns for model-facing MCP resource access.**
   1. **Dedicated MCP resource tools** — Codex, Goose, Claude Code, Cline: explicit `read_mcp_resource` / `read_resource` / `access_mcp_resource` (+ optional `list_*`) registered alongside other MCP tools. Most discoverable by the model; closest literal reading of #2527. adk-python is a near-relative — its `load_mcp_resource` takes a batch of `resource_names` in one call rather than a single URI, but the affordance shape is the same.
   2. **Multiplexed resource tool** — fast-agent: one `get_resource` tool handles both bundled (`internal://`) and MCP URIs behind a single name. Simpler surface for the model; relies on URI scheme to disambiguate.
   3. **FS-provider indirection via namespaced URIs** — VS Code: no MCP-specific tool. A dedicated URI scheme (`mcp-resource://`) is registered with the filesystem service so the generic `readFile` / `listDirectory` tools transparently reach MCP `resources/read`. Reuses the agent's existing file-reading affordance; costs nothing in tool-count budget. Downside: no `list` equivalent — the model can only read URIs it's been handed.

2. **Dedicated-tool implementers converge on `(server, uri)`.** Codex, Goose, fast-agent, Claude Code, and Cline all take an explicit server identifier alongside the URI. hermes-agent is the remaining variant in pattern (1)'s family: it encodes server-in-tool-name (one tool per server) and takes only `(uri)`. adk-python is the outlier — it takes `(resource_names: array[string])` and resolves URIs via a model-visible catalog injected into context.

3. **Trust models diverge.** Per-server enablement (Goose), unconditional-when-MCP-configured (Codex), capability-gated FS provider (VS Code), capability-gated dedicated tool (Cline), or framework opt-in flag (adk-python, `use_mcp_resources=True`, default off). For skills-over-MCP this matters because the "who can read what" boundary is currently set by each host individually — a portable skill that depends on `resources/read` will work or not based on whether the host considers MCP resource access a model-grade affordance.

4. **Discoverability differs sharply between patterns — and within them.** Within pattern (1), discovery shapes diverge: Codex, Goose, hermes-agent (per server), and Claude Code pair `read_*` with a `list_*` tool so the model can enumerate resources on its own; Cline instead injects each server's `resources` and `resourceTemplates` into the system prompt via its `mcp.ts` formatter; adk-python injects an in-context catalog of resource names via `_append_resources_to_llm_request()`. Pattern (2) (fast-agent) has *no* model-facing `list_resources` on current main — only the `get_resource` tool is registered (an internal `smart_list_resources` method exists but isn't exposed to the model). Pattern (3) (VS Code) has *no list equivalent* — the model can only read a URI it's been handed (user attachment → chat context, or an MCP tool returning a `resource_link`). For skills this matters: a `skill://index.json`-style enumeration model implicitly assumes the model can either *list* or be *told* what's available. Pattern (3) needs the index handed in via attachment or a dedicated tool result.

5. **VS Code's FS-provider pattern is worth its own consideration for skills.** Because `mcp-resource://` URIs are first-class in the file service, *any* tool that takes a path argument in VS Code can transparently read MCP resources — including, in principle, a skill loader. The skills-over-MCP design could lean on this by treating `skill://server/name/SKILL.md` as just another URI scheme registered with the host's file abstraction. This is closer to a registry-style integration (cf. how VS Code surfaces skills via `ChatSessionCustomizationProvider` rather than as system-prompt content).

## Per-client deep dives

### Agent SDKs / frameworks

#### fast-agent
Verified at commit [`10a996b`](https://github.com/evalstate/fast-agent/commit/10a996b6d2be0a0daa307c3fd0d6b40096587325) (2026-06-02).

- **Model-facing tool:** `get_resource` registered in [`smart_agent.py`](https://github.com/evalstate/fast-agent/blob/main/src/fast_agent/agents/smart_agent.py) via `agent.add_tool(...)` (the three model-facing tools registered there are `smart`, `slash_command`, and `get_resource` — `smart_tool_names`). The dispatcher in the same file routes `internal://` to bundled resources; everything else hits the connected MCP server via `agent.get_resource(uri, namespace=server_name)` → MCP `resources/read`.
- **Signature:** `(uri, server_name)` — multiplexed across bundled and MCP URIs by scheme. MCP behavior depends on what the model passes for `server_name`.
- **No model-facing `list_resources`:** an internal `smart_list_resources` method exists but is **not** registered via `agent.add_tool(...)`, so the model cannot enumerate resources — only read a URI it's been handed. (Earlier revisions of this page listed `list_resources` as a fast-agent tool; that is not the case on current main.)

**SEP-2640 skills extension (shipped — registry/install scope).** Verified at commit [`10a996b`](https://github.com/evalstate/fast-agent/commit/10a996b6d2be0a0daa307c3fd0d6b40096587325). fast-agent is the first surveyed client to ship a SEP-2640 implementation.

- **What it implements:** the *registry and installation* portion of the draft SEP, not model-facing resource loading. When a connected server advertises the `io.modelcontextprotocol/skills` extension capability (`server_supports_mcp_skills()` checks `capabilities.extensions` for the key in [`mcp_registry.py`](https://github.com/evalstate/fast-agent/blob/main/src/fast_agent/skills/mcp_registry.py)), fast-agent treats it as an MCP-backed skills registry.
- **Flow:** `/skills registry` reads `skill://index.json` (via the same `get_resource` → `resources/read` path), lists installable `skill-md` or `archive` entries that carry a valid `sha256:` digest, then downloads the artifact, verifies its SHA-256, and writes it into the normal managed skills directory. Installed skills record MCP server provenance + the verified artifact digest in sidecar metadata; `/skills update` can compare digests and apply a verified update.
- **Hardening:** rejects `file://` URLs, enforces index/SKILL.md/archive size caps, and extracts archives with path-traversal and symlink guards (`_validate_archive_name`, `filter="data"`).
- **Explicit non-goals (current scope):** does **not** expose MCP-served skill resources directly to the model, and active skills do **not** read supporting files from the MCP server at runtime — that deeper resource-loading workflow is in flight in draft [PR #816](https://github.com/evalstate/fast-agent/pull/816) ("Add MCP-served skill runtime support": URI-backed skill manifests, MCP resource loading via `SkillReader`, untrusted-content wrapping, template resolution, enable/disable), stacked on the now-merged registry/install PR. So today this is a distinct affordance from the model-facing `get_resource` tool surveyed above: the SEP-2640 path is host-driven install, not a model tool call.
- **In flight:** draft [PR #825](https://github.com/evalstate/fast-agent/pull/825) realigns to the current SEP-2640 wire contract (new `frontmatter` + per-skill `archives[]` index schema; adds `resources/directory/read`), verified against [hf-mcp-server#174](https://github.com/huggingface/hf-mcp-server/pull/174).
- **Verified against a live server:** the [Hugging Face MCP server](https://github.com/huggingface/hf-mcp-server) is the server-side counterpart (advertises the same extension + serves `skill://` resources; see its row in [skills-extension-candidates.md](skills-extension-candidates.md)). fast-agent's docs walk through `/mcp connect --name hf https://huggingface.co/mcp` → `/skills registry hf` → `/skills add`.

---

#### adk-python (Google ADK)
Verified at commit [`61a3933`](https://github.com/google/adk-python/commit/61a39330d) (2026-06-03).

- **MCP integration:** [`src/google/adk/tools/mcp_tool/`](https://github.com/google/adk-python/tree/main/src/google/adk/tools/mcp_tool) package — `McpToolset` (lowercase c; `MCPToolset` is a deprecated alias) is the entry point used by callers to connect an ADK agent to an MCP server.
- **Resource RPC wired:** [`mcp_toolset.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/mcp_tool/mcp_toolset.py) exposes `async def read_resource(self, name, readonly_context=None)` which calls `session.read_resource(uri=resource_info["uri"])`.
- **Model-facing tool:** [`load_mcp_resource_tool.py`](https://github.com/google/adk-python/blob/main/src/google/adk/tools/load_mcp_resource_tool.py) defines `load_mcp_resource`. **Not two-shot** — the tool's input schema is `resource_names: array[string]` (one call returns the contents of N resources). The catalog of available resources is exposed to the model via `_append_resources_to_llm_request()` injecting it into the LLM context, rather than via a separate `list` tool.
- **Enablement:** opt-in via the `use_mcp_resources=True` constructor flag on `McpToolset` (default `False`). When set, `get_tools()` appends `LoadMcpResourceTool` to the toolset alongside the dynamically discovered MCP tools.
- **End-user docs:** none found in `README.md` or the docs folder — the affordance is undocumented for end users despite being implemented.
- **Why interesting:** ADK is the client with the most rigorous skill validation in the parallel skills survey, so this is where the spec extension and the resource-tool extension converge. The batch `resource_names` shape is a distinct fourth signature among dedicated-tool implementers.

---

#### agent-framework (Microsoft)
Verified at commit [`c3901a4`](https://github.com/microsoft/agent-framework/commit/c3901a4dd) (2026-06-03).

- **MCP integration:** Multi-transport client tools — `MCPTool` plus `MCPStdioTool`, `MCPStreamableHTTPTool`, `MCPWebsocketTool` in [`_mcp.py`](https://github.com/microsoft/agent-framework/blob/main/python/packages/core/agent_framework/_mcp.py). The client-facing methods are `load_tools()`, `call_tool()`, `load_prompts()`, `get_prompt()` — no resource methods. .NET equivalents (e.g. `DefaultMcpToolHandler`) under [`dotnet/src/`](https://github.com/microsoft/agent-framework/tree/main/dotnet/src) expose `InvokeToolAsync()` only.
- **Resource RPC wired:** No MCP resource RPC at the model boundary. The only production `read_resource` callsites are in [`_skills.py`](https://github.com/microsoft/agent-framework/blob/main/python/packages/core/agent_framework/_skills.py) and refer to **skill** resources, not the model-facing MCP `resources/read`. All MCP `resources/read` references are confined to tests.
- **Update:** upstream has since added **MCP-based skills *discovery*** (recent commits use MCP resources internally for skill metadata / `skill://index.json` lookups via `_skills.py`) — but this is still not exposed to the model as a resource-read tool.
- **Why on the list:** dual-stack Python/.NET framework with rich skills metadata in the parallel skills survey. The asymmetry — skills support without a model-facing MCP resource tool — is the kind of gap a #2527-aligned PR would close.

---

#### crewAI
Verified at commit [`051fa0c`](https://github.com/crewAIInc/crewAI/commit/051fa0c1c) (2026-06) of the main `crewAI` repo, which vendors `crewai-tools` under `lib/crewai-tools/` (the adapter is now under `lib/crewai-tools/src/crewai_tools/`).

- **MCP integration:** [`mcp_adapter.py`](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai-tools/src/crewai_tools/adapters/mcp_adapter.py) imports `mcp` (`StdioServerParameters`, `CallToolResult`, `TextContent`, `Tool`) and `mcpadapt.core` (`MCPAdapt`, `ToolAdapter`); `CrewAIToolAdapter.adapt(func, mcp_tool: Tool)` converts MCP tools to CrewAI `BaseTool` objects.
- **Resource RPC wired:** No — `adapt()` is typed to accept only `mcp_tool: Tool`; zero matches for `resource`/`Resource` anywhere in the adapter file or directory. `_run()` extracts `CallToolResult` content only.
- **Model-facing tool:** None.
- **Why on the list:** Same upstream block as **smolagents** — both depend on [`mcpadapt`](https://github.com/grll/mcpadapt) (`mcpadapt>=0.1.9` declared as optional dep in `lib/crewai-tools/pyproject.toml`), which is tools-only. A single upstream change in `mcpadapt` flips both clients. This is the highest-leverage adapter-library target identified so far.

---

#### deepagents (LangChain)
Verified at commit [`436409f`](https://github.com/langchain-ai/deepagents/commit/436409fc) (2026-06-03). Note the repo has since been restructured into a monorepo — the MCP code now lives under `libs/code/deepagents_code/`.

- **MCP wiring is outsourced** to `langchain-mcp-adapters` — [`mcp_tools.py`](https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/mcp_tools.py) calls `convert_mcp_tool_to_langchain_tool()` / `_build_cached_mcp_tool()` (the older `load_mcp_tools()` entry point is no longer used). The adapter does not expose `resources/read` as a tool — zero hits for resource-read in deepagents source; sessions only call `list_tools()` / `call_tool()`.
- **What it would take:** either upstream adds a resource-read tool, or deepagents wraps `client.read_resource()` outside the adapter.

---

#### mastra
Verified at commit [`f82cc72`](https://github.com/mastra-ai/mastra/commit/f82cc72edc) (2026-06).

- **MCP integration:** [`packages/mcp/src/client/client.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/client.ts) imports `Client` from `@modelcontextprotocol/sdk/client/index.js`. [`actions/resource.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/actions/resource.ts) exposes `public async read(uri: string)` which directly returns `this.client.readResource(uri)`.
- **Resource RPC wired:** Yes, but **internal SDK only**. `ResourceClientActions` is mounted as `this.resources` on the client — an SDK surface for callers, not registered as an LLM-facing tool.
- **Model-facing tool:** No. The model-facing bridge is `tools()` at [`client.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/mcp/src/client/client.ts) which calls `this.client.listTools()` and iterates only the returned tools array — resources are never traversed.
- **Why on the list:** Mastra's skill versioning architecture (content-addressable BlobStore, draft→publish lifecycle) is the most sophisticated. Unlocking resource-read at the model boundary would be a small change relative to the rest of the framework — the SDK plumbing already exists.

---

#### strands-agents
Verified at commit [`0e0035f`](https://github.com/strands-agents/harness-sdk/commit/0e0035fb) (2026-06). Strands matches the **mastra pattern**: resource RPC wired in the SDK, but no model-facing tool. The Python SDK lives in the `strands-py/` package of the `strands-agents/harness-sdk` monorepo.

- **Resource RPC wired but unbridged:** `MCPClient.read_resource_sync()`, `list_resources_sync()`, and `list_resource_templates_sync()` in [`mcp_client.py`](https://github.com/strands-agents/harness-sdk/blob/main/strands-py/src/strands/tools/mcp/mcp_client.py) are SDK-public methods, but [`MCPAgentTool`](https://github.com/strands-agents/harness-sdk/blob/main/strands-py/src/strands/tools/mcp/mcp_agent_tool.py) only wraps `mcp.types.Tool` and delegates to `call_tool_async(...)`. Outside tests, nothing in the repo invokes the resource methods.
- **Why on the list:** Strands has its own local-filesystem skills implementation at [`agent_skills.py`](https://github.com/strands-agents/harness-sdk/blob/main/strands-py/src/strands/vended_plugins/skills/agent_skills.py), so the framework already does progressive disclosure. Wiring resource-read to the model is the obvious next step for an MCP-backed skill story.

---

### Coding agents / CLIs

#### codex (OpenAI)
Verified at commit [`ad2012d`](https://github.com/openai/codex/commit/ad2012d645b7146d31bb03f98e2bd9371635d11a). (The handlers were reorganized from the single `codex-rs/tools/src/mcp_resource_tool.rs` file into a per-tool module directory since the prior `67849d9` check.)

- **Model-facing tools:** `read_mcp_resource`, `list_mcp_resources`, `list_mcp_resource_templates`, each a handler module under [`codex-rs/core/src/tools/handlers/mcp_resource/`](https://github.com/openai/codex/tree/main/codex-rs/core/src/tools/handlers/mcp_resource); registered unconditionally via `add_mcp_resource_tools` in [`spec_plan.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs), gated on `context.mcp_tools.is_some()`. The read handler [`read_mcp_resource.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/mcp_resource/read_mcp_resource.rs) calls `session.read_resource(&server, …)`.
- **Signature:** `(server, uri)` — model names the server explicitly. No user-facing doc; an internal steer (in `apps_instructions.rs`) tells the model to prefer `tool_search`.

---

#### goose (AAIF)
Verified at commit [`45d8bf8`](https://github.com/aaif-goose/goose/commit/45d8bf81d09d478ceedba8f6d1f0ad906123a981).

- **Model-facing tools:** `read_resource`, `list_resources` registered in [`ext_manager.rs`](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/platform_extensions/ext_manager.rs) when at least one extension reports `ServerCapabilities::resources`. Dispatch flows through [`extension_manager.rs`](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/extension_manager.rs) → `client.read_resource(...)` → MCP `resources/read`. Documented at [`extension-manager-mcp.md`](https://github.com/block/goose/blob/main/documentation/docs/mcp/extension-manager-mcp.md).
- **Signature:** `(extension_name, uri)` on `read_resource` — `extension_name` is required. `list_resources` takes an optional `extension_name` filter; the tool description directs the model to call `list_resources` first when ownership is unknown.

---

#### hermes-agent (Nous Research)
Verified at commit [`03ba06e`](https://github.com/NousResearch/hermes-agent/commit/03ba06ebf) (2026-06). No drift across the 376 commits since the prior `72ff3e9` check.

- **MCP integration:** Full integration in [`tools/mcp_tool.py`](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_tool.py).
- **Resource RPC wired:** Yes — `_make_read_resource_handler()` calls `await server.session.read_resource(uri)`; the per-server schemas are built in `_build_utility_schemas()`.
- **Model-facing tools:** Yes — both `mcp_{safe_name}_read_resource` (taking `uri`) and `mcp_{safe_name}_list_resources` (no parameters) registered per connected server via `_build_utility_schemas()`. Conditionally registered when the server advertises `capabilities.resources` AND the per-server `tools.resources` config flag is on (default).
- **Signature:** `(uri)` — server is encoded in the tool name (one tool per server), so the model implicitly selects the server by selecting the tool. **Distinct from every other pattern surveyed**: not `(server, uri)`, not `(resource_names: array[string])` batch, not `(uri)`-with-probing, not URI-virtualized — it's *one tool per server*. The matching `list_resources` per server gives the model a discovery affordance without cross-server probing.
- **End-user docs:** [`features/mcp.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) and [`guides/use-mcp-with-hermes.md`](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md) both document the utility wrappers. (Minor doc/code mismatch: the user-facing docs name the tools as bare `read_resource` / `list_resources`, but the actual model-facing names include the `mcp_{server}_` prefix.)
- **Why interesting:** The per-server-tool naming is a candidate disambiguation pattern for skills-over-MCP — the model can't pick the wrong server because each tool only binds to one.

---

#### Claude Code (closed source — reference only)

Claude Code is closed source so we cannot verify the loader, but the [public tools reference](https://code.claude.com/docs/en/tools-reference) documents `ReadMcpResourceTool` accepting `server` and `uri` parameters. Listed here as a reference data point for the `(server, uri)` signature shape also adopted by Codex, Goose, fast-agent, and Cline.

---

#### opencode
Verified at commit [`2a33add`](https://github.com/anomalyco/opencode/commit/2a33addd2) on the canonical `dev` default branch.

- **Tools forwarded to the model** in [`packages/opencode/src/mcp/index.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/mcp/index.ts) via `client.callTool()`; tool naming convention `{server_name}_{tool_name}` (sanitized, underscore-separated — `sanitize(clientName) + "_" + sanitize(mcpTool.name)`). The model-tool bridge in [`packages/opencode/src/session/tools.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/session/tools.ts) forwards only `mcp.tools()`.
- **Resource-read is UI-only:** `readResource()` in the same file is invoked only from the file picker (`session/prompt.ts` attachment path), never registered as an LLM tool. Docs ([`mcp-servers.mdx`](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/mcp-servers.mdx)) advertise tool forwarding only.

---

### IDE extensions

#### vscode (GitHub Copilot)
Verified at commit [`ebb335f`](https://github.com/microsoft/vscode/commit/ebb335fad02) (vscode core, 2026-06-03); the Copilot Chat extension was re-checked against current `microsoft/vscode-copilot-chat` main. VS Code is the unique pattern here: no MCP-specific tool — generic `copilot_readFile` / `copilot_listDirectory` tools transparently reach MCP servers via filesystem-provider indirection on a custom URI scheme.

- **URI scheme + FS provider:** [`McpResourceURI`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpTypes.ts) defines `mcp-resource://` URIs that encode the MCP server's definition ID in the authority — self-routing. [`McpResourceFilesystem`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpResourceFilesystem.ts) is registered for that scheme; `_readURIInner` decodes the URI, looks up the `McpServer`, and calls `r.readResource(...)` — the MCP `resources/read` RPC. Capability-gated on `McpCapability.Resources`.
- **`resource_link` pre-wrap — removed:** the doc previously described `mcpLanguageModelToolContribution.ts` converting an MCP tool's `resource_link` into an `mcp-resource://` URI for later re-reading via `copilot_readFile`. As of current main that file is gone and `microsoft/vscode-copilot-chat` no longer references the `mcp-resource://` scheme at all. The core scheme + FS provider in vscode itself remain intact, but the extension no longer auto-wraps `resource_link`s — so the model now has fewer built-in ways to obtain such a URI (the live forwarding path observed in the local clone renders `resource_link`s as plain text). *Worth re-confirming the current intended mechanism upstream.*
- **Caveat — discoverability:** the model can only read a URI it has been handed (e.g. a user attachment). No `list_mcp_resources`-equivalent **for the model**. Note vscode core *does* now expose `IMcpServer.resources()` / `resourceTemplates()` ([`mcpTypes.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpTypes.ts)), but these feed a *user-facing* resource quick-pick (`mcpResourceQuickAccess.ts`), not a model tool. [Connor Peet on PR #2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527#issuecomment-4282395437) is the clearest write-up of this pattern.

---

#### cline

Verified at commit [`81792d2`](https://github.com/cline/cline/commit/81792d20c) (2026-06-04). Note the repo restructured into a monorepo — the VS Code extension source now lives under `apps/vscode/src/` (was `src/`).

- **MCP integration:** Depends on `@modelcontextprotocol/sdk` `^1.25.1` per `apps/vscode/package.json`.
- **Resource RPC wired:** Yes. [`McpHub.readResource(serverName, uri)`](https://github.com/cline/cline/blob/main/apps/vscode/src/services/mcp/McpHub.ts) issues a raw `resources/read` request against the named connection's client and decodes with `ReadResourceResultSchema`.
- **Model-facing tool:** Yes. [`AccessMcpResourceHandler`](https://github.com/cline/cline/blob/main/apps/vscode/src/core/task/tools/handlers/AccessMcpResourceHandler.ts) calls `mcpHub.readResource(...)` from the model-tool execution pipeline. The model sees `access_mcp_resource` as a registered tool taking `(server_name, uri)`.
- **Discoverability:** The [system-prompt formatter](https://github.com/cline/cline/blob/main/apps/vscode/src/core/prompts/system-prompt/components/mcp.ts) enumerates each connected server's `resources` and `resourceTemplates` in `formatMcpServersList()`. Populated by `fetchResourcesList()` and `fetchResourceTemplatesList()` in `McpHub.ts`.
- **End-user docs:** none found in `README.md`; no `docs/` directory in the repo root.
- **Why interesting:** Cline has the most extensive skills implementation in the parallel survey (incl. the admin-locked enterprise `globalSkills` primitive), so the *presence* of full resource-read support, in-prompt enumeration, and dedicated handler is the natural complement.

## Takeaways for SEP-2640 (skills extension)

- **First shipped client + server pair.** **fast-agent** is the first surveyed client to ship a SEP-2640 implementation — but scoped to *registry/install*: it consumes the `io.modelcontextprotocol/skills` extension to install SHA256-verified skills into its managed skills directory, and does not (yet) read skill resources at model runtime. It was verified live against the **Hugging Face MCP server**, the first server-side implementation we've interoperated with (advertises the extension + `resources: { subscribe: false, listChanged: false }`, serves `skill://` resources; tracked in [skills-extension-candidates.md](skills-extension-candidates.md)). Notably, the first real-world wrinkle was operational, not protocol-level: a client that retry-loops `resources/subscribe` (cursor-vscode) flooded the HF server, prompting a client-denylist mitigation ([hf-mcp-server#164](https://github.com/huggingface/hf-mcp-server/pull/164)) — a reminder that serving skills as resources inherits the resource subsystem's failure modes.
- **Seven of thirteen open-source clients surveyed** (Codex, Goose, fast-agent, VS Code, hermes-agent, adk-python, Cline) satisfy #2527's SHOULD; closed-source Claude Code's public docs confirm it does too. Goose and hermes-agent also satisfy the implicit expectation that this be documented for end users; the other implementers ship the affordance with no user-facing documentation.
- **Four implementation patterns** for model-facing MCP resource access — all support the layering Peter sketches in his #2640 comment, but with different costs:
  - **Dedicated tools, `(server, uri)`** (Codex, Goose, Claude Code, fast-agent, Cline — fast-agent is also multiplexed across `internal://`): explicit `read_resource` / `access_mcp_resource` registered alongside other MCP tools. Most discoverable; closest literal reading of #2527. By volume, this is the dominant pattern.
  - **Dedicated tool, `(resource_names: array[string])`** (adk-python): batch read; the available resources are surfaced to the model via context injection rather than a separate list tool. Same affordance shape as the `(server, uri)` family but with the server identifier embedded in the catalogued resource name rather than passed as a parameter.
  - **One tool per server, `(uri)`** (hermes-agent): server is encoded in the tool name (`mcp_{server}_read_resource`), so the model selects the server by selecting the tool. Trades catalog tokens for unambiguity. Pairs with `mcp_{server}_list_resources` so the model has a per-server discovery affordance.
  - **FS-provider indirection via namespaced URIs** (VS Code): no MCP-specific tool. `mcp-resource://` URIs are registered with the file service; generic `readFile` / `listDirectory` tools transparently reach `resources/read`. Costs nothing in tool-count budget; loses `list` affordance.

  Reliability implication: each pattern enforces server identity differently — explicit parameter (`(server, uri)`), tool choice (per-server tool), catalog-name lookup (adk-python), or URI authority (`mcp-resource://<server-id>/...`). **The spec should nudge implementations to keep server identity mandatory** so a skill always resolves to its owning server. Otherwise the host has to probe every connected server when the model omits it — either silently picking the wrong one, or iterating through all of them at the cost of latency and tokens.
- **Adapter libraries block two "no" rows.** **crewAI** depends on [`mcpadapt`](https://github.com/grll/mcpadapt); **deepagents** depends on [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters). Both adapters are tools-only — the unlock for either client lives in the adapter, not the client repo.
- **Internal SDK without LLM-tool exposure** (mastra, strands-agents) is its own pattern: the resource RPC is wired in the SDK but not bridged to the model. Closing this gap is typically smaller-scope than wiring the RPC from scratch.
