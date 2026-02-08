# Approaches Being Explored

> These are not mutually exclusive solutions.

## Design Principles

Several design considerations are emerging from community discussion:

- **MCP is fundamentally about context, not just tools.** Skills are part of a broader challenge around context-as-resources discoverability and standardization of client host behavior. Framing skills as context-as-resources avoids creating artificial hierarchies between skills and other MCP primitives.
- **Don't be too prescriptive about client host behavior.** Client hosts may want to innovate on how skills are utilized (e.g., progressive disclosure) and what they can even *be*. The goal is uniform discovery and consumption patterns from the server author's perspective, while leaving room for client-side innovation.
- **Don't assume how tool paradigms will evolve.** The conceptual surface of skills shouldn't bake in assumptions about how tools develop. That doesn't preclude skills being implemented as a well-known tool, but the design should not couple skills to any particular tool evolution path.
- **Let the primitive choice follow from the use case.** The answer may not be "resources" or "new primitive" — it may be both, depending on the interaction pattern. Some skills are context for the model. Some are context for the human. Some are both. The delivery mechanism should support that range. ([See related thread on SEP 2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#discussion_r2736299627))
- **Minimize ecosystem complexity.** The broader AI tooling ecosystem is experiencing complexity fatigue — too many overlapping concepts (servers, skills, plugins, hooks, agents) erode credibility and adoption. Whatever approach the IG recommends should reuse existing MCP primitives where possible and only introduce new surface area when there's a clear case that existing primitives can't serve the need. ([See related issue](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/14))

## Central Tension: Convention vs. Protocol Extension

The approaches below span a spectrum. At one end, skills become a first-class MCP primitive with dedicated protocol methods (Approach 1). At the other, existing primitives are used with documented conventions (Approach 6). A key question for this IG is whether convention can prove patterns before standardization — or whether the ecosystem needs protocol-level support to achieve reliable interoperability. These are not mutually exclusive; convention work can inform and de-risk a future protocol extension.

## 1. Skills as Distinct MCP Primitives

Add Agent Skills as a first-class, discoverable primitive in MCP. A skill is a named bundle of instructions plus references to tools, prompts, and resources that together teach an agent how to perform a domain-specific workflow.

**Proposal:** [SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076)

**Author:** [Yu Yi](https://github.com/erain)

**Key elements:**

- New protocol methods: `skills/list` and `skills/get`
- A `skills` server capability
- A `notifications/skills/list_changed` notification
- Progressive disclosure: clients load skill summaries at startup, fetch full instructions on demand
- Mapping to existing SKILL.md format

**Status:** Draft, seeking sponsor.

**Community input:**

> "My main motivation is: we have so many MCP servers already available, how can we leverage them to distribute Skills?" — [Yu Yi](https://github.com/erain)

## 2. Skills as Registry Metadata

Add skill references to MCP registry entries so users know to install associated skills alongside servers.

**Implementations:** 
- [Ozz](https://github.com/JAORMX) started a discussion around [skills.json format proposal](https://github.com/modelcontextprotocol/registry/discussions/895)
- NimbleBrain has implemented this via a `skill` field in registry `_meta`, supporting `.skill` artifact bundles (ZIP containing SKILL.md + manifest.json).
    - https://github.com/NimbleBrainInc/skills
    - [registry.nimbletools.ai](https://registry.nimbletools.ai/)

**Community input:**

> "We view skills as an opportunity to use them as both a standalone (general-purpose capabilities) & MCP-paired (tool-specific guidance). For the main registry, the binding could be softer: optional fields like suggestedSkills or recommendedSkills rather than definitive pairing, since skill authorship is often decoupled from server authorship." — [Mat Goldsborough](https://github.com/mgoldsborough)

## 3. Skills as Tools and/or Resources

Examples:

- Expose skills via tools like `list_skills` and `read_skills`. Server instructions can direct the agent to call the skill tool first.
- Expose skills as resources (e.g. skill://...), which can also be exposed through tools


**Implementations:** 

- [skilljack-mcp](https://github.com/olaservo/skilljack-mcp)
- [skills-over-mcp](https://github.com/keithagroves/skills-over-mcp)
- [my-cool-proxy](https://github.com/karashiiro/my-cool-proxy)

**Community input:**

> "I wonder if a better way to approach this with existing primitives is by implementing a Skill() tool and establishing this as a standard recommendation for servers and clients, rather than adding a new primitive to MCP." — [Ola Hungerford](https://github.com/olaservo)

> "There should be intentional focus on making it easy for server authors to create and expose skills... client hosts are strongly incentivized to have a relatively uniform way to discover and consume them — at least from the point of view of a server author — while also leaving room for client host innovation.
>
> I also don't like creating dichotomy between first-class skills and skills as context, because pretty much everything an MCP server exposes is context. Skills-as-resources is much more accurate." — [Peder Holdgaard Pedersen](https://github.com/PederHP)

> "The only slight concern I have is the idea that there are still 'first class skills' (skills that agents recognize as skills, can be presented as skills through the user agent, can be bundled with subagents, etc) and these sort of 'skills as context' approaches where the agent can certainly discover and ingest the skills data, but possibly with some differences compared to how they would apply first class skills." — [Bob Dickinson](https://github.com/TeamSparkAI)

This approach may also:

- Use resource templates for parameterized skill discovery
- Use Prompts for explicit skill invocation
- Use `tools/listChanged` and other notifications for dynamic updates without server re-initialization

### Variant: Skills via Sampling

Instead of exposing skill tools to the main agent, use MCP's Sampling with Tools capability ([SEP-1577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1577)). The server requests a sampling call with skill-specific tools (`read_skill_md`, `execute_script`, etc.) that are only visible during that sampling request. This keeps skill tools hidden from the main agent, addressing tool bloat. The server orchestrates skill execution; the main agent just sees the result.

**Caveat:** Sampling has limited client support currently.

**Source:** [jbnitorum](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#issuecomment-3806151745)

## 4. Gateway/Composition Pattern

A gateway-style server that provides a group of MCPs as one, ensuring they get requisite configuration and instructions to work in harmony.

This pattern could enable loading primitives (tools) without the full "server" boundary.

**Community input:**

> "MCP repos can also be used as libraries... a gateway in same language as bundle servers could also load primitives like tools, and not necessarily need or want the 'server' parts." [SamMorrowDrums](https://github.com/SamMorrowDrums)

## 5. Server Instructions Reference

Use server instructions as a pointer to a resource: "If you need to do X, fetch resource Y for further instructions." This defers loading skill content until needed, managing context more efficiently.

**Limitation:** May not work with off-the-shelf servers where you can't modify their instructions.

## 6. Official Convention as Intermediate Step

A documented "MCP Skills Convention" as a middle path between ad-hoc experiments and protocol extension. This could:

- Define well-known URI schemes or naming patterns (e.g., resources matching `**/SKILL.md`)
- Recommend metadata structure (version, tags, dependencies) aligned with agentskills.io
- Provide guidance on control model: resources for application-controlled, `skill()` tool for model-controlled
- Be documented in MCP docs as a "Pattern" — not in protocol schema, but officially recommended
- Allow data gathering on adoption before considering protocol-level changes

This mirrors how other ecosystems (e.g., Kubernetes) graduate patterns: start as convention, prove value, then formalize. Could be a concrete IG deliverable: "MCP Skills Convention v0.1."

**Advantages of the convention approach:**

- Since MCP supports dynamically updating tools, the latest skills manifest can be included in tool descriptions
- Skills can also be modeled as Resources (using `skill://` URI) for application-controlled access
- Prompts could support explicit skill invocation
- The convention and protocol extension approaches are not mutually exclusive — convention can prove patterns before standardization
