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

// Register all skill resources (SKILL.md, index, supporting-file template)
registerSkillResources(server, skillMap, "./skills", {
  template: true,    // enable resource template for supporting files
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

The server registers, per the SEP:

- `skill://{skillPath}/SKILL.md` — one per discovered skill
- `skill://index.json` — discovery index (all skills + archives + templates)
- One MCP `ResourceTemplate` per `templates[]` declaration with a `read`
  handler — readable as `resources/read` with completion wired to the MCP
  completion API (see *Resource templates* below)
- `skill://{+skillFilePath}` — catch-all resource template for supporting
  files (optional, on by default; registered last so specific patterns above
  match first)

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

- **`priority`** is set per resource type: 1.0 (SKILL.md), 0.9 (archive), 0.8 (index), 0.6 (declared resource templates), 0.2 (supporting-file catch-all)
- **`lastModified`** uses per-skill mtime for SKILL.md, archive mtime for archives, and the most recent mtime across all skills for aggregate resources (index, templates)
- **`size`** is set on all resources except the templates (which vary per request)

### Resource templates

Servers with parameterized skill namespaces can declare `mcp-resource-template` entries. The declaration drives three things at once: the entry in `skill://index.json`, an MCP `ResourceTemplate` registered for the URI pattern (so resolved URIs are readable via `resources/read`), and per-variable completions wired to the MCP completion API.

```typescript
registerSkillResources(server, skillMap, "./skills", {
  templates: [
    {
      name: "docs",
      description: "Product documentation",
      uriTemplate: "skill://docs/{product}/SKILL.md",
      // Wire {product} to the MCP completion API.
      complete: {
        product: (value) =>
          ["widget-api", "gizmo-api", "gadget-api"].filter((p) =>
            p.startsWith(value),
          ),
      },
      // Read handler invoked when a host calls resources/read against a
      // matching URI. Receives the resolved URI and bound variables.
      read: async (_uri, vars) => {
        const md = await loadDocsForProduct(vars.product);
        return { text: md, mimeType: "text/markdown" };
      },
    },
  ],
});
```

If `read` is omitted, the template is enumerated only — useful for index-only declarations that point at an out-of-band resolution mechanism.

### Custom `_meta` per skill

Per [`skill-meta-keys.md`](../../docs/skill-meta-keys.md), most skills do **not** need `_meta` — name, description, version, allowed-tools, and other skill-level semantics belong in frontmatter (the resource body), not duplicated on the resource. The SDK reflects this: it never auto-projects frontmatter into `_meta`. When you need transport-layer metadata that has no frontmatter equivalent (provenance the host needs without reading content, content-integrity hashes, etc.), set it on the discovered `SkillMetadata.meta`:

```typescript
const skillMap = discoverSkills("./skills");
const refunds = skillMap.get("acme/billing/refunds");
if (refunds) {
  refunds.meta = {
    "io.modelcontextprotocol.skills/provenance": "acme/billing-team",
  };
}
registerSkillResources(server, skillMap, "./skills");
```

The SDK passes `meta` through to the SKILL.md resource's `_meta` field; keys SHOULD use the `io.modelcontextprotocol.skills/` reverse-domain prefix.

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

`discoverAndBuildCatalog()` handles the recommended discovery strategy (try `skill://index.json` first, fall back to `resources/list`) and builds an XML catalog with behavioral instructions for the model. All options are optional:

- Pass `serverName` when your reader tool takes a `server` parameter (e.g., the bundled `READ_RESOURCE_TOOL`); omit it for host-scoped readers that take only `uri`. The catalog drops the `with server …` clause when omitted.
- Pass `serverInEntries: true` to also inject `<server>` inside every `<skill>` entry. Off by default because per-entry placement is host-implementation guidance from the host SKILL.md, not in SEP-2640. Empirically lifts first-call activation ~33% → ~90% for `(server, uri)` reader tools.
- Pass `instructions: true` to enable the SEP's third discovery path (mining server `instructions` for skill URIs). Off by default.

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

### Server `instructions` as a discovery path

The SEP lists three discovery paths feeding the host's catalog: `skill://index.json`, server `instructions`, and direct `resources/read`. `discoverSkills()` and `discoverAndBuildCatalog()` accept `{ instructions: true }` to opt into mining `client.getInstructions()` for `<scheme>://...SKILL.md` URIs and merging them with index hits (deduplicated by URI). This is **off by default** — most servers don't name skill URIs in their instructions, and turning it on costs one `resources/read` round-trip per URI mentioned. Turn it on for documentation-server / gateway / template-only servers that don't enumerate via `index.json`.

```typescript
const skills = await discoverSkills(client, { instructions: true });
```

Pass `extractor` to override the built-in regex when the server uses a non-standard URI convention in its instructions text (URIs inside code fences with custom syntax, JSON-encoded URI lists, etc.):

```typescript
const skills = await discoverSkills(client, {
  instructions: true,
  extractor: (text) => JSON.parse(text)["skills"] as string[],
});
```

Lower-level helpers are also exported:

```typescript
import {
  extractSkillUrisFromInstructions,
  listSkillsFromInstructions,
} from "@modelcontextprotocol/experimental-ext-skills/client";

const uris = extractSkillUrisFromInstructions(client.getInstructions());
const fromInstructions = await listSkillsFromInstructions(
  client,
  client.getInstructions() ?? "",
  { extractor: myExtractor }, // optional
);
```

### Per-entry `<server>` in the system-prompt catalog

`buildSkillsCatalog(skills, { toolName, serverName, serverInEntries: true })` injects `<server>{name}</server>` into every `<skill>` entry. This puts the server name visibly next to each URI the model might pass to a `(server, uri)` reader tool. The host SKILL.md flags this as the way to keep first-call activation reliability ~90% (vs ~33% without).

`serverInEntries` defaults to **false** because per-entry placement isn't in SEP-2640 — only the empirical activation guidance from the host SKILL.md. Hosts that use `(server, uri)` reader tools (like the bundled `READ_RESOURCE_TOOL`) should opt in; hosts whose readers are already scoped to one server can leave it off. The wrapper-level mention of `serverName` in the prose instructions remains independent of this flag.

## URI scheme

```
skill://code-review/SKILL.md                     # single-segment path
skill://acme/billing/refunds/SKILL.md            # multi-segment path
skill://acme/billing/refunds/templates/email.md  # supporting file
skill://docs/{product}/SKILL.md                   # parameterized template
skill://pdf-processing.tar.gz                     # archive distribution
skill://index.json                                # discovery index
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
