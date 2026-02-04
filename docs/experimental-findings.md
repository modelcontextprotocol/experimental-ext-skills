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

**Related:** [jlowin/fastmcp#2694](https://github.com/jlowin/fastmcp/issues/2694)

## PydanticAI Skills Support

**PR:** [pydantic/pydantic-ai#3780](https://github.com/pydantic/pydantic-ai/pull/3780)

Introduces support for agent skills with a tools-based approach.
