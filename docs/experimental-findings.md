# Experimental Findings

> ℹ️ **This document is not actively maintained.** It captures a snapshot of early findings. Current discussion and decisions are tracked in the [meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg), [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084), and on the [SEP-2640 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

> **Contributing findings?** Start with the [experimental findings template](findings-template.md).

## VS Code: MCP-served skills as agent skills (Issue #66)

> Written against the pre-v1 draft (August 2026). The index format, `type: "skill-md"`, archive entries, and resource templates discussed below belong to that draft; v1 replaced the index with `skills/list`/`skills/get`, dropped archives and template entries (decision log, 2026-07-16), and makes digest verification a host MUST.

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

## VS Code: SEP-2640 v1 detection over `skills/list` (Issue #66, follow-up)

**Date:** 2026-08-31

**Implementation:**

- **Repository:** [tobi-oye/vscode](https://github.com/tobi-oye/vscode) — a [microsoft/vscode](https://github.com/microsoft/vscode) fork (personal exploration, not submitted upstream)
- **Author:** Tobi Oyewole ([@tobi-oye](https://github.com/tobi-oye))
- **Relevant artifacts:** [tobi-oye/vscode#1](https://github.com/tobi-oye/vscode/pull/1) (detection over `skills/list`/`skills/get`), [#2](https://github.com/tobi-oye/vscode/pull/2) (conformance follow-ups, by [@olaservo](https://github.com/olaservo)), [#3](https://github.com/tobi-oye/vscode/pull/3) (manifest verification and on-demand retrieval)

**Approach tested:** [Skills as Tools and/or Resources](approaches.md#3-skills-as-tools-andor-resources), via the SEP-2640 extension surface rather than a tools bridge.

**Setup:**

- **Clients tested:** Code - OSS Dev 1.133.0, source build, `--log trace`. Negotiates protocol `2025-11-25` (`LATEST_PROTOCOL_VERSION` in `src/vs/platform/mcp/common/modelContextProtocol.ts`).
- **Models tested:** Model selection was `copilot/auto`. The session log shows `gpt-41-copilot`, `gpt-5-mini`, `gpt-4o-mini`, and `claude-haiku-4.5` among routed models; per-turn attribution is not recorded, so the model serving any individual turn below is Not documented.
- **Configuration notes:** Server is [olaservo/skills-over-mcp-demo](https://huggingface.co/spaces/olaservo/skills-over-mcp-demo) on a Hugging Face Space over Streamable HTTP, running `@olaservo/ext-skills` 0.13.0 and tracking SEP-2640 at [`753b9f2`](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640/commits/753b9f2). The deployment also enables an opt-in `roll_dice` tool that is not part of SEP-2640. Client settings: `chat.useAgentSkills: true`, `chat.experimental.useSkillAdherencePrompt: true`. macOS 25.5.0 arm64.

**What was tested:** Whether a host can detect skills through `skills/list`, present them by frontmatter alone, and retrieve and verify skill content only when the model chooses to load it. The traced query — *"what does 5d10dh1 mean?"* — was chosen because the deployment's `roll_dice` tool executes dice notation but cannot explain it, so a correct answer can only come from skill content. A second query, *"roll 2d6+3"*, was run as a control where the tool and the skill compete directly.

**Results:**

**What worked:**

- **Detection over `skills/list`, once per session.** One call returned three entries; `secret-menu`, which the server serves but does not list, was correctly absent. The model received `name` and `description` only.
- **Retrieval deferred until load.** No skill file was fetched at connect, at listing, or when skills were contributed to context. The `SKILL.md` was fetched only when the model loaded the skill, satisfying the on-demand retrieval requirement ([`72cc599`](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640/commits/72cc599)) — a host that has no prefetch path satisfies it by construction.
- **Two-hop reference resolution with no protocol support.** The `SKILL.md` body says *"see `references/dice-notation.md` for the full grammar"*; that relative path resolved against the skill's `mcp-resource://` base through VS Code's existing file service. The answer (`5d10` rolls five ten-sided dice, `dh1` drops the highest one) comes from the reference file's Keep/Drop table, not from the `SKILL.md`.
- **Verification against the listing manifest.** Both files were checked against the `{uri, digest, size}` entries carried in the `skills/list` response. A listing entry can verify content that has not been fetched yet, which is what makes detection and retrieval separable.

**What didn't:**

- **A directory URI has no read path.** After the two file reads the host issued `resources/read` for `skill://dice-roller`, the parent directory, and received `-32602 Not a skill file`. The server advertises `directoryRead: true`; this host does not implement `resources/directory/read`, so a directory request has nowhere correct to go.
- **No read cache.** `references/dice-notation.md` was fetched six times across the session, three of them inside the single turn that answered the question. The SEP pairs on-demand retrieval with a SHOULD to cache retrieved content and revalidate against the entry digest; implementing the first half without the second converts a prefetch problem into a refetch problem.
- **A listing was cached for 27 hours across four connections.** Exactly one `skills/list` was issued. Discovery reported three skills again the next day, over three later connections, without another wire call. The cause is a host cache keyed on the server's *connection state string*, where `Stopped → Running` reproduces the key the entry already had.

**What was surprising:**

- **A server-side tool out-competed the skill it is meant to pair with.** On the control query, the model called `roll_dice` and never loaded `tabletop-dice`, whose description overlaps the tool's almost verbatim. Three skills were in context 28 seconds before the tool call, and the prompt carried `BLOCKING REQUIREMENT: … load the relevant skill(s) … as your first action`. The tool exists because tool-centric hosts need a `tools/list` surface, and the server's README states it "pairs with the `tabletop-dice` skill without substituting for it" — in this host it substituted. Only a query the tool provably could not serve routed through the skill. This is a sharper mechanism than the decay described under *Skill Reliability and Adherence* below: a matching tool schema beating a document, not a model losing the plot.
- **Nothing bounds how long a host may retain a listing.** The server sends SEP-2549 `ttlMs`/`cacheScope` but scopes them to 2026-07-28+ connections; this host negotiates `2025-11-25` and therefore receives no caching guidance at all (zero occurrences in the session log). Retaining a listing indefinitely violates nothing as specified.

**Requirements or design questions addressed:**

- Confirms that the `skills/list` → frontmatter-in-context → `resources/read`-on-load loop of [Approach 3](approaches.md#3-skills-as-tools-andor-resources) is implementable in a mainstream host without a tools bridge.
- **Worth an explicit note in the SEP:** listing staleness across reconnects. Verification binds fetched bytes to digests from a cached manifest, so a server that redeploys between sessions has fresh content checked against a stale manifest, and at that point a legitimate update is indistinguishable from tampering. Re-listing on reconnect is what a server would expect; nothing currently asks for it, and on pre-2026-07-28 connections there is not even a TTL to honour.
- Adds a data point to [#37](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/37) (file-based vs MCP-based skill delivery): when a server ships both a skill and a tool covering the same task, the tool wins by default.

**Evidence and reproduction:**

Detection, from the MCP server output channel:

```
06:48:27  [editor -> server] {"method":"skills/list"}
06:48:28  [mcp-skills] "ola-skills" served 3 skill(s): tabletop-dice, mcp-glossary, release-notes-writer
```

Retrieval for *"what does 5d10dh1 mean?"*:

```
10:03:34  resources/read skill://dice-roller/tabletop-dice/SKILL.md
10:03:38  resources/read skill://dice-roller/tabletop-dice/references/dice-notation.md
10:04:29  resources/read skill://dice-roller            -> -32602 Not a skill file
```

Method totals for the session: `skills/list` ×1, `skills/get` ×0, `resources/read` ×12, `tools/list` ×4, `tools/call` ×1, `initialize` ×4.

The server side can be checked independently with the demo's own conformance suite, which passes against the live deployment:

```
npx tsx src/smoke-http.ts https://olaservo-skills-over-mcp-demo.hf.space/mcp
```

**Limitations:**

- **`skills/get` was never exercised.** It is reachable only for a skill absent from the listing, and this host has no path that produces such a URI — the server's `instructions` field points at `skill://secret-menu/SKILL.md`, but nothing mines instructions for skill URIs. A host implementing only `skills/list` never calls `skills/get`, and so never learns whether it works.
- **`"resources": "dynamic"` and nested skills are untested.** Every skill this server offers is static and top-level, so the dynamic marker never appears and the rule that an enclosing skill's manifest includes its nested skills' files is never exercised. Both are host obligations that this deployment cannot validate.
- **Per-turn model attribution is not recorded**, so the adherence observation above is a single-session result under `copilot/auto`, not a model comparison.
- Host defects listed under *What didn't* are specific to this fork at the commits linked above, not to the SEP or to the server.
- Separately observed and not skills-specific: `resultType` is absent from every result this server returns — `skills/list`, `skills/get`, `tools/list`, `tools/call`, `resources/read` — while negotiating `2026-07-28`, where the base schema states servers "MUST include this field". It applies to any server on the v2 TypeScript SDK, and the same schema tells clients to treat an absent value as `"complete"`, so nothing breaks today.

**Sources and attribution:** Server and conformance suite by [Ola Hungerford](https://github.com/olaservo). Host implementation and this write-up by [Tobi Oyewole](https://github.com/tobi-oye). Conformance follow-ups in [tobi-oye/vscode#2](https://github.com/tobi-oye/vscode/pull/2) by [@olaservo](https://github.com/olaservo).

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
