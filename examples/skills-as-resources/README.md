# Skills as Resources — Reference Implementation

> **Experimental** — This is a reference implementation for evaluation by the Skills Over MCP Interest Group.

## Pattern Overview

This example demonstrates the **Resources approach** from [`docs/approaches.md`](../../docs/approaches.md): exposing agent skills via MCP resources using the `skill://` URI scheme, combined with a `load_skill` tool for model-controlled progressive disclosure.

An MCP server scans a directory for SKILL.md files and exposes them as resources and tools:

| Type | Name / URI | MIME Type | Purpose |
| :--- | :--- | :--- | :--- |
| Resource | `skill://{name}/SKILL.md` | `text/markdown` | Full SKILL.md content (listed) |
| Resource | `skill://{name}/_manifest` | `application/json` | File inventory with SHA256 hashes (listed) |
| Resource | `skill://{name}/{+path}` | varies | Supporting file (template, not listed) |
| Resource | `skill://prompt-xml` | `application/xml` | XML for system prompt injection (optional) |
| Tool | `load_skill` | — | Model-controlled skill loading |

The URI scheme is aligned with the [SkillsDotNet](https://github.com/bradwilson/skillsdotnet) conventions, enabling interoperability between TypeScript and C# implementations. Clients can discover skills by scanning `resources/list` for URIs matching `skill://*/SKILL.md`.

This is a **hybrid** approach: resources provide **application-controlled** access (the host/client decides when to read), while the `load_skill` tool provides **model-controlled** access (the LLM decides when to invoke). See [Open Question #9](../../docs/open-questions.md) for the control model discussion.

## How It Works

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  MCP Client  │────▶│  Skills as Resources  │────▶│  Skill Files  │
│  (e.g. Claude│◀────│     MCP Server        │◀────│  (SKILL.md)   │
│   Code)      │     └──────────────────────┘     └──────────────┘
└─────────────┘
```

1. **Startup**: Server scans the configured skills directory for `*/SKILL.md` files and supplementary documents; computes SHA256 hashes and builds file manifests
2. **Discovery**: Parses YAML frontmatter to extract `name` and `description`
3. **Registration**: Registers static resources (`SKILL.md` + `_manifest`) for each skill, a `ResourceTemplate` for supporting files, and a `load_skill` tool
4. **Progressive disclosure** (two paths):
   - **Application-controlled** (via resources): `resources/list` → scan for `skill://*/SKILL.md` → read `skill://{name}/SKILL.md` on demand → read `skill://{name}/_manifest` for file inventory → read `skill://{name}/{path}` for supporting files
   - **Model-controlled** (via tool): `tools/list` → discover `load_skill` with available skill names in description → call `load_skill("code-review")` to get full content
5. **System prompt injection**: `skill://prompt-xml` provides XML that hosts can inject into system prompts
6. **Capability declaration**: Server declares `resources.listChanged` and `resources.subscribe` capabilities
7. **Resource subscriptions**: Clients can call `resources/subscribe` on any `skill://` URI to receive `notifications/resources/updated` when the underlying file(s) change on disk. Watchers are created on-demand via [chokidar](https://github.com/paulmillr/chokidar) and cleaned up on unsubscribe.

## Implementations

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

## Security Features

The implementation includes:

- **Path traversal protection** — Resolved paths are checked against the skills directory boundary using `realpathSync`. Symlink escapes are detected.
- **Skill name validation** — Resources and the `load_skill` tool look up names by key in the discovered skills map. User input is never used to construct file paths.
- **File path validation** — Paths containing `..` are rejected. All paths are verified to be within the skills directory.
- **File size limits** — Files larger than 1MB are skipped during discovery and rejected on read.
- **Safe YAML parsing** — Uses the `yaml` package which is safe by default.
- **Content integrity** — The `_manifest` resource includes SHA256 hashes for all files, enabling clients to verify downloaded content.

## Sample Skills

Two sample skills are included in `sample-skills/` for testing:

| Skill | Description | Documents | Notes |
| :--- | :--- | :--- | :--- |
| `code-review` | Structured code review methodology | `references/REFERENCE.md` | Tests document scanning, `_manifest` with hashes, and `ResourceTemplate` |
| `git-commit-review` | Review commits for quality and conventional format | None | Tests basic skill resource with no supporting files |

## Key Design Decisions

- **Hybrid approach (resources + tool)**: Resources provide application-controlled access for hosts that want to manage context. The `load_skill` tool provides model-controlled access for progressive disclosure. Experimental findings show models reliably use tools but tend to ignore resources (see [`docs/experimental-findings.md`](../../docs/experimental-findings.md)), making the hybrid approach more practical than resources alone.
- **URI scheme aligned with skillsdotnet**: The `skill://{name}/SKILL.md` and `skill://{name}/_manifest` URI conventions match the [SkillsDotNet](https://github.com/bradwilson/skillsdotnet) C# implementation. This enables cross-implementation interoperability — a client-side `SkillCatalog` can discover skills from either implementation by scanning `resources/list` for `skill://*/SKILL.md` URIs.
- **`_manifest` with SHA256 hashes**: Pre-computed at startup with file sizes and content hashes. Enables download/sync workflows and cache invalidation without re-reading files on each request.
- **Listed resources for skills, template for supporting files**: Each skill's `SKILL.md` and `_manifest` are concrete resources visible in `resources/list`. Supporting files are accessed via a `ResourceTemplate` (`skill://{name}/{+path}`) and are discoverable through the `_manifest` — keeping `resources/list` clean.
- **`skill://prompt-xml` for injection**: Optional convenience resource that allows hosts to inject skill awareness into system prompts using the resources primitive.

## How This Differs from Skills as Tools

| Aspect | Skills as Tools | Skills as Resources (this example) |
| :--- | :--- | :--- |
| Control model | Model-controlled only | Hybrid: application-controlled (resources) + model-controlled (`load_skill` tool) |
| MCP Primitive | Tools | Resources + Tools |
| Discovery | Tool description + `list_skills` call | `resources/list` scan for `skill://*/SKILL.md` + `load_skill` tool description |
| Loading | `read_skill(name)` tool call | `resources/read` on `skill://{name}/SKILL.md` or `load_skill(name)` tool call |
| File inventory | Not demonstrated | `skill://{name}/_manifest` with SHA256 hashes |
| System prompt | Via tool description embedding | Via `skill://prompt-xml` resource or `load_skill` tool description |
| Input validation | Zod schema on tool parameters | URI template matching (resources) + Zod schema (`load_skill` tool) |
| Supporting files | Not demonstrated | `ResourceTemplate` for files, `_manifest` for discovery |

## Answers to Open Question #12

> "Why not just use resources?"

This implementation shows that resources **do work** for skill delivery, and that combining them with a `load_skill` tool creates a more practical system. Key findings for evaluation:

- **Discovery**: Skills appear in `resources/list` as `skill://*/SKILL.md`, making them immediately visible to any MCP-aware client. The `load_skill` tool description also lists available skills for model discovery.
- **Progressive disclosure**: The URI hierarchy (`SKILL.md` → `_manifest` → `{path}`) provides layered loading. The `load_skill` tool provides an alternative on-demand loading path.
- **System prompt injection**: `skill://prompt-xml` provides a clean mechanism for hosts to inject skill awareness
- **Control model**: The hybrid approach gives both the host (via resources) and the model (via `load_skill` tool) agency over when skill content gets loaded
- **Interoperability**: The `skill://` URI convention is shared with skillsdotnet, enabling cross-implementation discovery

## Relationship to Other Approaches

| Approach | How it differs |
| :--- | :--- |
| **1. Skills as Primitives** (SEP-2076) | Uses dedicated `skills/list` and `skills/get` protocol methods instead of resources |
| **3. Skills as Tools** (sibling example) | Uses MCP tools only (model-controlled) instead of the hybrid resources + tool approach |
| **5. Server Instructions** | Uses server instructions to point to resources instead of exposing resources directly |
| **6. Convention** | This example could become part of a documented convention pattern |

## Convergence with SkillsDotNet

The URI scheme in this implementation is aligned with [SkillsDotNet](https://github.com/pederhp/skillsdotnet), a C# implementation of the same pattern. Both implementations use:

- `skill://{name}/SKILL.md` — listed resource for skill content
- `skill://{name}/_manifest` — listed resource for file inventory (with SHA256 hashes)
- `skill://{name}/{+path}` — resource template for supporting files

This convergence enables a future client-side `SkillCatalog` to discover and load skills from either implementation without knowing which language the server is written in. The key client-side pattern (from skillsdotnet) is:

1. Scan `resources/list` for URIs matching `skill://*/SKILL.md`
2. Read each SKILL.md to extract frontmatter (name + description)
3. Build compact context summaries for the system prompt (~50-100 tokens per skill)
4. Expose a `load_skill` tool/function for on-demand full content loading

## Inspirations and Attribution

This reference implementation is original code inspired by patterns from:

- **[skills-over-mcp](https://github.com/keithagroves/skills-over-mcp)** by [Keith Groves](https://github.com/keithagroves) — Resource-based skill exposure, `skill://` URI scheme, JSON index, XML prompt injection, document templates
- **[skilljack-mcp](https://github.com/olaservo/skilljack-mcp)** by [Ola Hungerford](https://github.com/olaservo) — Resource template patterns, subscription architecture, path security
- **[skillsdotnet](https://github.com/PederHP/skillsdotnet)** by [Peder HP](https://github.com/PederHP) — `_manifest` resource with file hashes, `load_skill` tool, `SkillCatalog` client-side pattern, URI scheme conventions
