# Skills as Resources — Reference Implementation

> **Experimental** — This is a reference implementation for evaluation by the Skills Over MCP Interest Group.

## Pattern Overview

This example demonstrates the **Resources approach** from [`docs/approaches.md`](../../docs/approaches.md): exposing agent skills via MCP resources using the `skill://` URI scheme.

An MCP server scans a directory for SKILL.md files and exposes them as resources:

| Type | Name / URI | MIME Type | Purpose |
| :--- | :--- | :--- | :--- |
| Resource | `skill://{name}/SKILL.md` | `text/markdown` | Full SKILL.md content (listed) |
| Resource | `skill://{name}/_manifest` | `application/json` | File inventory with SHA256 hashes (listed) |
| Resource | `skill://{name}/{+path}` | varies | Supporting file (template, not listed); text files return UTF-8 content, binary files return base64-encoded blobs |
| Resource | `skill://prompt-xml` | `application/xml` | XML for system prompt injection (optional) |

The URI scheme is aligned with the [SkillsDotNet](https://github.com/pederhp/skillsdotnet) conventions, enabling interoperability between TypeScript and C# implementations. Clients can discover skills by scanning `resources/list` for URIs matching `skill://*/SKILL.md`.

This is a **resources-only** server. Clients are expected to provide their own `read_resource` tool so the model can load skill content on demand. See [Client Expectations](#client-expectations) and [Open Question #9](../../docs/open-questions.md) for the control model discussion.

## How It Works

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  MCP Client  │────▶│  Skills as Resources  │────▶│  Skill Files  │
│  (e.g. Claude│◀────│     MCP Server        │◀────│  (SKILL.md)   │
│   Code)      │     └──────────────────────┘     └──────────────┘
└─────────────┘
```

1. **Startup**: Server scans the configured skills directory for `*/SKILL.md` (or `skill.md`) files and supplementary documents; computes SHA256 hashes and builds file manifests
2. **Discovery**: Parses YAML frontmatter to extract `name` and `description`
3. **Registration**: Registers static resources (`SKILL.md` + `_manifest`) for each skill, and a `ResourceTemplate` for supporting files with auto-completion hints (skill name and file path)
4. **Progressive disclosure** (via resources): `resources/list` → scan for `skill://*/SKILL.md` → read `skill://{name}/SKILL.md` on demand → read `skill://{name}/_manifest` for file inventory → read `skill://{name}/{path}` for supporting files
5. **System prompt injection**: `skill://prompt-xml` provides XML that hosts can inject into system prompts
6. **Capability declaration**: Server declares `resources.listChanged` and `resources.subscribe` capabilities
7. **Resource subscriptions**: Clients can call `resources/subscribe` on any `skill://` URI to receive `notifications/resources/updated` when the underlying file(s) change on disk. Watchers are created on-demand via [chokidar](https://github.com/paulmillr/chokidar) and cleaned up on unsubscribe.
8. **Dynamic skill management (hot-reload)**: The server watches the skills directory for structural changes — new or removed skill subdirectories and `SKILL.md` files appearing or disappearing. When changes are detected (debounced at 500ms), the server re-scans the directory: new skills get their `SKILL.md` and `_manifest` resources registered, removed skills get their resources unregistered and subscriptions cleaned up. A `notifications/resources/list_changed` notification is sent to connected clients so they can refresh their resource lists.

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
npx @modelcontextprotocol/inspector node dist/index.js ../../sample-skills
```

**Development mode** (no build step):
```bash
npm run dev -- ../../sample-skills
```

### Options

| Flag | Default | Description |
| :--- | :--- | :--- |
| `[skillsDir]` | `examples/sample-skills/` | Path to the skills directory |

## Security Features

The implementation includes:

- **Path traversal protection** — Resolved paths are checked against the skills directory boundary using `realpathSync`. Symlink escapes are detected.
- **Skill name validation** — Resources look up names by key in the discovered skills map. User input is never used to construct file paths.
- **File path validation** — Paths containing `..` are rejected. All paths are verified to be within the skills directory.
- **File size limits** — Files larger than 1MB are skipped during discovery and rejected on read.
- **Safe YAML parsing** — Uses the `yaml` package which is safe by default.
- **Content integrity** — The `_manifest` resource includes SHA256 hashes for all files, enabling clients to verify downloaded content.

## Sample Skills

Two shared sample skills are included in [`examples/sample-skills/`](../../sample-skills/) for testing:

| Skill | Description | Documents | Notes |
| :--- | :--- | :--- | :--- |
| `code-review` | Structured code review methodology | `references/REFERENCE.md` | Tests document scanning, `_manifest` with hashes, and `ResourceTemplate` |
| `git-commit-review` | Review commits for quality and conventional format | None | Tests basic skill resource with no supporting files |

## Key Design Decisions

- **Resources-only server**: The server exposes skills purely as MCP resources. Clients are responsible for providing model-controlled access (e.g., a `read_resource` tool). This avoids per-server duplication of tool logic and keeps the compatibility matrix clean — servers don't need to negotiate with clients about who provides skill-loading tools. See [PR #16 discussion](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/16#discussion_r2853911362) for context.
- **URI scheme aligned with skillsdotnet**: The `skill://{name}/SKILL.md` and `skill://{name}/_manifest` URI conventions match the [SkillsDotNet](https://github.com/pederhp/skillsdotnet) C# implementation. This enables cross-implementation interoperability — a client-side `SkillCatalog` can discover skills from either implementation by scanning `resources/list` for `skill://*/SKILL.md` URIs.
- **`_manifest` with SHA256 hashes**: Pre-computed at startup with file sizes and content hashes. Enables download/sync workflows and cache invalidation without re-reading files on each request.
- **Listed resources for skills, template for supporting files**: Each skill's `SKILL.md` and `_manifest` are concrete resources visible in `resources/list`. Supporting files are accessed via a `ResourceTemplate` (`skill://{name}/{+path}`) and are discoverable through the `_manifest` — keeping `resources/list` clean.
- **`skill://prompt-xml` for injection**: Optional convenience resource that allows hosts to inject skill awareness into system prompts using the resources primitive.

## Resource Annotations

All resources include MCP [resource annotations](https://modelcontextprotocol.io/specification/draft/server/resources#annotations) to help clients filter, prioritize, and display skill resources appropriately.

| Resource | `audience` | `priority` | `lastModified` |
| :--- | :--- | :--- | :--- |
| `skill://{name}/SKILL.md` | `["user", "assistant"]` | `1.0` | SKILL.md file mtime |
| `skill://{name}/_manifest` | `["user", "assistant"]` | `0.5` | SKILL.md file mtime |
| `skill://{name}/{+path}` | `["user", "assistant"]` | `0.2` | — |
| `skill://prompt-xml` | `["user", "assistant"]` | `0.3` | — |

All resources default to both audiences. The [Agent Skills specification](https://agentskills.org) is actively discussing a frontmatter `metadata` field (e.g., `invocation: model | user`) that would allow skill authors to narrow the intended audience per-skill. When that is finalized, this implementation will parse it from `metadata` and map it to the MCP `audience` annotation accordingly.

### Priority Scale

- **1.0** — Primary skill content (SKILL.md). Clients should include these in context.
- **0.5** — Supporting metadata (\_manifest). Include if context budget allows.
- **0.3** — Convenience resources (prompt-xml). Optional.
- **0.2** — Supporting files (template). Load on demand only.

## Client Expectations

This server exposes skills as resources only — it does **not** include server-side tools for skill loading. Clients are expected to provide model-controlled access to resources. This is a small lift compared to features like elicitation or sampling, and avoids the duplication and compatibility issues of per-server tool workarounds.

### Recommended client behavior

1. **Enumerate skills**: Call `resources/list` and filter for URIs matching `skill://*/SKILL.md`. Each matching resource's `description` field contains the skill summary from frontmatter.
2. **Build context summaries**: Load skill metadata (name + description) into the system prompt so the model knows which skills are available (~50-100 tokens per skill).
3. **Provide a `read_resource` tool**: Expose a client-side tool that maps internally to the MCP client SDK's `readResource()` call. This lets the model load full skill content on demand. Example system prompt note: *"Use the `read_resource` tool to load MCP-based skills by their `skill://` URI."*
4. **Subscribe to changes** (optional): Call `resources/subscribe` on skill URIs to receive `notifications/resources/updated` when files change on disk. Re-enumerate on `notifications/resources/list_changed`.
5. **Use `skill://prompt-xml`** (optional): Read the `skill://prompt-xml` resource for pre-built `<available_skills>` XML suitable for system prompt injection, as an alternative to building your own summaries from step 1.

### SDK integration sketch

A client SDK might expose a helper like:

```typescript
// Pseudocode — not a real SDK method (yet)
const skills = await client.listResources()
  .then(({ resources }) => resources
    .filter(r => r.uri.match(/^skill:\/\/[^/]+\/SKILL\.md$/))
    .map(r => ({ uri: r.uri, name: r.name, description: r.description }))
  );
```

See [PR #16 discussion](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/16#discussion_r2859600003) for the full rationale on why client-side `read_resource` is preferred over server-side `load_skill` tools.

## Answers to Open Question #12

> "Why not just use resources?"

This implementation shows that resources **do work** for skill delivery. Key findings for evaluation:

- **Discovery**: Skills appear in `resources/list` as `skill://*/SKILL.md`, making them immediately visible to any MCP-aware client
- **Progressive disclosure**: The URI hierarchy (`SKILL.md` → `_manifest` → `{path}`) provides layered loading. Clients can choose how deeply to load based on context budget.
- **System prompt injection**: `skill://prompt-xml` provides a clean mechanism for hosts to inject skill awareness
- **Control model**: Resources are application-controlled. Model-controlled access comes from the client providing a `read_resource` tool — this is a small lift for clients (see [Client Expectations](#client-expectations)) and avoids the duplication problems of server-side tool workarounds.
- **Interoperability**: The `skill://` URI convention is shared with skillsdotnet, enabling cross-implementation discovery
- **Caching**: Using resources directly lets clients take advantage of MCP resource semantics (e.g., caching, subscriptions) rather than re-implementing them via tool wrappers

## Relationship to Other Approaches

| Approach | How it differs |
| :--- | :--- |
| **1. Skills as Primitives** (SEP-2076) | Uses dedicated `skills/list` and `skills/get` protocol methods instead of resources |
| **3. Skills as Tools** (sibling example) | Uses MCP tools only (model-controlled) instead of resources |
| **5. Server Instructions** | Uses server instructions to point to resources instead of exposing resources directly |
| **6. Convention** | This example could become part of a documented convention pattern |

## Borrowing From SkillsDotNet

The URI scheme in this implementation is aligned with [SkillsDotNet](https://github.com/pederhp/skillsdotnet), a C# implementation of the same pattern. Both implementations use:

- `skill://{name}/SKILL.md` — listed resource for skill content
- `skill://{name}/_manifest` — listed resource for file inventory (with SHA256 hashes)
- `skill://{name}/{+path}` — resource template for supporting files

1. Scan `resources/list` for URIs matching `skill://*/SKILL.md`
2. Read each SKILL.md to extract frontmatter (name + description)
3. Build compact context summaries for the system prompt (~50-100 tokens per skill)
4. Provide a `read_resource` tool so the model can load full skill content on demand

## Comparison to FastMCP Implementation

[FastMCP](https://github.com/jlowin/fastmcp) includes support for the `skill://` URI scheme through its [Skills Provider](https://gofastmcp.com/servers/providers/skills). Both FastMCP and this implementation converge on:

- Same three-tier resource model: listed `SKILL.md` + listed `_manifest` + template for supporting files
- Same manifest format: `{ skill, files: [{ path, size, hash }] }` with `sha256:<hex>` hashes
- Same discovery model: scan for `SKILL.md` frontmatter, enumerate supporting files, pre-compute hashes
- Same security model: path traversal prevention, symlink resolution, MIME type detection

Key architectural differences:

| Aspect | This implementation | FastMCP |
| :--- | :--- | :--- |
| Reactivity | Push-based (file watching + subscriptions) | Poll-based (optional re-scan on request) |
| Access model | Resources-only (clients provide `read_resource` tool) | Resources + client utilities |
| Architecture | Flat, single-server | Layered provider hierarchy with vendor presets (Claude, Cursor, Codex, Gemini, etc.) |
| Client utilities | Documented expectations (see [Client Expectations](#client-expectations)) | Includes `list_skills`, `download_skill`, `sync_skills` for skill distribution |
| System prompt injection | Optional `skill://prompt-xml` resource | Not implemented (relies on client) |
| Resource annotations | `audience`, `priority`, `lastModified` on all resources | Not set (uses internal metadata) |

## Inspirations and Attribution

This reference implementation derives from:

- **[skills-over-mcp](https://github.com/keithagroves/skills-over-mcp)** by [Keith Groves](https://github.com/keithagroves) — Resource-based skill exposure, `skill://` URI scheme, JSON index, XML prompt injection, document templates
- **[skilljack-mcp](https://github.com/olaservo/skilljack-mcp)** by [Ola Hungerford](https://github.com/olaservo) — Resource template patterns, subscription architecture, path security
- **[skillsdotnet](https://github.com/PederHP/skillsdotnet)** by [Peder HP](https://github.com/PederHP) — `_manifest` resource with file hashes, `SkillCatalog` client-side pattern, URI scheme conventions
