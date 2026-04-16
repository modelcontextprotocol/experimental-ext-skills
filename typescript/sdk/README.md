# @modelcontextprotocol/ext-skills

TypeScript SDK for the [Skills Extension SEP](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69) — serves agent skills as `skill://` resources over MCP.

> **Experimental.** Published as [`@olaservo/ext-skills`](https://www.npmjs.com/package/@olaservo/ext-skills) for testing while the spec is in draft.

## Install

```bash
npm install @olaservo/ext-skills @modelcontextprotocol/sdk
```

## Subpath exports

| Import path | Purpose |
|---|---|
| `@olaservo/ext-skills` | Shared types, URI utilities, constants |
| `@olaservo/ext-skills/server` | Server-side: discover skills, register MCP resources |
| `@olaservo/ext-skills/client` | Client-side: list skills, read content, build summaries |
| `@olaservo/ext-skills/well-known` | HTTP bridge: fetch skills from `/.well-known/agent-skills/` |

## Server usage

Discover skills from a directory of `SKILL.md` files and serve them as MCP resources:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  declareSkillsExtension,
} from "@olaservo/ext-skills/server";

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
  template: true,   // enable resource template for supporting files
  promptXml: true,   // enable skill://prompt-xml convenience resource
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

### Resource templates in the index

Servers with parameterized skill namespaces can include `mcp-resource-template` entries in the discovery index:

```typescript
import { generateSkillIndex } from "@olaservo/ext-skills/server";

const index = generateSkillIndex(skillMap, [
  {
    name: "docs",
    description: "Product documentation",
    uriTemplate: "skill://docs/{product}/SKILL.md",
  },
]);
```

## Client usage

Discover and read skills from a connected MCP server:

```typescript
import {
  listSkillsFromIndex,
  listSkillTemplatesFromIndex,
  readSkillContent,
  readSkillManifest,
  readSkillDocument,
  buildSkillsSummary,
  READ_RESOURCE_TOOL,
} from "@olaservo/ext-skills/client";

// Discover skills via skill://index.json
const skills = await listSkillsFromIndex(client);

// Discover resource template entries
const templates = await listSkillTemplatesFromIndex(client);

// Read a skill's content
const content = await readSkillContent(client, "acme/billing/refunds");

// Read file manifest (SHA-256 hashes for each file)
const manifest = await readSkillManifest(client, "code-review");

// Read a supporting file
const doc = await readSkillDocument(client, "acme/billing/refunds", "templates/refund-email-template.md");

// Build a plain-text summary for context injection
const summary = buildSkillsSummary(skills);

// READ_RESOURCE_TOOL — tool schema for model-driven skill loading
// Hosts expose this so the model can call read_resource(server, uri)
console.log(READ_RESOURCE_TOOL);
```

## Well-known HTTP bridge

The bridge connects HTTP-based skill publishing to MCP-based skill serving:

```mermaid
flowchart TD
    subgraph HTTP["HTTP Discovery (install time)"]
        H1["GET /.well-known/\nagent-skills/index.json"] --> H2["Validate $schema,\nparse entries"]
        H2 --> H3["Fetch each skill artifact"]
        H3 --> H4["Verify SHA-256 digest"]
        H4 --> H5["Cache locally with digest"]
    end

    subgraph MCP["MCP Runtime (conversation time)"]
        M1["Register cached skills\nas skill:// resources"] --> M2["Load frontmatter\n(name, description)\ninto model context"]
        M2 --> M3["Model calls read_resource\n(server, skill://name/SKILL.md)"]
        M3 --> M4["Host serves\nfrom local cache"]
        M4 --> M5["Full SKILL.md\nin context"]
    end

    H5 -- "BRIDGE" --> M1

    subgraph Updates["Ongoing Updates"]
        U1["TTL expires on\nindex cache"] --> U2["Re-fetch index\nover HTTP"]
        U2 --> U3["Compare digests\nto cached values"]
        U3 --> U4["Re-download\nchanged skills only"]
        U4 --> U5["Update local cache\nand MCP resources"]
        U5 --> U6["Fire notifications/\nresources/updated"]
    end
```

Fetch skills published at `/.well-known/agent-skills/index.json` and cache them locally for serving over MCP:

```typescript
import { fetchFromWellKnown, refreshFromWellKnown } from "@olaservo/ext-skills/well-known";
import { discoverSkills, registerSkillResources } from "@olaservo/ext-skills/server";

// Fetch skills from a domain and cache to a local directory
const result = await fetchFromWellKnown({
  domain: "example.com",
  cacheDir: "./cache/example.com",
});

// result.skills   — fetched skills [{name, skillPath, cached}]
// result.skipped  — entries skipped (templates, unknown types)
// result.errors   — fetch/verification failures

// Feed the cache directory into the existing server pipeline
const skillMap = discoverSkills("./cache/example.com");
registerSkillResources(server, skillMap, "./cache/example.com");

// On subsequent calls, use refreshFromWellKnown to skip unchanged skills
const refresh = await refreshFromWellKnown({
  domain: "example.com",
  cacheDir: "./cache/example.com",
});
// refresh.skills.filter(s => !s.cached) — only changed skills
```

The bridge supports:
- **skill-md** entries: downloads `SKILL.md` directly
- **archive** entries: downloads and extracts `.tar.gz` bundles
- **Digest verification**: SHA-256 integrity checks against the `digest` field
- **Digest caching**: skips re-downloading unchanged skills on refresh
- **URL resolution**: relative, path-absolute, and absolute URLs per RFC 3986

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
import { parseSkillUri, buildSkillUri, isSkillContentUri } from "@olaservo/ext-skills";
```

## Related

- [Skills Extension SEP (PR #69)](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69) -- the spec this implements
- [Skills Over MCP Interest Group](https://github.com/modelcontextprotocol/experimental-ext-skills) -- parent repository
- [Agent Skills well-known URI spec](https://github.com/agentskills/agentskills/pull/254) -- HTTP discovery spec the bridge targets
- [Server example](../../examples/skills-server/typescript/) -- reference MCP server
- [Client example](../../examples/skills-client/typescript/) -- reference MCP client

## License

Apache-2.0
