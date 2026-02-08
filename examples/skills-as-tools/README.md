# Skills as Tools — Reference Implementation

> **Experimental** — This is a minimal reference implementation for evaluation by the Skills Over MCP Interest Group. Not intended for production use.

## Pattern Overview

This example demonstrates **Approach 3** from [`docs/approaches.md`](../../docs/approaches.md): exposing agent skills via MCP tools.

An MCP server scans a directory for SKILL.md files and exposes two tools:

| Tool | Purpose |
| :--- | :--- |
| `list_skills` | Returns skill names and descriptions (progressive disclosure — summaries only, not full content) |
| `read_skill` | Accepts a skill `name` and returns the full SKILL.md content on demand |

This is a **model-controlled** approach: the LLM decides when to invoke skills based on tool descriptions. See [Open Question #9](../../docs/open-questions.md) for the control model discussion.

## How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  MCP Client  │────▶│  Skills as Tools  │────▶│  Skill Files  │
│  (e.g. Claude│◀────│   MCP Server      │◀────│  (SKILL.md)   │
│   Code)      │     └──────────────────┘     └──────────────┘
└─────────────┘
```

1. **Startup**: Server scans the configured skills directory for `*/SKILL.md` files
2. **Discovery**: Parses YAML frontmatter to extract `name` and `description`
3. **Registration**: Registers `list_skills` and `read_skill` as MCP tools; tool descriptions include available skill names
4. **Progressive disclosure**: Agent calls `list_skills` to see what's available, then `read_skill(name)` to load full instructions only when needed
5. **Capability declaration**: Server declares `tools.listChanged` capability (dynamic updates could be wired to a file watcher in a full implementation)

## Implementations

Both implementations expose the same tools with the same behavior. They share the `sample-skills/` directory as test data.

### TypeScript

**Prerequisites**: Node.js >= 18, npm

```bash
cd typescript
npm install
npm run build
```

**Run with MCP Inspector**:
```bash
npx @modelcontextprotocol/inspector node dist/index.js ../sample-skills
```

**Development mode** (no build step):
```bash
npm run dev -- ../sample-skills
```

### Python

**Prerequisites**: Python >= 3.10, pip (or uv)

```bash
cd python
pip install -e .
```

**Run with MCP Inspector**:
```bash
npx @modelcontextprotocol/inspector -- python -m skills_as_tools.server ../sample-skills
```

## Security Features

Both implementations include:

- **Path traversal protection** — Resolved paths are checked against the skills directory boundary using `realpathSync` (TS) / `Path.resolve()` (Python). Symlink escapes are detected.
- **Skill name validation** — `read_skill` looks up names by key in the discovered skills map. User input is never used to construct file paths.
- **File size limits** — Files larger than 1MB are skipped during discovery and rejected on read.
- **Allowlisted file types** — Only `.md` files are readable.
- **Safe YAML parsing** — Python uses `yaml.safe_load()` to prevent code execution. TypeScript uses the `yaml` package which is safe by default.

## Sample Skills

Two sample skills are included in `sample-skills/` for testing:

| Skill | Description | Notes |
| :--- | :--- | :--- |
| `git-commit-review` | Review commits for quality and conventional format | Standalone skill (no extra files) |
| `code-review` | Structured code review methodology | Includes `references/REFERENCE.md` (progressive disclosure) |

## Key Design Decisions

- **Tools over resources**: Tools are model-controlled — the LLM decides when to invoke them based on descriptions. Resources are application-controlled, which experimental findings show leads to lower utilization (see [`docs/experimental-findings.md`](../../docs/experimental-findings.md)).
- **Two tools, not one**: Separating `list_skills` from `read_skill` enables progressive disclosure — the model sees summaries first and only loads full content when needed, saving context tokens.
- **Skill manifest in tool description**: The `list_skills` tool description includes available skill names, so the model knows what's available without making a tool call (following the skilljack pattern).

## What This Example Intentionally Omits

- `skill://` URI resources (see: future skills-as-resources example)
- File watching / live dynamic updates (capability is declared but not wired)
- MCP Prompts for explicit skill invocation
- GitHub sync, configuration UI
- `skill-resource` tool for reading files within skill directories

## Relationship to Other Approaches

| Approach | How it differs |
| :--- | :--- |
| **1. Skills as Primitives** (SEP-2076) | Uses dedicated `skills/list` and `skills/get` protocol methods instead of tools |
| **3. Skills as Tools** (this example) | Uses existing MCP tools primitive — no protocol changes needed |
| **5. Server Instructions** | Uses server instructions to point to resources instead of tools |
| **6. Convention** | This example could become part of a documented convention pattern |

## Inspirations and Attribution

This reference implementation is original code inspired by patterns from:

- **[skilljack-mcp](https://github.com/olaservo/skilljack-mcp)** by [Ola Hungerford](https://github.com/olaservo) — Tool description embedding, progressive disclosure, path security, dynamic updates
- **[skills-over-mcp](https://github.com/keithagroves/skills-over-mcp)** by [Keith Groves](https://github.com/keithagroves) — Resource-based skill exposure, skill URI schemes
