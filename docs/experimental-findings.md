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

## PHP MCP SDK + Symfony AI Mate: Skills as `skill://` resources

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
