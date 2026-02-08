# Skills as Resources — Reference Implementation

> **Experimental** — This is a minimal reference implementation for evaluation by the Skills Over MCP Interest Group. Not intended for production use.

## Pattern Overview

This example demonstrates the **Resources approach** from [`docs/approaches.md`](../../docs/approaches.md): exposing agent skills via MCP resources using the `skill://` URI scheme.

An MCP server scans a directory for SKILL.md files and exposes them as resources:

| Resource | URI | MIME Type | Purpose |
| :--- | :--- | :--- | :--- |
| Index | `skill://index` | `application/json` | JSON array of all skill summaries |
| Prompt XML | `skill://prompt-xml` | `application/xml` | XML for system prompt injection |
| Skill content | `skill://{name}` | `text/markdown` | Full SKILL.md content for a specific skill |
| Document list | `skill://{name}/documents` | `application/json` | List of supplementary files (if any) |
| Document | `skill://{name}/document/{path}` | varies | Individual supplementary document |

This is an **application-controlled** approach: the host/client decides when to read resources. See [Open Question #9](../../docs/open-questions.md) for the control model discussion.

## How It Works

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  MCP Client  │────▶│  Skills as Resources  │────▶│  Skill Files  │
│  (e.g. Claude│◀────│     MCP Server        │◀────│  (SKILL.md)   │
│   Code)      │     └──────────────────────┘     └──────────────┘
└─────────────┘
```

1. **Startup**: Server scans the configured skills directory for `*/SKILL.md` files and supplementary documents
2. **Discovery**: Parses YAML frontmatter to extract `name` and `description`
3. **Registration**: Registers static resources for each skill, plus a `ResourceTemplate` for supplementary documents; resource descriptions include available skill names
4. **Progressive disclosure**:
   - `skill://index` → Summaries only (names, descriptions, URIs)
   - `skill://{name}` → Full SKILL.md content on demand
   - `skill://{name}/documents` → List of supplementary files
   - `skill://{name}/document/{path}` → Individual supplementary file
5. **System prompt injection**: `skill://prompt-xml` provides XML that hosts can inject into system prompts
6. **Capability declaration**: Server declares `resources.listChanged` capability (dynamic updates could be wired to a file watcher in a full implementation)

## Implementations

Both implementations expose the same resources with the same behavior. They share the `sample-skills/` directory as test data.

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
npx @modelcontextprotocol/inspector -- python -m skills_as_resources.server ../sample-skills
```

### SDK Difference: Document Path Encoding

The TypeScript MCP SDK supports RFC 6570 reserved expansion (`{+path}`), so document URIs use natural paths:

```
skill://code-review/document/references/REFERENCE.md
```

The Python MCP SDK uses `[^/]+` regex for all template parameters, so forward slashes in paths must be URL-encoded:

```
skill://code-review/document/references%2FREFERENCE.md
```

The SDK automatically URL-decodes the path after matching, so the handler receives the natural path in both cases. This difference is transparent to the resource handler logic.

## Security Features

Both implementations include:

- **Path traversal protection** — Resolved paths are checked against the skills directory boundary using `realpathSync` (TS) / `Path.resolve()` (Python). Symlink escapes are detected.
- **Skill name validation** — Resources look up names by key in the discovered skills map. User input is never used to construct file paths.
- **Document path validation** — Paths containing `..` are rejected. All document paths are verified to be within the skills directory.
- **File size limits** — Files larger than 1MB are skipped during discovery and rejected on read.
- **Safe YAML parsing** — Python uses `yaml.safe_load()` to prevent code execution. TypeScript uses the `yaml` package which is safe by default.

## Sample Skills

Two sample skills are included in `sample-skills/` for testing:

| Skill | Description | Documents | Notes |
| :--- | :--- | :--- | :--- |
| `code-review` | Structured code review methodology | `references/REFERENCE.md` | Tests document scanning and `ResourceTemplate` |
| `git-commit-review` | Review commits for quality and conventional format | None | Tests basic skill resource with no documents |

## Key Design Decisions

- **Resources, not tools**: Resources are application-controlled — the host/client decides when to read them. This demonstrates a fundamentally different control model than the tools approach, where the LLM decides when to invoke. See [`docs/experimental-findings.md`](../../docs/experimental-findings.md) for observations on how control model affects utilization.
- **Static resources for skills, template for documents**: Each discovered skill becomes a concrete resource visible in `resources/list`. Only supplementary document fetching uses a `ResourceTemplate`, since document paths are dynamic.
- **Progressive disclosure via URI hierarchy**: `skill://index` → `skill://{name}` → `skill://{name}/documents` → `skill://{name}/document/{path}`. Clients can fetch summaries first and load full content on demand.
- **`skill://prompt-xml` for injection**: Allows hosts to inject skill awareness into system prompts using the resources primitive, rather than embedding skill names in tool descriptions.
- **No `zod` dependency**: Unlike the tools approach, resources do not require input schemas, so the Zod dependency is not needed.

## How This Differs from Skills as Tools

| Aspect | Skills as Tools | Skills as Resources |
| :--- | :--- | :--- |
| Control model | Model-controlled (LLM invokes) | Application-controlled (host/client reads) |
| MCP Primitive | Tools | Resources |
| Discovery | Tool description + `list_skills` call | `resources/list` + `skill://index` |
| Loading | `read_skill(name)` tool call | `resources/read` on `skill://{name}` |
| System prompt | Via tool description embedding | Via `skill://prompt-xml` resource |
| Input validation | Zod schema on tool parameters | URI template matching |
| Supplementary files | Not demonstrated | `ResourceTemplate` for documents |

## What This Example Intentionally Omits

- File watching / resource subscriptions (capability is declared but not wired)
- Dynamic updates (`resources.listChanged` is declared but not triggered)
- MCP Prompts for explicit skill invocation
- GitHub sync, configuration UI
- `skill://` URI scheme registration or standardization

## Answers to Open Question #12

> "Why not just use resources?"

This implementation shows that resources **do work** for skill delivery. Key findings for evaluation:

- **Discovery**: Skills appear in `resources/list`, making them immediately visible to any MCP-aware client
- **Progressive disclosure**: The URI hierarchy (`index` → `skill` → `documents` → `document`) provides the same layered loading as the tools approach
- **System prompt injection**: `skill://prompt-xml` provides a clean mechanism for hosts to inject skill awareness
- **Control model trade-off**: Resources are application-controlled — the host decides when/whether to read them. This may lead to lower utilization compared to model-controlled tools (see experimental findings), but gives the host more control over context management

## Relationship to Other Approaches

| Approach | How it differs |
| :--- | :--- |
| **1. Skills as Primitives** (SEP-2076) | Uses dedicated `skills/list` and `skills/get` protocol methods instead of resources |
| **3. Skills as Tools** (sibling example) | Uses MCP tools (model-controlled) instead of resources (application-controlled) |
| **5. Server Instructions** | Uses server instructions to point to resources instead of exposing resources directly |
| **6. Convention** | This example could become part of a documented convention pattern |

## Inspirations and Attribution

This reference implementation is original code inspired by patterns from:

- **[skills-over-mcp](https://github.com/keithagroves/skills-over-mcp)** by [Keith Groves](https://github.com/keithagroves) — Resource-based skill exposure, `skill://` URI scheme, JSON index, XML prompt injection, document templates
- **[skilljack-mcp](https://github.com/olaservo/skilljack-mcp)** by [Ola Hungerford](https://github.com/olaservo) — Resource template patterns, subscription architecture, path security
