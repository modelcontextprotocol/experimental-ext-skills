# @modelcontextprotocol/ext-skills

TypeScript SDK for **SEP-2640 (Skills Extension)** — serving [Agent Skills](https://agentskills.io/) via MCP resources under the `skill://` URI scheme.

Tracks the spec at [modelcontextprotocol/modelcontextprotocol#2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

## Installation

```bash
npm install @modelcontextprotocol/ext-skills
```

Requires `@modelcontextprotocol/sdk` ^1.0.0 as a peer dependency.

## URI scheme

| Pattern | Description |
|---------|-------------|
| `skill://<skillPath>/SKILL.md` | Skill content (exact resource) |
| `skill://<skillPath>/<filePath>` | Supporting file (per-skill resource template) |
| `skill://index.json` | Discovery index of skills (well-known) |

`<skillPath>` may be one segment (`git-workflow`) or nested (`acme/billing/refunds`). Per SEP-2640 §Resource Mapping, the **final segment** of `<skillPath>` MUST equal the skill's frontmatter `name`.

## Quick start

### Server: discover and register

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  SKILLS_EXTENSION,
} from "@modelcontextprotocol/ext-skills/server";

const server = new McpServer(
  { name: "my-skills-server", version: "1.0.0" },
  {
    capabilities: {
      resources: {},
      // SEP-2640 §Capability Declaration
      extensions: { [SKILLS_EXTENSION]: {} },
    },
  },
);

const skillsDir = "./skills";
const skillMap = discoverSkills(skillsDir);
registerSkillResources(server, skillMap, skillsDir);

await server.connect(new StdioServerTransport());
```

### Client: discover and read

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  listSkills,
  readSkillContent,
  readSkillDocument,
  buildSkillsSummary,
} from "@modelcontextprotocol/ext-skills/client";

// Reads skill://index.json when available; falls back to resources/list.
const skills = await listSkills(client);
console.log(buildSkillsSummary(skills));

const content = await readSkillContent(client, "acme/billing/refunds");
const doc = await readSkillDocument(
  client,
  "acme/billing/refunds",
  "templates/email.md",
);
```

## Server API

```typescript
import {
  discoverSkills,
  registerSkillResources,
  registerSkillArchive,
  registerSkillTemplate,
  generateSkillIndex,
  packSkillTarGz,
  SKILL_INDEX_SCHEMA,
  SKILL_META_PREFIX,
  SKILLS_EXTENSION,
} from "@modelcontextprotocol/ext-skills/server";
```

### `discoverSkills(skillsDir)`

Walks `skillsDir` recursively and treats any directory containing `SKILL.md` (case-insensitively) as a skill. Per SEP-2640, skills do not nest: once a `SKILL.md` is found, recursion stops at that subtree. The skill's `skillPath` is the directory's path relative to `skillsDir` (using `/` separators).

Validates that the final path segment matches the frontmatter `name`. Skills that fail this check are skipped with a warning.

Returns `Map<skillPath, SkillMetadata>`.

### `registerSkillResources(server, skillMap, skillsDir, options?)`

For each skill, registers:

- `skill://<skillPath>/SKILL.md` — exact resource. Frontmatter `name` and `description` are mapped to the resource's `name` and `description`. Extra string-valued frontmatter fields are exposed via `_meta` keyed under `io.modelcontextprotocol.skills/`.
- `skill://<skillPath>/{+filePath}` — per-skill resource template for supporting files. Disable with `{ templates: false }`.

Also registers `skill://index.json` (per SEP-2640 §Discovery) listing every discovered skill as a `type: "skill-md"` entry. Disable with `{ index: false }`. Override the index `$schema` URL with `{ indexSchema }`.

### `generateSkillIndex(skillMap, options?)`

Returns the `SkillIndex` object (untyped JSON-ready) for serving at `skill://index.json`. Useful when you want to merge in additional entries (`type: "archive"` or `type: "mcp-resource-template"`).

```typescript
const index = generateSkillIndex(skillMap, {
  extraEntries: [
    {
      type: "mcp-resource-template",
      description: "Per-product documentation skill",
      url: "skill://docs/{product}/SKILL.md",
    },
  ],
});
```

### `registerSkillArchive(server, skill, skillsDir, options?)`

Registers `skill://<skillPath>.tar.gz` as an exact resource that returns a gzip-compressed POSIX USTAR tar of the skill directory. Returns `{ uri, entry, handle }` — pass `entry` through `registerSkillResources({ extraIndexEntries })` so the archive shows up in the discovery index.

```typescript
const archives = [];
registerSkillResources(server, skillMap, skillsDir, {
  extraIndexEntries: () => archives,
});
for (const skill of skillMap.values()) {
  archives.push(registerSkillArchive(server, skill, skillsDir).entry);
}
```

Currently emits `tar.gz` only. SEP-2640 hosts must support `.zip` as well, but server-side a single format is sufficient.

Limitation: file paths within a skill must be ≤ 100 bytes (USTAR `name` field). Skills with long internal paths need a more complete tar library.

### `registerSkillTemplate(server, options)`

Registers an MCP resource template for parameterized skill namespaces (SEP-2640 §Discovery). The same URI template is also added to `skill://index.json` as an `mcp-resource-template` entry — this is what makes the namespace discoverable.

```typescript
const templates = [];
registerSkillResources(server, skillMap, skillsDir, {
  extraIndexEntries: () => templates,
});

templates.push(
  registerSkillTemplate(server, {
    description: "Per-product documentation skill",
    uriTemplate: "skill://docs/{product}/SKILL.md",
    resolve: async ({ variables }) => {
      const product = String(variables.product);
      return {
        contents: [
          {
            uri: `skill://docs/${product}/SKILL.md`,
            mimeType: "text/markdown",
            text: await fetchSkillMarkdown(product),
          },
        ],
      };
    },
    complete: {
      product: (value) => listAvailableProducts().filter((p) => p.startsWith(value)),
    },
  }).entry,
);
```

### `packSkillTarGz(skill, skillsDir)`

Lower-level helper that returns a `Buffer` containing the gzipped tar of a skill directory. Use directly when you want to pre-generate or cache archives instead of regenerating on each read.

## Client API

```typescript
import {
  listSkills,
  readSkillIndex,
  readSkillContent,
  readSkillDocument,
  parseSkillFrontmatter,
  buildSkillsSummary,
  generateSkillsXMLFromSummaries,
  READ_RESOURCE_TOOL,
} from "@modelcontextprotocol/ext-skills/client";
```

### `listSkills(client)`

SEP-2640 §Discovery. Tries `skill://index.json` first; falls back to filtering `resources/list` for `skill://<path>/SKILL.md` URIs. Returns `SkillSummary[]`.

