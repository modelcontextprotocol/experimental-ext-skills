# @modelcontextprotocol/ext-skills

TypeScript SDK for the **Skills as Resources** MCP extension pattern — exposing agent skills via MCP resources using the `skill://` URI scheme.

## Installation

```bash
npm install @modelcontextprotocol/ext-skills
```

Requires `@modelcontextprotocol/sdk` ^1.0.0 as a peer dependency.

## Quick Start

### Server: Discover and register skills

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverSkills, registerSkillResources } from "@modelcontextprotocol/ext-skills/server";

const server = new McpServer(
  { name: "my-skills-server", version: "1.0.0" },
  { capabilities: { resources: {} } },
);

const skillsDir = "./skills";
const skillMap = discoverSkills(skillsDir);
const handles = registerSkillResources(server, skillMap, skillsDir);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Client: List and summarize skills

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  listSkillResources,
  buildSkillsSummary,
  generateSkillsXMLFromSummaries,
} from "@modelcontextprotocol/ext-skills/client";

// After connecting to a skills server...
const skills = await listSkillResources(client);
console.log(buildSkillsSummary(skills));

// Or generate XML for system prompt injection:
const xml = generateSkillsXMLFromSummaries(skills);
```

## API

### Types

- `SkillMetadata` — Full server-side skill metadata (name, description, path, documents, manifest)
- `SkillSummary` — Lightweight client-side type: `{ name, uri, description?, mimeType? }`
- `SkillDocument` — Supplementary file entry (path, mimeType, size, hash)
- `SkillManifest` / `ManifestFileEntry` — File inventory with SHA256 hashes
- `RegisterSkillResourcesOptions` — Options for `registerSkillResources()`
- `SkillResourceHandles` — Return type mapping skill names to resource handles

### URI Utilities

```typescript
import { parseSkillUri, buildSkillUri, isSkillContentUri, isSkillManifestUri } from "@modelcontextprotocol/ext-skills";

parseSkillUri("skill://code-review/SKILL.md");
// → { name: "code-review", path: "SKILL.md" }

buildSkillUri("code-review");
// → "skill://code-review/SKILL.md"

buildSkillUri("code-review", "_manifest");
// → "skill://code-review/_manifest"

isSkillContentUri("skill://code-review/SKILL.md"); // true
isSkillManifestUri("skill://code-review/_manifest"); // true
```

### MIME Utilities

```typescript
import { getMimeType, isTextMimeType } from "@modelcontextprotocol/ext-skills";

getMimeType("doc.md");     // "text/markdown"
getMimeType("image.png");  // "image/png"
isTextMimeType("text/markdown");      // true
isTextMimeType("application/json");   // true
isTextMimeType("image/png");          // false
```

### XML Generation

```typescript
import { generateSkillsXML } from "@modelcontextprotocol/ext-skills/server";
import { generateSkillsXMLFromSummaries } from "@modelcontextprotocol/ext-skills/client";

// Server-side: from SkillMetadata map
const xml = generateSkillsXML(skillMap);

// Client-side: from SkillSummary array
const xml = generateSkillsXMLFromSummaries(skills);
```

### Server

```typescript
import { discoverSkills, registerSkillResources } from "@modelcontextprotocol/ext-skills/server";

// Discover all skills in a directory
const skillMap = discoverSkills("./skills");

// Register resources on an McpServer
const handles = registerSkillResources(server, skillMap, "./skills", {
  template: true,   // Register resource template for supporting files (default: true)
  promptXml: false,  // Register skill://prompt-xml resource (default: false)
});
```

### Client

```typescript
import {
  READ_RESOURCE_TOOL,
  listSkillResources,
  readSkillContent,
  readSkillManifest,
  readSkillDocument,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "@modelcontextprotocol/ext-skills/client";

// List all skills from an MCP client (handles pagination)
const skills = await listSkillResources(client);

// Parse frontmatter from skill content (no yaml dependency needed)
const meta = parseSkillFrontmatter(content);
// → { name: "code-review", description: "Review code" }

// Build plain-text summary for context injection
const summary = buildSkillsSummary(skills);

// Read skill content, manifest, and supporting files
const skillContent = await readSkillContent(client, "code-review");
const manifest = await readSkillManifest(client, "code-review");
const doc = await readSkillDocument(client, "code-review", "references/REFERENCE.md");
```

### Tool Schema

The SDK exports a `READ_RESOURCE_TOOL` constant — an MCP `Tool` definition matching the pattern used by Claude Code's built-in `read_resource` tool: `(uri, server_name)`.

Some clients provide this tool natively. For other clients, register the schema and wire the handler to route calls to the appropriate MCP Client:

```typescript
import { READ_RESOURCE_TOOL } from "@modelcontextprotocol/ext-skills/client";

// Register with your AI provider (pseudocode)
registerTool(READ_RESOURCE_TOOL, async (params) => {
  const client = getClientForServer(params.server_name);
  return client.readResource({ uri: params.uri });
});
```

See [PR #53](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/53) for the URI scheme discussion and rationale.

## URI Scheme

| Pattern | Description |
|---------|-------------|
| `skill://{name}/SKILL.md` | Skill content (listed resource) |
| `skill://{name}/_manifest` | File manifest with SHA256 hashes (listed resource) |
| `skill://{name}/{+path}` | Supporting file (resource template) |
| `skill://prompt-xml` | XML for system prompt injection (optional) |

## Future Work (TODO)

- Subscription manager for resource change notifications
- File watcher for dynamic skill hot-reload
- Caching layer for skill content
- Multi-server skill aggregation
- Hash verification on client side
- Extended frontmatter metadata fields beyond name/description

## License

Apache-2.0
