# Experimental Findings

> ℹ️ **This document is not actively maintained.** It captures a snapshot of early findings. Current discussion and decisions are tracked in the [meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg), [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084), and on the [SEP-2640 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

> **Contributing findings?** Start with the [experimental findings template](findings-template.md).

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
