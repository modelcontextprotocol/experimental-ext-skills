# Experimental Findings

> **Contributing findings?** See [#50](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/50) for the contribution template proposal.

## McpGraph: Skills in MCP Server Repo

**Repo:** [TeamSparkAI/mcpGraph](https://github.com/TeamSparkAI/mcpGraph)
**Skill:** [mcpgraphtoolkit/SKILL.md](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) (875+ lines)

Bob Dickinson built a standalone SKILL.md file that lives in the same repo as the MCP server, but they weren't formally connected. The skill instructs agents on building directed graphs of MCP nodes to orchestrate tool calls.

**Findings:**

- Claude ignored the SKILL.md initially, even when the skill and server had similar descriptions
- Claude would fail at using the server tools a couple times, then read the skill and succeed
- Expected Claude to start with the skill ("I know how to do X") before the server ("I do X"), but it didn't

**Resolution:** Added a server instruction telling the agent to read the SKILL.md before using the tool. That one change caused Claude to reliably read the skill first.

**Remaining concerns:**

- This workaround works for 1:1 skill-to-server case, but doesn't solve discovery — users installing from a registry don't know to also install the skill
- Distinguishes between "skill required to make the server work at all" vs. "skill that orchestrates tools you could use without it" — potentially different solutions needed

## Skilljack MCP

**Repo:** [olaservo/skilljack-mcp](https://github.com/olaservo/skilljack-mcp)

Loads skills into tool descriptions. Uses dynamic tool updates to keep the skills manifest current.

Example eval approach and observations here: https://github.com/olaservo/skilljack-mcp/blob/main/evals/README.md

## FastMCP 3.0 Skills Support

**URL:** [gofastmcp.com/servers/providers/skills](https://gofastmcp.com/servers/providers/skills)

FastMCP added skills support in version 3.0. Worth examining for alignment with other approaches.

**Update model comparison (Feb 26 office hours):**

- FastMCP supports more of a "pull" model for updating resources that have changed
- The skills-as-resources implementation in this repo ([PR #16](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/16)) watches for changes and allows clients to subscribe to resources via `resources/subscribe` and `resources/updated` notifications — more of a "push" model
- Both models are worth evaluating; the right choice is likely use-case specific

**Related:** [jlowin/fastmcp#2694](https://github.com/jlowin/fastmcp/issues/2694)

## PydanticAI Skills Support

**PR:** [pydantic/pydantic-ai#3780](https://github.com/pydantic/pydantic-ai/pull/3780)

Introduces support for agent skills with a tools-based approach.

## NimbleBrain: skill:// Resource Consolidation

[Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain) had previously maintained separate components for MCP server code, a skills monorepo, and registry metadata with `server.json`. After community discussion, he consolidated into single atomic repos per server with skills exposed as `skill://` resources directly on the server.

**Findings:**

- Collapsing three separate artifacts into one repo simplified build, versioning, and deployment — skills are colocated with the tools they describe and shipped atomically
- `skill://` resources enable ephemeral/installless availability: skill context is present while the server is installed and disappears when it disconnects, with no git cloning or file system access required on the client side
- Quick tests showed same or better results compared to the previous approach of injecting skills upstream before the LLM call
- Validates the skills-as-resources approach documented in [Approach 3](approaches.md#3-skills-as-tools-andor-resources)

**Reference implementations:** [mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search)

**Community input:**

> "Skills living as skill:// resources on the server itself was the natural endpoint of that consolidation. The skill context is colocated with the tools it describes, versioned together, shipped together." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain), via Discord

## Skill Reliability and Adherence

Multiple community members have independently reported that models do not reliably load or follow skill instructions, even when skills are preloaded in context. This is a cross-cutting behavioral problem, not specific to any single implementation approach.

**Findings:**

- Models appear to frequently ignore available skills, requiring hooks or repeated prompting to trigger skill loading
- Skill adherence appears to be "time-decaying" similar to other model instructions — models follow instructions initially but lose adherence as the context window grows and compaction occurs
- Behavior is model-specific: weaker models show lower success rates with lazy-loaded skills
- One effective workaround observed by Kryspin: wrapping skills in a subagent whose name or description mentions the skill topic
- Community desire for "skill autoloads" and "dynamic memory autoloads" as design patterns

**Community input:**

> "Even Opus 4.6 needs to be constantly bugged to load skills when they're preloaded in the context already. I actually have a hook that reminds it to load skills and it still just doesn't a lot of the time." — Luca (AWS), via Discord

> "I also have this problem with skills: they're useful… when used. Which isn't nearly often enough." — Jeremiah (FastMCP), via Discord

> "Skills are ephemeral and/or time decaying — it clicks once and then give it some time and they lose the plot." — Kryspin (qcompute), via Discord

> "I've seen lazy load skills with various degrees of success, actually looks like it might be model specific… [best pattern is] putting them in with a subagent that similarly named or mentions the topic in their description." — Kryspin (qcompute), via Discord

**See also:** [#37](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/37) — Compare skill delivery mechanisms: file-based vs MCP-based

## Resource Template Skill Discovery (GitHub MCP Server PoC)

**PR:** [github/github-mcp-server#2129](https://github.com/github/github-mcp-server/pull/2129)
**Author:** [Sam Morrow](https://github.com/SamMorrowDrums) (GitHub)
**Local prototype:** [examples/resource-template-discovery](../examples/resource-template-discovery/)
**SDK extensions:** [typescript/sdk/src/template.ts](../typescript/sdk/src/template.ts)

Sam Morrow (GitHub) built a proof-of-concept that uses MCP resource templates to dynamically expose skills across GitHub repos. Instead of listing all skills via `resources/list`, the server exposes URI templates (`skill://{owner}/{repo}/{skill_name}/SKILL.md`) and supports `completion/complete` to enumerate available skills within a given repo. The manifest returns `repo://` URIs that reference files through already-registered repository content resources.

This approach solves a scale problem: GitHub has millions of repos, making static `resources/list` enumeration infeasible. Resource templates let the client (or model) drive discovery by progressively narrowing scope: first select an owner, then a repo, then a skill name.

**Findings:**

- **Q1: Can existing SDK clients load skills from resource templates?** No. The existing `listSkillResources()` function only calls `resources/list` and filters for `skill://` URIs. A template-only server returns zero skills through that path. This was empirically confirmed: the integration test shows `listSkillResources()` returns an empty array when pointed at the template fixture server.

- **Q2: Can any MCP client follow the manifest → URI → content chain?** Yes. The MCP SDK's `Client.readResource()` works with any URI the server accepts. The chain is straightforward: read manifest URI → parse JSON → call `readResource()` for each file URI. No special client support is needed beyond basic `resources/read`. The integration test demonstrates this working with `file://` URIs (local equivalent of GitHub's `repo://`).

- **Q3: What client-side changes are needed?** New SDK functions were built to support template-based discovery:
  - `listSkillTemplates()` — calls `resources/templates/list`, filters for `skill://` templates
  - `completeTemplateArg()` — wraps `completion/complete` for template arguments
  - `discoverSkillsFromTemplate()` — uses completions to enumerate skills, returns `SkillSummary[]`
  - `loadSkillFromTemplate()` — expands template URI, reads content + optional manifest
  - `resolveManifestFiles()` — follows manifest URIs to load all referenced files

  These are additive — the existing `resources/list`-based functions continue to work unchanged.

- **Q4: Template completion vs. resources/list for discovery UX?** They are complementary, not competing:
  - `resources/list` is a single call that returns all skills — works well for bounded skill sets (a single server's skills)
  - Templates require a multi-step completion flow (resolve owner → repo → skill_name) — scales to unbounded namespaces (all of GitHub)
  - Template discovery is model-driven or application-driven; `resources/list` is application-controlled
  - A client should support both: try `resources/list` first for simple servers, fall back to templates for large-scale providers

**URI scheme divergence:**

The GitHub PoC uses `skill://{owner}/{repo}/{skill_name}/SKILL.md` while the existing SDK uses `skill://{name}/SKILL.md`. This is a natural consequence of scoping: GitHub needs `owner+repo` to locate a skill; a standalone server already knows its scope. Both are valid `skill://` URIs. The template-aware client code handles this by detecting template variables rather than hardcoding URI depth.

**Protocol observations:**

- No MCP protocol changes are needed — `resources/templates/list`, `completion/complete`, and `resources/read` are all existing protocol methods
- The `completion/complete` protocol returns up to 100 values with a `hasMore` flag but no cursor for paging beyond that — a potential limitation for repos with many skills
- Cross-scheme URI resolution (manifest returns `repo://` URIs that the same server resolves) works naturally with `resources/read`

### High-level discovery API

The low-level SDK functions (list templates, complete args, discover, load) were composed into a single high-level function:

```typescript
const allSkills = await discoverAllSkillsFromTemplates(client, {
  owner: "github",
  repo: "awesome-copilot",
});
// Returns LoadedTemplateSkill[] with name, uri, content, frontmatter, manifest
```

`discoverAllSkillsFromTemplates()` chains the full flow: `listSkillTemplates → completions → loadSkillFromTemplate`. The caller provides resolved args for non-skill-name variables (e.g., owner/repo); the function enumerates skill names via completions and loads each one. This is the building block for `SkillCatalog.addClientFromTemplates()` — when the SkillCatalog from [PR #58](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/58) merges, adding template support is a thin wrapper around this function.

### MCP docs as template-discovered content

To validate that the template discovery pattern generalizes beyond `skill://` URIs, a second example server was built that serves the MCP project's own documentation (171 `.mdx` files from [docs.modelcontextprotocol.io](https://docs.modelcontextprotocol.io)) via a single resource template:

```
docs://{section}/{topic}/{+path}
```

**Progressive narrowing with context-dependent completions:**

| Level | Variable | Example completions | Context required |
|---|---|---|---|
| 1 | `section` | `docs`, `specification`, `extensions`, `registry`, `seps`, `community` | None |
| 2 | `topic` | `2025-11-25`, `draft` (for spec); `governance`, `get-started` (for others) | `section` |
| 3 | `path` | `server/resources`, `basic/lifecycle` | `section` + `topic` |

The server parses the Mintlify `docs.json` navigation tree at startup, building a lookup index that maps `(section, topic, path)` triples back to filesystem paths. This handles structural nuances: the Specification tab uses `versions` instead of `pages`, groups can nest (e.g., "Server Features" → "Utilities"), and some pages cross section boundaries (e.g., `specification/versioning` under the Documentation tab).

Context-dependent completions are supported by the MCP SDK's `CompleteResourceTemplateCallback` signature — `(value: string, context?: { arguments?: Record<string, string> })` — which `McpServer.handleResourceCompletion` passes through from the `completion/complete` request.

**Key observation:** This is the same progressive narrowing pattern that the skill trees discussion ([agentskills#153](https://github.com/agentskills/agentskills/discussions/153)) proposes — template variables *are* a hierarchy, using existing MCP protocol. No spec changes needed.

**Prototype:** [olaservo/mcp-docs-template-discovery](https://github.com/olaservo/mcp-docs-template-discovery)

### Related spec work

- **[SEP-2093](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093)** (in-review): Resource Contents Metadata and Capabilities, by Peter Alexander (Anthropic). Proposes URI-scoped `resources/list` and per-resource `capabilities: { list, subscribe }`, which would enable hierarchical resource traversal as an alternative to template-based discovery. See comparison below.

- **[SEP-2293](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2293)** (in-review): Adds `title` and `description` fields to completion values. Sam Morrow (GitHub) commented that GitHub wants this for issue/PR/commit completions where "it's basically useless without additional text." Once merged, template servers could return page titles from frontmatter alongside completion paths. Our docs server already parses frontmatter titles at startup — wiring them into rich completions would be a small change.

- **[SEP-1440](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1440)** (in-review): The original proposal by Kent C. Dodds for rich completion metadata. SEP-2293 supersedes the original PR.

No open PRs changing the 100-item completion cap or context argument passing.

### SEP-2093: an alternative path to progressive discovery

[SEP-2093](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093) proposes adding an optional `uri` parameter to `resources/list` so clients can list children of a specific resource. Combined with per-resource `capabilities: { list: true }`, this enables hierarchical browsing without templates or completions:

```
resources/list()                                           → [{ uri: "skill://", capabilities: { list: true } }]
resources/list({ uri: "skill://" })                        → [{ uri: "skill://github/", ... }]
resources/list({ uri: "skill://github/awesome-copilot/" }) → [{ uri: "skill://github/awesome-copilot/copilot-sdk/SKILL.md", ... }]
```

**Comparison with template-based discovery:**

| | Templates + completions (current) | Hierarchical resources/list (SEP-2093) |
|---|---|---|
| **Spec changes needed** | None | Requires SEP-2093 |
| **Discovery model** | Fill in template variables via completions | Browse resource tree via scoped list |
| **Server declares** | URI template + completion handlers | Resources with `list` capability |
| **Progressive narrowing** | `completion/complete` with context arguments | `resources/list` with URI scope |
| **Result metadata** | Strings only (or title/desc with SEP-2293) | Full `Resource` metadata (name, description, annotations, size) |
| **Pagination** | 100-item completion cap, no cursor | Standard `resources/list` pagination with cursors |
| **Best fit** | Parameterized discovery (variables have semantic meaning) | Browsable collections (file-system-like) |

**They are complementary, not competing.** A server could support both — templates for model-driven exploration (agent fills in owner → repo → skill) and hierarchical list for application-driven browsing (client UI showing a tree). The template approach works today with no spec changes; hierarchical list would provide richer metadata and proper pagination once SEP-2093 lands.

**What SEP-2093 solves that templates don't:**
- **Metadata on intermediate nodes** — Each level in the hierarchy returns full `Resource` objects with name, description, and annotations, not just string completions. This eliminates the gap that SEP-2293 (rich completion values) addresses for the template path.
- **Proper pagination** — `resources/list` supports cursors. Template completions are capped at 100 with no cursor, which we hit empirically against `github/awesome-copilot`.
- **`resources/metadata` without content** — Clients can check metadata (size, mimeType, annotations) before fetching content, enabling conditional loading.

**What templates solve that SEP-2093 doesn't:**
- **Works today** — No spec changes required. Any MCP server can expose templates now.
- **Semantic variables** — Template variables like `{owner}`, `{repo}`, `{skill_name}` carry meaning that informs the model's choices. Hierarchical list just shows children — the agent has to infer what each level represents.
- **Model-driven exploration** — Completions are designed for the model to fill in interactively. Hierarchical list is designed for application-level traversal.

**Our template work is a data point for both SEPs.** The docs server and skill fixture server demonstrate what's achievable without spec changes and where the gaps are (metadata richness, pagination cap). If SEP-2093 lands, migrating the docs server to hierarchical list would be straightforward — the navigation index already models the hierarchy.

**See also:** [#57](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/57) — Investigate resource template skill discovery
