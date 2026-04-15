# Open Questions

## 1. Is this a registry problem or an MCP server problem?

> **See also:** [#44](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/44) — Define well-known URI schemes and naming patterns for skill resources

Should skills be discoverable through registry metadata ("if you install this server, also install this skill") or contained within the MCP server itself?

A third option is emerging: domain-level discovery via `/.well-known/skills/` (see [Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)). This decouples skill discovery from both registries and MCP servers — an organization publishes skills at a predictable URL on its own domain. This could complement MCP-level discovery rather than replace it: `.well-known` handles "find available skills," MCP handles "load and use them at runtime."

## 2. How do "first-class" skills differ from "skills as context"?

'Native' agent skills can be presented through the user agent, bundled with subagents, etc. Do MCP-surfaced skills lose capabilities compared to directly installed skills? This question also ties into a more general topic about context-as-resources discoverability and standardization of client host behavior — it's not just a skills-specific framing question.

For more community input on this topic see: (approaches.md#design-principles)

## 3. Should server.instructions be extended for richer content?

Or is the separation between "primitive server" and "skill that uses the primitive" the right abstraction?

## 4. How should skills relate to multiple servers?

> **Tracked in:** [#39](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/39) — Research skill dependency declaration and host-mediated resolution

A skill orchestrating tools from several servers can't live in any single server's instructions.

**Related:** [agentskills/agentskills#110](https://github.com/agentskills/agentskills/issues/110) — Discusses how skills should declare their tool/server dependencies. The lack of explicit dependency configuration makes multi-server skill execution unpredictable: if required servers and tools aren't already loaded, the skill can't reliably execute.

**Emerging proposal — host-mediated dependency resolution:** Skills would declare MCP servers and/or tools as dependencies in their frontmatter. The host mediates availability: if required dependencies are not present, the skill frontmatter should not be loaded into model context (it is effectively not an available skill). This model also enables local caching of skills — they can be downloaded once and used offline as long as their dependencies are available.

The agentskills.io spec currently has a freeform [compatibility field](https://agentskills.io/specification#compatibility-field) but no formal dependency mechanism. Some existing tools (e.g., skills.sh) handle dependencies implicitly by instructing agents to install via bash/npm/uv. Skills may also be composable (skill-to-skill dependencies) — see [Use Case 3](use-cases.md#3-multi-server-composition).

**Community input:**

> "If [required tools/servers are] not available then the skill frontmatter shouldn't be loaded into model context, as it is effectively not an available skill. This also means that you can cache skills locally." — [Peder Holdgaard Pedersen](https://github.com/PederHP) (Saxo Bank), via Discord

> "If there is some standard that we can introduce to specify skill dependencies… and all platforms can read that and load the skill or not based on that would be amazing." — Sunish Sheth (Databricks), via Discord

> "npx skills is ok for simple use-cases but doesn't work for dependencies across Skill — i.e. if Skill 1 uses Skill 2 — which is one of the benefits of Skills — that they are composable." — [Kaxil Naik](https://github.com/kaxil) (Astronomer), via Discord

## 5. Do clients actually leverage skills when presented via MCP?

> **Tracked in:** [#38](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/38) — Survey client resource-loading support across major MCP clients
> **See also:** [#37](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/37) — Compare skill delivery mechanisms: file-based vs MCP-based

Early experiments suggest they do, but more rigorous testing is needed.

**Community input:**

> "Clients have been slow to implement support for resources. Had some parallel primitive 'skills' been implemented, I'm not sure clients would have implemented them any faster. Basically they all went for 'tools' and have slowly been getting around to implementing other primitives." — [Cliff Hall](https://github.com/cliffhall)

## ~~6. How do we coordinate with agent skills spec owners?~~

[Answered in this PR](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/28)

## 7. What would MCP have had to get right for skills to have been shipped over MCP from the beginning?

> **See also:** [#47](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/47) — Create evaluation matrix mapping approaches to requirements

— [Keith Groves](https://github.com/keithagroves)

## 8. What could MCP reasonably change so that it will be the obvious choice for new formats?

> **See also:** [#54](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/54) — The case for custom metadata instead of a URI convention

— [Keith Groves](https://github.com/keithagroves)

**Community input:**

> "It's worth noting that skills aren't the only standard, there's also Kiro Powers and inevitably others will emerge that may or may not get traction. Will clients have to keep making custom integrations for new formats?" — [Keith Groves](https://github.com/keithagroves)

## 9. Who gets visibility into skill content, and who decides when it gets loaded?

The control model question — model-controlled vs. application-controlled.

— [Ola Hungerford](https://github.com/olaservo)

**Community input:**

> "One big advantage of skills over resources is that they are intended to be model-controlled by default. The people I've talked to about using MCP Resources in their servers have seen the 'application controlled' part as reducing their practical use... the bigger question for 'skills over MCP' is about the control model: who gets visibility into this content, and who decides when it gets loaded?" — [Ola Hungerford](https://github.com/olaservo)

## 10. How should skills handle security and trust boundaries?

If skills can be abused for prompt injection, what mitigations should be spec'd? (provenance, gating, explicit policy)

— [Prince Roshan](https://github.com/Agent-Hellboy)

**Community input:**

> "If a user registers an MCP server, they are already extending their trust boundary. A malicious server can do far worse via tools than via a 'skill' document." — [sebthom](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2167#issuecomment-3824771018)

Proposed mitigations: skills are untrusted docs not directives; clients MUST NOT auto-apply without explicit policy; skills should be presented with provenance and be optionally gated.

The distribution channel itself also has trust implications. Current skill distribution via git repos can be problematic from a security and trust perspective, particularly for enterprises. MCP's authenticated server model provides a more controlled distribution channel, but the trust model should align with existing MCP trust boundaries — not position MCP as a marketplace for arbitrary third-party content.

> "Current distribution of skills is a nightmare in terms of security and trust — both from an end-user and enterprise point-of-view. A git repo is a problematic distribution channel." — [Peder Holdgaard Pedersen](https://github.com/PederHP) (Saxo Bank), via Discord

> "The trust model is same as MCP, based on server trust, so broadly I think we want to discourage using MCP as a mechanism for providing a skills marketplace for arbitrary 3rd party content." — [Sam Morrow](https://github.com/SamMorrowDrums) (GitHub), via Discord

## 11. Should the control model be use-case specific?

Perhaps resources (application-controlled) for some use cases, tools (model-controlled) for others? Can a convention support both?

Note: Some apps like Claude Code have started to indicate in the skill frontmatter whether a particular skill should be model-controlled-only, human-controlled-only, or either — and has also started to blur the lines between slash commands and skills.

## 12. Why not just resources?

> **See also:** [#54](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/54) — The case for custom metadata instead of a URI convention, [#55](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/55) — Define recommended _meta keys for skill resources

**Core Maintainer input:**

> "Why not just resources? That feels like the obvious implementation since skills are just files and resources already exist to expose files. i.e. just expose skills as resources the same as they're currently exposed on the filesystem and then just use the existing Agent Skills specification — client can find skills using resources/list to find SKILL.md files." — [Peter Alexander](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#discussion_r2736299627)

**Community input:**

> "I'd like Skills to be 'more official' than generic resources — which could be ANYTHING. More specifically, skill as a separate spec may advance in the near future, e.g. versioning etc., so having MCP as an official distribution mechanism and support it in the current and future form is important." — [Yu Yi](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#discussion_r2747846895)

> "If the conclusion is 'just use resources', I am fine with that direction too — but then we should standardize a way to identify and list workflow resources as 'skills' so clients can reliably surface them (otherwise we are back to out-of-band conventions)." — [sebthom](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2167#issuecomment-3824771018)

See also [Approaches](approaches.md) for more notes on using resources.

## 13. What is the optimal relationship between skills and MCP?

> **Tracked in:** [#75](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/75) — Skills Extension SEP
> **See also:** [#47](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/47) — Create evaluation matrix mapping approaches to requirements

Skills already work as simple files that agents load directly. Adding MCP to the process should provide clear value beyond what standalone skills already offer.

**Community input:**

> "Skills are simple files that agents can load directly even if they don't have any MCP servers connected. Adding MCP to the process only for that would be over complicating something that already works well... the question becomes 'what is the optimal relationship between skills and MCP?'" — [Cliff Hall](https://github.com/cliffhall)

>  "Skills can be benefit from MCP Servers as an "official" distribution channel from an organizations. Also, Skills _can be_ dependendent on the specific tools _only_ available on the MCP server they are distributed with. I see Skills and MCP are complementary to each other." — [Yu Yi](https://github.com/erain)

> "MCP servers are most useful as an appendage of skills, like `scripts/` are. That also naturally answers the question of multi-server skills." — [Jonathan Hefner](https://github.com/jonathanhefner)
