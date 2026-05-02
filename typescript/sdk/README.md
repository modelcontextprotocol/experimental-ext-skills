# @modelcontextprotocol/experimental-ext-skills

TypeScript SDK for the [Skills Extension SEP](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69) — serves agent skills as `skill://` resources over MCP.

> **Experimental.** Published as [`@modelcontextprotocol/experimental-ext-skills`](https://www.npmjs.com/package/@modelcontextprotocol/experimental-ext-skills) for testing while the spec is in draft.

## Install

```bash
npm install @modelcontextprotocol/experimental-ext-skills @modelcontextprotocol/sdk
```

## Subpath exports

| Import path | Purpose |
|---|---|
| `@modelcontextprotocol/experimental-ext-skills` | Shared types, URI utilities, constants |
| `@modelcontextprotocol/experimental-ext-skills/server` | Server-side: discover skills, register MCP resources |
| `@modelcontextprotocol/experimental-ext-skills/client` | Client-side: list skills, read content, build summaries |

## Server usage

Discover skills from a directory of `SKILL.md` files and serve them as MCP resources:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  declareSkillsExtension,
} from "@modelcontextprotocol/experimental-ext-skills/server";

// Recursively scan a directory for SKILL.md files
const skillMap = discoverSkills("./skills");

// Create server and declare the skills extension (SEP-2133)
const server = new McpServer(
  { name: "my-server", version: "1.0.0" },
  { capabilities: { resources: {} } },
);
declareSkillsExtension(server.server);

// Register all skill resources (SKILL.md, manifests, index, templates)
registerSkillResources(server, skillMap, "./skills", {
  template: true,    // enable resource template for supporting files
  promptXml: true,   // enable skill://prompt-xml convenience resource
  // audience defaults to ["assistant"] — skills consumed only by the model
  // use ["user", "assistant"] for skills also shown in a skill browser UI
});

await server.connect(new StdioServerTransport());
```

### Skill directory structure

```
skills/
  code-review/
    SKILL.md                    # Required: YAML frontmatter + markdown body
    references/
      REFERENCE.md              # Optional: supporting files
  acme/billing/refunds/
    SKILL.md                    # Multi-segment paths supported
    templates/
      refund-email-template.md
```

Each `SKILL.md` requires YAML frontmatter with `name` and `description`:

```yaml
---
name: code-review
description: Review code changes for quality and correctness
---

# Code Review

Instructions for the agent...
```

### Registered resources

For each skill, the server registers:

- `skill://{skillPath}/SKILL.md` -- skill content
- `skill://{skillPath}/_manifest` -- file manifest with SHA-256 hashes
- `skill://index.json` -- discovery index (all skills)
- `skill://{+skillFilePath}` -- resource template for supporting files (optional)
- `skill://prompt-xml` -- XML summary for system prompt injection (optional)

### Resource annotations

All resources include `annotations` with `audience`, `priority`, and `lastModified` (see [`skill-meta-keys.md`](../../docs/skill-meta-keys.md)):

- **`audience`** defaults to `["assistant"]`. Override globally via options, or per-skill via `SkillMetadata.audience`:

```typescript
// Global default for all skills
registerSkillResources(server, skillMap, "./skills", {
  audience: ["user", "assistant"],
});

// Per-skill override (e.g., set from frontmatter or config)
const skillMap = discoverSkills("./skills");
for (const skill of skillMap.values()) {
  skill.audience = ["user", "assistant"];
}
```

- **`priority`** is set per resource type: 1.0 (SKILL.md), 0.8 (index), 0.5 (manifest), 0.3 (prompt-xml), 0.2 (supporting files)
- **`lastModified`** uses per-skill mtime for SKILL.md and manifest resources, and the most recent mtime across all skills for aggregate resources (index, template, prompt-xml)
- **`size`** is set on all resources except the template (which varies per request)

### Resource templates in the index

Servers with parameterized skill namespaces can include `mcp-resource-template` entries in the discovery index. Pass them to `registerSkillResources()` and they are automatically included in `skill://index.json`:

```typescript
registerSkillResources(server, skillMap, "./skills", {
  templates: [
    {
      name: "docs",
      description: "Product documentation",
      uriTemplate: "skill://docs/{product}/SKILL.md",
    },
  ],
});
```

### Archive distribution

Per SEP-2640, a skill MAY also be distributed as a single packed resource (`.tar.gz` or `.zip`). Pass declarations to `registerSkillResources()`; the SDK reads each archive at startup, registers it as an MCP resource at `skill://<skillPath>.<format>`, and includes it in `skill://index.json` with `type: "archive"`:

```typescript
registerSkillResources(server, skillMap, "./skills", {
  archives: [
    {
      name: "pdf-processing",
      description: "Extract and assemble PDFs",
      skillPath: "pdf-processing",
      archivePath: "./archives/pdf-processing.tar.gz",
      // format inferred from extension; pass "tar.gz" | "zip" to override
    },
  ],
});
```

The SEP requires that the final segment of `skillPath` equals the skill's frontmatter `name`; the SDK validates this and throws on mismatch.

## Client usage

### Quick start

Discover skills and build a system prompt catalog in one call:

