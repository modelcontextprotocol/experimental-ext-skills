# Experimental Findings

> ℹ️ **This document is not actively maintained.** It captures a snapshot of early findings. Current discussion and decisions are tracked in the [meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg), [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084), and on the [SEP-2640 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

> **Contributing findings?** See [#50](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/50) for the contribution template proposal.

## VS Code: MCP-served skills as agent skills (Issue #66)

**Branch:** local `feature/sep2640-mcp-skill-discovery` on [microsoft/vscode](https://github.com/microsoft/vscode) (personal exploration, not submitted upstream)

Implemented `skill://` discovery in VS Code proper, the client [issue #66](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/66) names. Adds `mcpSkillDiscovery.ts` to the MCP contrib and merges its results into the chat prompt service under a new `PromptsStorage.mcp`.

**Findings:**

- **VS Code already implements the whole progressive-disclosure loop — it just had no MCP source.** `computeAutomaticInstructions.ts` calls `promptsService.findAgentSkills()`, injects only each skill's `name`/`description` into a `<skills>` context block, and points the model at a `skill` tool to load full content on demand. That is the same shape as [skillsdotnet](https://github.com/PederHP/skillsdotnet)'s `SkillCatalog` (`GetSkillContexts()` + `load_skill`), already shipping in a major client. The gap was purely that `IAgentSkill` could only originate from disk, extensions, or plugins.
- **The loading half of SEP-2640 needs no client code in VS Code.** Because `McpResourceFilesystem` registers `mcp-resource://` with `IFileService`, mapping a discovered `skill://…/SKILL.md` to an `mcp-resource://` URI is sufficient — the existing skill tool reads it through the ordinary file path and each read becomes an MCP `resources/read`. This is the concrete payoff of the FS-provider pattern noted in [client-mcp-support.md](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/92); only *discovery* had to be written, and the SEP's "treat filesystem and MCP skills identically" recommendation falls out for free rather than needing to be engineered.
- **Adding a skill source has a wider blast radius than expected.** `PromptsStorage` is shadowed by a parallel `AICustomizationSource` string union and an exhaustive switch in the extension-host protocol layer; a new variant breaks both. Worth noting for other hosts: "where can a skill come from" is often encoded in more than one place.
- **Enumeration being optional is easy to get wrong by construction.** Both discovery mechanisms (`skill://index.json` and `resources/list`) are attempted and merged, because a server may implement either, both, or neither — and a server implementing neither still serves readable skills. A client that reads only the index silently misses those.
- **Precedence needs an explicit decision.** Local skills win name collisions here, so a connected server cannot shadow a skill the user has on disk. The SEP does not speak to cross-source precedence; hosts merging MCP skills into an existing local skill namespace each have to pick.

**Verification:** full `tsc --noEmit` over VS Code's `src/` passes with 0 errors; 7 new unit tests pass (including a `skill://` → `mcp-resource://` round trip through real `McpResourceURI` code); 112 existing promptSyntax tests still pass.

**Remaining concerns:**

- **Not verified end-to-end against a running server.** VS Code's `npm install` fails on `foundry-local-sdk`, which downloads a native library from a Microsoft-internal Azure feed (HTTP 401 without credentials). Dependencies were installed with `--ignore-scripts` to get type-checking and unit tests, but that leaves the app unable to actually launch, so the flow was never exercised against a live MCP server. Everything above is static and unit-level verification only.
- Resource templates (`type: "mcp-resource-template"` index entries) are parsed but not materialized — they need the completion API to resolve.
- No `resources/subscribe` handling, so skill updates mid-session are not picked up.
- MCP skills are deliberately excluded from the AI Customization management editor, whose open/edit affordances assume a writable local file.

## Prototype: skill Resource Discovery and Loading (Issue #66)

**Repo:** [`prototypes/issue-66-skill-resource-loading/`](../prototypes/issue-66-skill-resource-loading/) (this repo, personal fork exploration — not submitted upstream)

Built a standalone Node.js MCP server + client pair to exercise [issue #66](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/66) against the merged [SEP-2640 draft](sep-draft-skills-extension.md), rather than the older custom-methods design #66 originally cited. Considered wiring this into an existing production MCP server first (a Shop-Africa/"SASE" search server) but that server had already tried and deliberately reverted protocol-level skill wiring in favor of plain filesystem-only Agent Skill content — reviving that felt like the wrong foundation for a clean test, so this is a from-scratch fixture instead.

**Findings:**

- The four-way scheme convergence the URI-scheme survey describes ([skill-uri-scheme.md](skill-uri-scheme.md)) holds up in practice: implementing `skill://<skill-path>/SKILL.md` end-to-end (server registration → `resources/list` → `resources/read`) required no protocol changes beyond what a stock `@modelcontextprotocol/sdk` `Server` already supports — no SDK-level skill helpers exist yet, so the mapping (frontmatter parsing, path-to-name validation, index generation) had to be hand-rolled.
- The "enumeration is optional" design point ([sep-draft-skills-extension.md §Why Is Enumeration Optional?](sep-draft-skills-extension.md#why-is-enumeration-optional)) is real and testable: a skill (`hidden-skill`) excluded from both `resources/list` and `skill://index.json` was still successfully read via a bare `resources/read` call. This required using the low-level `Server` API directly — the SDK's higher-level `McpServer.registerResource()` helper auto-lists anything registered through it, so it can't produce an unlisted-but-readable resource; that's a real ergonomic gap for servers wanting the "hidden skill" pattern.
- Enforcing "final `<skill-path>` segment MUST equal frontmatter `name`" at load time (throwing otherwise) was cheap to add and caught what would otherwise be a silent spec violation — worth SDK helpers validating this by default.
- Skill resources were identified purely by the `skill://` scheme prefix plus the well-known index — no custom `_meta` keys were needed. The trade-off against metadata-based identification ([#54](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/54)): scheme-based needs zero extra fields and works immediately for any client recognizing the prefix, but carries no structured metadata (tags, versioning, provenance) without layering `_meta` on anyway.
- Noticed a discrepancy in this repo's own docs: `sep-draft-skills-extension.md` states the index `digest` field is omitted, but [PR #96](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/96) is titled "reinstate `digest` field in `skill://index.json`" — the two are inconsistent and unresolved as of this writing.

**Remaining concerns:**

- This does not satisfy #66's actual acceptance criteria (integration in a *major* open-source client like VS Code) — it's a local test bed, not a client integration. Left open which client, if any, this should feed into next.
- No evaluation was done of `resources/subscribe`/`resources/updated` for live skill updates — the fixture skills are static for the lifetime of the server process.

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
