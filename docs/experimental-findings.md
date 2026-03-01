# Experimental Findings

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

## worfcat's Three-Way Comparison

Tested skills exposed in three ways across multiple clients:

### 1. Skills as MCP Resources (with a simple `validate_skill` tool)

**Result: Bad.** The model never used them or looked at them unless explicitly asked.

### 2. Skills as Tools in an MCP Server (`list_skills` and `read_skills`)

**Result: Mixed.** Needed some tool description tuning to get used. More brittle than native. Worked with Claude Code, OpenAI agent builder, and a few other clients.

### 3. Native Skills (installing in `skills/` folder of Claude Code)

**Result: Best.** Easiest, worked out of the box.

**Key insight:**

> "There is a many-many relationship between skills and tools. A skill should not require pieces of instruction like 'here's how you use this single tool'. If an instruction of how to use an MCP server is copied across skills, it should live at the server level. Context decomposition basically."

**Note:** Claude Code's skill implementation is just a tool call — `Skill(<n>)` returns the SKILL.md file. Nothing fancy (at least for now).

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

> "Holy moly — I've spent months avoiding resources and trying to figure out good use cases for them. After this thread, I feel like it clicked. Dropping skills over a resource with some instructions dramatically simplifies all of this." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain), via Discord

> "Skills living as skill:// resources on the server itself was the natural endpoint of that consolidation. The skill context is colocated with the tools it describes, versioned together, shipped together." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain), via Discord

## Skill Reliability and Adherence

Multiple community members have independently reported that models do not reliably load or follow skill instructions, even when skills are preloaded in context. This is a cross-cutting behavioral problem, not specific to any single implementation approach.

**Findings:**

- Models frequently ignore available skills, requiring hooks or repeated prompting to trigger skill loading
- Skill adherence appears to be "time-decaying" — models follow instructions initially but lose adherence as the context window grows and compaction occurs
- Behavior is model-specific: weaker models show lower success rates with lazy-loaded skills
- Best workaround observed: wrapping skills in a subagent whose name or description mentions the skill topic
- Community desire for "skill autoloads" and "dynamic memory autoloads" as design patterns

**Community input:**

> "Even Opus 4.6 needs to be constantly bugged to load skills when they're preloaded in the context already. I actually have a hook that reminds it to load skills and it still just doesn't a lot of the time." — Luca (AWS), via Discord

> "I also have this problem with skills: they're useful… when used. Which isn't nearly often enough." — Jeremiah (FastMCP), via Discord

> "Skills are ephemeral and/or time decaying — it clicks once and then give it some time and they lose the plot." — Kryspin (qcompute), via Discord

> "I've seen lazy load skills with various degrees of success, actually looks like it might be model specific… [best pattern is] putting them in with a subagent that similarly named or mentions the topic in their description." — Kryspin (qcompute), via Discord

**Related:** See [Open Question 15](open-questions.md#15-how-can-clients-ensure-models-reliably-load-and-adhere-to-skills) for discussion on potential solutions.
