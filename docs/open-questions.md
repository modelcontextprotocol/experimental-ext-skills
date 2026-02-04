# Open Questions

## 1. Is this a registry problem or an MCP server problem?

Should skills be discoverable through registry metadata ("if you install this server, also install this skill") or contained within the MCP server itself?

## 2. How do "first-class" skills differ from "skills as context"?

Native agent skills can be presented through the user agent, bundled with subagents, etc. Do MCP-surfaced skills lose capabilities compared to directly installed skills?

**Community input:**

> "The only slight concern I have is the idea that there are still 'first class skills' (skills that agents recognize as skills, can be presented as skills through the user agent, can be bundled with subagents, etc) and these sort of 'skills as context' approaches where the agent can certainly discover and ingest the skills data, but possibly with some differences compared to how they would apply first class skills." — [Bob Dickinson](https://github.com/TeamSparkAI)

> "I don't like creating dichotomy between first-class skills and skills as context, because pretty much everything an MCP server exposes is context. Skills-as-resources is much more accurate." — [Peder Holdgaard Pedersen](https://github.com/PederHP)

## 3. Should server.instructions be extended for richer content?

Or is the separation between "primitive server" and "skill that uses the primitive" the right abstraction?

**Community input:**

> "I would caution against seeing skills as too tightly coupled with tools. Not all skills need to be related to the tools on a server — or even client-side tool use at all. This is especially true for agents that use very broad tools or heavily reliant on code interpreter and similar meta-tools." — [Peder Holdgaard Pedersen](https://github.com/PederHP)

## 4. How should skills relate to multiple servers?

A skill orchestrating tools from several servers can't live in any single server's instructions.

## 5. Do clients actually leverage skills when presented via MCP?

Early experiments suggest they do, but more rigorous testing is needed.

**Community input:**

> "Clients have been slow to implement support for resources. Had some parallel primitive 'skills' been implemented, I'm not sure clients would have implemented them any faster. Basically they all went for 'tools' and have slowly been getting around to implementing other primitives." — [Cliff Hall](https://github.com/cliffhall)

## 6. How do we coordinate with agent skills spec owners?

The contribution model for the skills spec isn't clear, and MCP-related efforts should be brought to their attention.

- [Ola Hungerford](https://github.com/olaservo)

## 7. What would MCP have had to get right for skills to have been shipped over MCP from the beginning?

— [Keith Groves](https://github.com/keithagroves)

## 8. What could MCP reasonably change so that it will be the obvious choice for new formats?

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

## 11. Should the control model be use-case specific?

Perhaps resources (application-controlled) for some use cases, tools (model-controlled) for others? Can a convention support both?

Note: Some apps like Claude Code have started to indicate in the skill frontmatter whether a particular skill should be model-controlled-only, human-controlled-only, or either — and has also started to blur the lines between slash commands and skills.

## 12. Why not just resources?

**Core Maintainer input:**

> "Why not just resources? That feels like the obvious implementation since skills are just files and resources already exist to expose files. i.e. just expose skills as resources the same as they're currently exposed on the filesystem and then just use the existing Agent Skills specification — client can find skills using resources/list to find SKILL.md files." — [Peter Alexander](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#discussion_r2736299627)

**Community input:**

> "I'd like Skills to be 'more official' than generic resources — which could be ANYTHING. More specifically, skill as a separate spec may advance in the near future, e.g. versioning etc., so having MCP as an official distribution mechanism and support it in the current and future form is important." — [Yu Yi](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076#discussion_r2747846895)

> "If the conclusion is 'just use resources', I am fine with that direction too — but then we should standardize a way to identify and list workflow resources as 'skills' so clients can reliably surface them (otherwise we are back to out-of-band conventions)." — [sebthom](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2167#issuecomment-3824771018)

## 13. What is the optimal relationship between skills and MCP?

Skills already work as simple files that agents load directly. Adding MCP to the process should provide clear value beyond what standalone skills already offer.

**Community input:**

> "Skills are simple files that agents can load directly even if they don't have any MCP servers connected. Adding MCP to the process only for that would be over complicating something that already works well... the question becomes 'what is the optimal relationship between skills and MCP?'" — [Cliff Hall](https://github.com/cliffhall)
