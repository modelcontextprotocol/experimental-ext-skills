# Experimental Findings

> ℹ️ **This document is not actively maintained.** It captures a snapshot of early findings. Current discussion and decisions are tracked in the [meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg), [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084), and on the [SEP-2640 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

> **Contributing findings?** Start with the [experimental findings template](findings-template.md).

## VS Code: MCP-served skills as agent skills (Issue #66)

**Branch:** local `feature/sep2640-mcp-skill-discovery` on [microsoft/vscode](https://github.com/microsoft/vscode) (personal exploration, not submitted upstream)

Implemented `skill://` discovery in VS Code proper, the client [issue #66](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/66) names. Adds `mcpSkillDiscovery.ts` to the MCP contrib and merges its results into the chat prompt service under a new `PromptsStorage.mcp`.

**Findings:**

- **VS Code already implements the whole progressive-disclosure loop — it just had no MCP source.** `computeAutomaticInstructions.ts` calls `promptsService.findAgentSkills()`, injects only each skill's `name`/`description` into a `<skills>` context block, and points the model at a `skill` tool to load full content on demand. That is the same shape as [skillsdotnet](https://github.com/PederHP/skillsdotnet)'s `SkillCatalog` (`GetSkillContexts()` + `load_skill`), already shipping in a major client. The gap was purely that `IAgentSkill` could only originate from disk, extensions, or plugins.
- **The loading half of SEP-2640 needs no client code in VS Code.** Because `McpResourceFilesystem` registers `mcp-resource://` with `IFileService`, mapping a discovered `skill://…/SKILL.md` to an `mcp-resource://` URI is sufficient — the existing skill tool reads it through the ordinary file path and each read becomes an MCP `resources/read`. This is the concrete payoff of the FS-provider pattern noted in [client-mcp-support.md](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/92); only *discovery* had to be written, and the SEP's "treat filesystem and MCP skills identically" recommendation falls out for free rather than needing to be engineered.
- **Adding a skill source has a wider blast radius than expected.** `PromptsStorage` is shadowed by a parallel `AICustomizationSource` string union and an exhaustive switch in the extension-host protocol layer; a new variant breaks both. Worth noting for other hosts: "where can a skill come from" is often encoded in more than one place.
- **Enumeration being optional is easy to get wrong by construction.** Both discovery mechanisms (`skill://index.json` and `resources/list`) are attempted and merged, because a server may implement either, both, or neither — and a server implementing neither still serves readable skills. A client that reads only the index silently misses those.
- **Precedence needs an explicit decision.** Local skills win name collisions here, so a connected server cannot shadow a skill the user has on disk. The SEP does not speak to cross-source precedence; hosts merging MCP skills into an existing local skill namespace each have to pick.
- **URI-based vs. metadata-based identification ([#54](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/54)):** skills are identified purely by the `skill://` scheme prefix plus the `/SKILL.md` suffix, with no custom `_meta` keys read. Scheme-based identification needed zero extra fields and made the client's filter a two-line string check, but it carries no structured metadata — tags, versioning, or provenance would each require layering `_meta` on top anyway. Since the final path segment must equal the frontmatter `name`, the skill's name is recoverable from the URI alone, which is what let discovery populate a picker without fetching every `SKILL.md` first.
- **Doc inconsistency spotted in passing:** [sep-draft-skills-extension.md](sep-draft-skills-extension.md) states the index `digest` field is omitted, while [PR #96](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/96) is titled "reinstate `digest` field in `skill://index.json`". The two disagree; this implementation follows the checked-in doc and ignores `digest`.

### Findings from running it against a live server

The implementation was then run from a source build of VS Code against the [Hugging Face MCP server](https://github.com/huggingface/hf-mcp-server) (`https://huggingface.co/mcp`, anonymous access). Everything below was surfaced by that, and **none of it was caught by type-checking or unit tests** — each defect passed a clean `tsc` and a green suite.

- **Discovery works end-to-end.** The server advertises `io.modelcontextprotocol/skills`; VS Code discovered 8 skills (`hf-cli`, `hf-mem`, `huggingface-datasets`, `trl-training`, …) and contributed all 8 to the agent skill set with no manual attachment.
- **The index wire format had already moved on from the checked-in draft.** The live server serves `{url, digest, frontmatter:{name, description}}` — no `type` discriminator, name/description nested under `frontmatter`, `digest` present. The draft in this repo specifies top-level `name`/`description`, a required `type: "skill-md"`, and an omitted `digest`. A parser written against the checked-in draft matches **zero** entries on the real server. Accepting both shapes (read `frontmatter`, fall back to top-level) costs three lines and is worth doing while the schema is in motion.
- **Re-querying discovery per context computation is an easy accidental DoS.** `findAgentSkills()` runs every time the model's context is rebuilt, and discovery is two round trips per server. The first implementation issued 20 `skill://index.json` reads and 5 `resources/list` calls for a *single* chat turn, four within 9ms. This is the same shape as the incident that led hf-mcp-server to add a client denylist ([#164](https://github.com/huggingface/hf-mcp-server/pull/164)) after a client's `resources/subscribe` retry loop reached ~100k req/min. Hosts should cache the *promise*, not just the result, so concurrent callers share one lookup — and key that cache on connection state, not just server id, or a lookup made while a server was stopped pins an empty result in place.
- **Adding a skill source touches more type surfaces than expected.** In VS Code, "where a skill came from" is encoded in four places that must agree: the `PromptsStorage` enum, a parallel `AICustomizationSource` union, an ext-host protocol DTO, and a proposed extension API type. Missing the latter two produced a runtime `throw` that broke chat entirely while type-checking still passed.
- **Cross-server name collisions are unspecified and silently destructive.** Skill names are a flat namespace across every source. SEP-2640 requires the final URI path segment to equal the frontmatter `name`, but says nothing about what a host does when two connected servers both serve, say, `deploy`. The first implementation dropped the loser with only a trace log. Local-over-MCP precedence is defensible (a server should not shadow a user's on-disk skill), but MCP-vs-MCP degenerates to arbitrary discovery order. **Worth an explicit note in the SEP**, since every host will otherwise invent its own answer.
- **Provenance reaches the UI but not the model.** The SEP asks hosts to indicate which server a skill came from. VS Code's `<skills>` context block emits only `<name>`, `<description>`, and `<file>`; `<file>` is an `mcp-resource://` URI encoding an opaque definition id, not a readable server name. Loading is never ambiguous (the URI always routes to the right server), but a model reasoning over several servers' skills has no legible signal of origin.
- **Archive-only entries shrink the discoverable set.** 17 of the server's 25 skills are distributed only as `.tar.gz` archives with no `url` to a `SKILL.md`, so a resource-reading host skips them and sees 8. Archives were removed from SEP-2640 in core-maintainer review (decision log, 2026-07-16); until servers follow, hosts that do not unpack archives see a fraction of what a server offers.

**Verification:** `tsc --noEmit` over VS Code's `src/` at 0 errors; 10 unit tests pass (including a `skill://` → `mcp-resource://` round trip through real `McpResourceURI` code, and index parsing against a verbatim excerpt of what the HF server serves); 112 existing promptSyntax tests still pass; discovery confirmed against the live server from a running build.

**Remaining concerns:**

- **Model invocation not demonstrated.** Discovery and contribution are confirmed, but no run has yet shown the model choosing to call the skill tool for an MCP-served skill. Two confounders: source builds of VS Code cannot reach the Copilot service (the OSS `product.json` ships no OAuth client configuration, so entitlement calls 404), and the model available for testing was a small auto-routed one. This is consistent with the adherence problems recorded elsewhere on this page, and is a property of model behaviour rather than of the transport binding — but it does mean the loading half is verified by mechanism, not by observation.
- Resource templates (`mcp-resource-template` index entries) are parsed but not materialized — they need the completion API to resolve.
- No `resources/subscribe` handling, so skill updates mid-session are not picked up.
- MCP skills are deliberately excluded from the AI Customization management editor, whose open/edit affordances assume a writable local file.

## McpGraph: Skills in MCP Server Repo

**Date:** Not documented

**Implementation:**

- **Repository:** [TeamSparkAI/mcpGraph](https://github.com/TeamSparkAI/mcpGraph)
- **Author:** Bob Dickinson
- **Relevant artifacts:** [mcpgraphtoolkit/SKILL.md](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) (875+ lines)

**Approach tested:** Related to [Approach 5: Server Instructions Reference](approaches.md#5-server-instructions-reference). The standalone skill lives beside the MCP server but is not formally connected to it.

**Setup:**

- **Clients tested:** Claude; specific client not documented
- **Models tested:** Not documented
- **Configuration notes:** The skill teaches agents to build directed graphs of MCP nodes and orchestrate tool calls

**What was tested:** Whether an agent discovers and follows a colocated skill before attempting to use the server tools.

**Results:**

- **What worked:** Adding a server instruction that told the agent to read the skill before using the tool caused Claude to load it reliably
- **What didn't:** Claude initially ignored the skill even when the skill and server had similar descriptions, and only read it after failing to use the server tools
- **What was surprising:** A single server instruction changed the loading order reliably

**Requirements or design questions addressed:** Reliable skill discovery and loading, and whether server instructions can connect an MCP server to colocated skill guidance.

**Evidence and reproduction:** These are community-reported observations; the client version, model version, and runnable reproduction are not documented.

**Limitations:**

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

**Date:** Not documented

**Implementation:**

- **Repositories:** [mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), and [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search)
- **Author:** [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain)
- **Relevant artifacts:** Atomic MCP server repositories with skills exposed as `skill://` resources

**Approach tested:** [Approach 3: Skills as Tools and/or Resources](approaches.md#3-skills-as-tools-andor-resources).

**Setup:**

- **Clients tested:** Not documented
- **Models tested:** Not documented
- **Configuration notes:** Previously separate MCP server code, skills, and `server.json` registry metadata were consolidated into one repository per server

**What was tested:** Whether colocating skills with their MCP servers and exposing them as resources simplifies distribution while preserving or improving agent results.

**Results:**

- **What worked:** Consolidating the artifacts simplified build, versioning, and deployment; skills ship atomically with the tools they describe
- **What worked:** `skill://` resources provided ephemeral availability without git cloning or client-side file-system access
- **What worked:** Quick tests produced the same or better results than injecting skills before the LLM call
- **What didn't:** Not documented
- **What was surprising:** Not documented

**Requirements or design questions addressed:** Installless skill availability, provenance through colocation, atomic versioning, and reuse of existing MCP resource primitives.

**Evidence and reproduction:** The linked repositories are reference implementations. The comparison with upstream skill injection was reported through community discussion; a test procedure and quantitative results are not documented.

**Limitations:** Client versions, model versions, test cases, and evaluation criteria are not documented, so the result cannot yet be reproduced precisely.

**Sources and attribution:**

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

## PHP MCP SDK + Symfony AI Mate: Skills as `skill://` resources

> Written against the pre-v1 draft (June 2026). References to `skill://index.json`, `resource_templates/list`, and `mcp-resource-template` entries describe that draft; v1 replaced the index with `skills/list`/`skills/get` and dropped template entries (decision log, 2026-07-16).

**Server / SDK:** [modelcontextprotocol/php-sdk#372](https://github.com/modelcontextprotocol/php-sdk/pull/372) — adds `io.modelcontextprotocol/skills` support to the official PHP MCP SDK
**Consumer:** [symfony/ai#2132](https://github.com/symfony/ai/pull/2132) — ships Agent Skills in the Symfony AI "Mate" MCP server
**Contributor:** Johannes Wachter ([@wachterjohannes](https://github.com/wachterjohannes))

First PHP-ecosystem implementation of SEP-2640 (prior documented implementations are
Python/TS). The SDK PR adds a one-line server affordance — `addSkillsFromDirectory()` —
that walks a directory, registers each `SKILL.md` and its supporting files as `skill://`
resources, derives `name`/`description` from YAML frontmatter, enforces the spec's
final-path-segment ↔ frontmatter-`name` rule, guards against path traversal, and serves
a `skill://index.json` discovery index. The Mate PR ships two real skills colocated with
the tools they orchestrate, including a multi-file skill with a `references/` subdirectory.

**Tested (works):**

- Serving is covered by MCP Inspector **stdio snapshot tests**: `resources/list`,
  `resources/read` of a `SKILL.md`, of a supporting file, and of `skill://index.json`,
  plus `resource_templates/list`. Unit tests cover frontmatter parsing (BOM/CRLF,
  non-mapping rejection), the name↔segment rule, and resource-name sanitization. PHPStan
  level 6 and the full suite (792 tests) green.
- The **directory model + relative supporting-file URIs** resolve correctly in a
  non-Python implementation — e.g. `skill://code-review/references/SECURITY.md` is a
  sibling resource of `skill://code-review/SKILL.md`. Positive evidence the directory
  model travels across ecosystems.

**`_meta` prefix — independent convergence (not a gap).** Our SDK independently chose
`io.modelcontextprotocol.skills/` to namespace extra frontmatter fields on the resource
descriptor — which matches the prefix SEP-2640 recommends ("When `_meta` keys are used for
skill resources, implementations SHOULD use the `io.modelcontextprotocol.skills/`
reverse-domain prefix"). Useful corroboration of the recommended prefix. Note: the
working-group repo-local draft ([`docs/sep-draft-skills-extension.md`](sep-draft-skills-extension.md))
does not yet include that sentence — its `_meta` paragraph ends at "…via the resource's
`_meta` object." — so the SEP PR and this repo's copy have drifted and could be synced.
(Discussed on [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640#issuecomment-4622668503).)

**SDK implementation notes (not spec gaps):**

- **Resource-name uniqueness, not charset.** The skill `name` charset (`[a-z0-9-]`, ≤64, no
  leading/trailing hyphen) is a strict subset of the MCP resource-name charset, so the
  SKILL.md resource `name` can carry the frontmatter `name` directly — "resource `name`
  SHOULD equal frontmatter `name`" is satisfiable. The wrinkle is uniqueness: our SDK
  registers every resource under a unique name key, including a skill's **supporting files**
  (`references/SECURITY.md`) and skills that **share a frontmatter `name` under different
  prefixes** (`acme/billing/refunds` vs `acme/support/refunds`). So we derive a unique name
  from the URI path and keep the frontmatter `name` in `title`. Identity is the URI
  regardless — an SDK registration detail, not a SEP issue.
- **Empty-payload capability serialization trap.** An extension advertising an empty `{}`
  payload (as Skills does) serialized to `[]` rather than `{}` and had to be coerced. A
  likely footgun for any SDK implementing an empty-payload extension.
- **`symfony/yaml` required** for frontmatter parsing — the feature is non-functional
  without a YAML parser; frontmatter handling is a real dependency, not free.

**Client consumption (observed from docs, not yet eval'd):**

- Per current **Claude Code** documentation (June 2026), Claude Code loads skills from the
  filesystem and plugins only; it does not discover or load MCP-served `skill://` resources
  as skills, and its MCP resource support is **user-`@`-mention attachments, not
  model-driven `resources/read`**. So end-to-end, model-driven consumption of MCP-served
  skills is not exercisable in Claude Code today — a data point for
  [#38](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/38).
- **FastMCP 3.0** (per this repo's existing findings) is the consumer best positioned to
  validate the serving half against; not yet done.

**Remaining / untested:**

- No model-adherence eval yet comparing filesystem vs. `skill://` delivery.
- `mcp-resource-template` skill type (parameterized namespaces) is deferred in the SDK PR —
  the `SkillType` enum carries the value for forward-compat, but only `skill-md` entries are
  emitted; the template path is unimplemented and untested.
- Not yet tested against any client that implements model-driven `skill://` loading.
