---
name: explore-everything
description: Explore and document the capabilities of all connected MCP servers. Use when asked to understand what tools, resources, and prompts are available across servers.
dependencies: [filesystem, github]
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Explore Everything

Explore and document the capabilities of all connected MCP servers.

## When to Use

- User asks "what can you do?" or "what tools are available?"
- You need to understand the full set of capabilities before starting a task
- User wants an inventory of connected servers and their features

## Process

1. **List all connected servers** — identify each server by name
2. **For each server**, discover:
   - **Tools** — list all tools with their descriptions and input schemas
   - **Resources** — list all resources and resource templates
   - **Prompts** — list any prompt templates
3. **Categorize capabilities** — group tools by domain (filesystem, git, API, etc.)
4. **Identify overlaps** — note where multiple servers provide similar functionality
5. **Summarize** — present a structured overview

## Dependencies

This skill requires the following MCP servers to be connected:
- `filesystem` — for reading/writing files to save the exploration results
- `github` — for exploring repository-related capabilities

## Output Format

```markdown
## Connected Servers

### server-name
**Tools (N):**
- tool_name — description

**Resources (N):**
- resource://uri — description

**Prompts (N):**
- prompt_name — description
```