### `readSkillContent(client, skillPath)` / `readSkillDocument(client, skillPath, filePath)`

Thin wrappers over `client.readResource` with the right URI shape.

### `READ_RESOURCE_TOOL`

An MCP `Tool` schema for hosts that need to expose `read_resource` to the model — `(uri, server_name)` pattern. Some hosts (e.g. Claude Code) provide this natively.

## Shared utilities

```typescript
import {
  parseSkillContentUri,
  buildSkillUri,
  buildSkillContentUri,
  extractSkillName,
  isSkillContentUri,
  isSkillIndexUri,
  getMimeType,
  isTextMimeType,
} from "@modelcontextprotocol/ext-skills";

parseSkillContentUri("skill://acme/billing/refunds/SKILL.md");
// → { skillPath: "acme/billing/refunds", name: "refunds" }

buildSkillUri("acme/billing/refunds", "templates/email.md");
// → "skill://acme/billing/refunds/templates/email.md"

extractSkillName("acme/billing/refunds");  // → "refunds"
```

## Future work

- Zip archive distribution (`.zip`) — currently only `.tar.gz` is supported server-side
- Resource subscription helpers
- Hot-reload utilities for skill directories
- Long-path support in the tar packer (PAX or GNU `LongLink` extensions)

## License

Apache-2.0