```typescript
import { discoverAndBuildCatalog } from "@modelcontextprotocol/experimental-ext-skills/client";

const { skills, catalog } = await discoverAndBuildCatalog(client, {
  serverName: "my-skills-server",
});

console.log(`Discovered ${skills.length} skill(s)`);
// Inject `catalog` into your agent's system prompt
```

`discoverAndBuildCatalog()` handles the recommended discovery strategy (try `skill://index.json` first, fall back to `resources/list`) and builds an XML catalog with behavioral instructions for the model. The `serverName` is required here because the default reader tool (`READ_RESOURCE_TOOL`) takes a `server` parameter — including it in the prompt raises model activation reliability from ~33% to ~90%.

If you're calling the lower-level `buildSkillsCatalog()` with a reader tool that's already scoped to one server and only takes `uri`, omit `serverName` — the catalog will drop the `with server …` clause rather than mention an argument the tool doesn't accept.

### Step by step

For more control, use the lower-level functions directly:

```typescript
import {
  discoverSkills,
  listSkillsFromIndex,
  listSkillTemplatesFromIndex,
  readSkillUri,
  readSkillContent,
  readSkillArchive,
  readSkillManifest,
  readSkillDocument,
  buildSkillsCatalog,
  buildSkillsSummary,
  READ_RESOURCE_TOOL,
} from "@modelcontextprotocol/experimental-ext-skills/client";

// Discover skills (index-first with fallback, always returns an array)
// Includes both type: "skill-md" and type: "archive" entries.
const skills = await discoverSkills(client);

// Or use specific discovery mechanisms:
const indexSkills = await listSkillsFromIndex(client);   // skill://index.json (returns null if unavailable)
const templates = await listSkillTemplatesFromIndex(client); // mcp-resource-template entries

// Read skill content by URI (works with any scheme: skill://, repo://, github://, etc.)
const content = await readSkillUri(client, skill.uri);

// Or by skill path (convenience, skill:// scheme only)
const md = await readSkillContent(client, "acme/billing/refunds");

// Fetch + unpack an archive-distributed skill
const archive = await readSkillArchive(client, "skill://pdf-processing.tar.gz");
const archiveSkillMd = archive.files.get("SKILL.md")!.toString("utf-8");

// Read file manifest (SHA-256 hashes for each file)
const manifest = await readSkillManifest(client, "code-review");

// Read a supporting file
const doc = await readSkillDocument(client, "acme/billing/refunds", "templates/refund-email-template.md");

// Build catalog or summary for context injection
const catalog = buildSkillsCatalog(skills, { toolName: "read_resource", serverName: "my-server" });
const summary = buildSkillsSummary(skills);

// READ_RESOURCE_TOOL — tool schema for model-driven skill loading
// Hosts expose this so the model can call read_resource(server, uri)
console.log(READ_RESOURCE_TOOL);
```

### Reading archive-distributed skills

`listSkillsFromIndex()` returns archive entries with `type: "archive"`. Use `readSkillArchive()` to fetch and unpack:

```typescript
import { readSkillArchive } from "@modelcontextprotocol/experimental-ext-skills/client";

const skills = await listSkillsFromIndex(client) ?? [];
for (const summary of skills) {
  if (summary.type === "archive") {
    const archive = await readSkillArchive(client, summary.uri);
    const skillMd = archive.files.get("SKILL.md")!.toString("utf-8");
    // Other files in archive.files keyed by relative path —
    // identical namespace to skill://<skillPath>/<file-path>
  }
}
```

The host MUST support both `.tar.gz` (`application/gzip`) and `.zip` (`application/zip`); the SDK dispatches on `mimeType` (with URL-suffix fallback). Archive safety is enforced: path traversal, absolute paths, and out-of-tree symlinks are rejected, with bounded total size, per-file size, and entry count to defend against decompression bombs.

### Scheme-agnostic discovery

Per the SEP, `skill://` is SHOULD, not MUST. Servers may serve skills under any URI scheme (e.g., `repo://`, `github://`) provided they are listed in `skill://index.json`. The discovery functions (`discoverSkills`, `listSkillsFromIndex`) handle any scheme in index entries, and `readSkillUri()` reads any URI regardless of scheme.

## URI scheme

```
skill://code-review/SKILL.md                     # single-segment path
skill://acme/billing/refunds/SKILL.md            # multi-segment path
skill://acme/billing/refunds/_manifest            # file manifest
skill://acme/billing/refunds/templates/email.md   # supporting file
skill://index.json                                # discovery index
skill://prompt-xml                                # XML summary
```

URI utilities are available from the main import:

```typescript
import { parseSkillUri, buildSkillUri, isSkillContentUri } from "@modelcontextprotocol/experimental-ext-skills";
```

## Related

- [Skills Extension SEP (PR #69)](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69) -- the spec this implements
- [Skills Over MCP Interest Group](https://github.com/modelcontextprotocol/experimental-ext-skills) -- parent repository
- [Agent Skills well-known URI spec](https://github.com/agentskills/agentskills/pull/254) -- HTTP discovery spec the bridge targets
- [Server example](../../examples/skills-server/typescript/) -- reference MCP server
- [Client example](../../examples/skills-client/typescript/) -- reference MCP client

## License

Apache-2.0
