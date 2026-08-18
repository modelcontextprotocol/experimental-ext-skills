# Experimental Findings

> ℹ️ **This document is not actively maintained.** It captures a snapshot of early findings. Current discussion and decisions are tracked in the [meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg), [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084), and on the [SEP-2640 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

> **Contributing findings?** See [#50](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/50) for the contribution template proposal.

## VS Code: MCP-served skills as agent skills (Issue #66)

**Implementation:** [tobi-oye/vscode#1](https://github.com/tobi-oye/vscode/pull/1) — on a [microsoft/vscode](https://github.com/microsoft/vscode) fork (personal exploration, not submitted upstream)

Added `skill://` discovery to VS Code and verified it against the [Hugging Face MCP server](https://github.com/huggingface/hf-mcp-server) (`https://huggingface.co/mcp`). VS Code discovered 8 skills and offered them to the model with no manual attachment.

**Findings:**

- **VS Code already had the whole progressive-disclosure loop; it just had no MCP source.** `findAgentSkills()` → `name`/`description` into a `<skills>` block → a model-facing `skill` tool. Same shape as [skillsdotnet](https://github.com/PederHP/skillsdotnet)'s `SkillCatalog`. Only the MCP origin was missing.
- **The loading half needed no code.** `mcp-resource://` is already registered with VS Code's `IFileService`, so mapping `skill://…/SKILL.md` onto it is enough — the existing skill tool reads it and each read becomes a `resources/read`. "Treat filesystem and MCP skills identically" falls out for free.
- **The index wire format had already moved past the checked-in draft.** The live server serves `{url, digest, frontmatter:{name, description}}`; the draft here specifies top-level `name`/`description` and a required `type: "skill-md"`. A parser written to the draft matches **zero** entries on a real server. Accepting both shapes is three lines.
- **Per-context-computation discovery is an accidental DoS.** `findAgentSkills()` runs on every context rebuild; discovery is two round trips per server. A naive version issued 20 index reads for one chat turn. Same shape as the incident behind hf-mcp-server's client denylist ([#164](https://github.com/huggingface/hf-mcp-server/pull/164), ~100k req/min). Cache the *promise*, keyed on connection state — not just server id, or a lookup made while a server was stopped pins an empty result.
- **Cross-server name collisions are unspecified.** Skill names are a flat namespace. The SEP ties the final URI segment to the frontmatter `name` but says nothing about two servers both serving `deploy`. Local-over-MCP is defensible; MCP-vs-MCP degenerates to discovery order. **Worth an explicit note in the SEP.**
- **Provenance reaches the UI but not the model.** The `<skills>` block emits only `<name>`, `<description>`, `<file>` — and `<file>` encodes an opaque server id. Loading is never ambiguous, but a model reasoning across servers has no legible origin signal.
- **Archives cost 17 of 25 skills.** Archive-only entries have no `url` to a `SKILL.md`, so a resource-reading host skips them. Archives were removed from SEP-2640 (decision log, 2026-07-16); until servers follow, such hosts see a fraction of what is offered.
- **Adding a skill source touched four type surfaces** that must agree (storage enum, a parallel source union, an ext-host DTO, a proposed API type). Missing two produced a runtime throw that broke chat while `tsc` stayed green.
- **Identifying skills by URL alone was enough ([#54](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/54)).** `skill://` prefix plus `/SKILL.md` suffix, no `_meta` read — a two-line filter with nothing to negotiate. Because the last path segment must match the skill name, the name is readable off the URL, so a picker fills without fetching every `SKILL.md`. The tradeoff is that a URL carries no structured metadata; tags, versions or provenance would still need `_meta`.
- **The index ships a `digest` that this client ignores.** The live server sends `sha256:` per entry; nothing here verifies it, so a corrupted or swapped skill loads silently. fast-agent does check it. Worth settling whether verification is the host's job — the draft currently leans on it being "the transport's concern over an authenticated MCP connection".

**Verification:** `tsc` clean; 10 unit tests (incl. `skill://` → `mcp-resource://` round trip and index parsing against verbatim live output); 112 existing promptSyntax tests pass; discovery confirmed against the live server.

**Note:** none of the three defects above were caught by type-checking or unit tests — all surfaced only from running against a real server.

**Open:**

- **Model invocation not demonstrated.** Discovery and contribution are confirmed; no run yet shows the model choosing to load an MCP-served skill. Confounded by source builds being unable to reach the Copilot service (OSS `product.json` ships no OAuth client config) and by a small auto-routed model. Consistent with the adherence problems recorded elsewhere on this page.
- Resource templates parsed but not materialized (need the completion API).
- No `resources/subscribe`, so mid-session skill updates are missed.

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
