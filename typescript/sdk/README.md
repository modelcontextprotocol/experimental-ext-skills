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

// Create server and declare the skills extension (SEP-2640).
// Pass { directoryRead: true } to advertise resources/directory/read.
const server = new McpServer(
  { name: "my-server", version: "1.0.0" },
  { capabilities: { resources: {} } },
);
declareSkillsExtension(server.server, { directoryRead: true });

// Register all skill resources (SKILL.md, index, supporting-file template,
// and the resources/directory/read handler).
registerSkillResources(server, skillMap, "./skills", {
  template: true,        // enable resource template for supporting files
  directoryRead: true,   // implement resources/directory/read (pairs with the declaration above)
  // audience defaults to ["assistant"] — skills consumed only by the model
  // use ["user", "assistant"] for skills also shown in a skill browser UI
});

await server.connect(new StdioServerTransport());
```

> **Directory enumeration is opt-in.** Declaring `directoryRead: true` and
> passing `{ directoryRead: true }` to `registerSkillResources` are a pair:
> the first advertises the capability in the initialize handshake (so it must
> run before `connect()`), the second installs the handler.

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
- `skill://index.json` — discovery index (file skills + archive distributions)
- `skill://{+skillFilePath}` — catch-all resource template for supporting
  files (optional, on by default)
- A `resources/directory/read` handler when `directoryRead: true` (see
  *Directory enumeration* below)

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

- **`priority`** is set per resource type: 1.0 (SKILL.md), 0.9 (archive), 0.8 (index), 0.2 (supporting-file catch-all)
- **`lastModified`** uses per-skill mtime for SKILL.md, archive mtime for archives, and the most recent mtime across all skills for the index
- **`size`** is set on all resources except the catch-all template (which varies per request)

### Directory enumeration

When `directoryRead: true`, the server implements the SEP-2640
`resources/directory/read` method so hosts can enumerate the files under a
skill directory without knowing every URI up front — an `ls`-style,
metadata-only, paginated, non-recursive listing. Directories are identified
by `mimeType: "inode/directory"`.

```typescript
declareSkillsExtension(server.server, { directoryRead: true }); // before connect()
registerSkillResources(server, skillMap, "./skills", { directoryRead: true });
```

The handler is backed by the in-memory skill map (skill paths + scanned
supporting documents), so it covers skills served as individual files.
Archive-distributed skills are opaque to the server and are not walked. On the
client, gate calls with `serverSupportsDirectoryRead(client)` and use
`readDirectory()` / `walkDirectory()` (see *Client usage*).

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

Per SEP-2640, a skill MAY also be distributed as a single packed resource (`.tar.gz` or `.zip`). Pass declarations to `registerSkillResources()`; the SDK reads each archive at startup, registers it as an MCP resource at `skill://<skillPath>.<format>`, and adds an index entry whose `archives` array carries the archive's `url`, `mimeType`, and a SHA-256 `digest`:

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
  readSkill,
  readSkillUri,
  readSkillContent,
  readSkillArchive,
  readSkillDocument,
  buildSkillsCatalog,
  buildSkillsSummary,
  serverSupportsDirectoryRead,
  readDirectory,
  walkDirectory,
  verifyDigest,
  READ_RESOURCE_TOOL,
} from "@modelcontextprotocol/experimental-ext-skills/client";

// Discover skills (index-first with fallback, always returns an array)
// Includes both type: "skill-md" and type: "archive" entries.
const skills = await discoverSkills(client);

// Or read skill://index.json directly (returns null if unavailable). Each
// summary carries name/description (from the entry's verbatim frontmatter),
// uri, and the index `digest`.
const indexSkills = await listSkillsFromIndex(client);

// Enumerate a skill directory (only if the server declared the capability).
if (serverSupportsDirectoryRead(client)) {
  const { resources } = await readDirectory(client, "skill://acme/billing/refunds");
  const allFiles = await walkDirectory(client, "skill://acme/billing/refunds");
}

// Read a discovered skill, verified against the index digest by default
// (SEP-2640: hosts MUST verify retrieved content). Works for both
// type: "skill-md" (returns SKILL.md text) and type: "archive" (returns the
// unpacked files). Throws on a digest mismatch, or if the entry has no digest.
const content = await readSkill(client, skill); // skill: SkillSummary

// Lower-level: read by URI (any scheme). Pass the index digest to verify;
// omit it only when no digest is available (e.g. resources/list discovery).
const raw = await readSkillUri(client, skill.uri, skill.digest);

// Or by skill path (convenience, skill:// scheme only — no digest to verify)
const md = await readSkillContent(client, "acme/billing/refunds");

// Fetch + unpack an archive-distributed skill, verifying its bytes first
const archive = await readSkillArchive(client, "skill://pdf-processing.tar.gz", {
  expectedDigest: skill.digest,
});
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
    // Pass the index digest so the archive bytes are verified before unpacking
    // (or use readSkill(client, summary), which does this for you).
    const archive = await readSkillArchive(client, summary.uri, {
      expectedDigest: summary.digest,
    });
    const skillMd = archive.files.get("SKILL.md")!.toString("utf-8");
    // Other files in archive.files keyed by relative path —
    // identical namespace to skill://<skillPath>/<file-path>
  }
}
```

The host MUST support both `.tar.gz` (`application/gzip`) and `.zip` (`application/zip`); the SDK dispatches on `mimeType` (with URL-suffix fallback). Archive safety is enforced: path traversal, absolute paths, and out-of-tree symlinks are rejected, with bounded total size, per-file size, and entry count to defend against decompression bombs.

### Digest: integrity and caching

Each index entry carries a `sha256:{hex}` `digest` (over the SKILL.md raw bytes; archives carry their own under `archives[].digest`). It serves **two distinct purposes**, and they are different operations:

**1. Integrity / tamper-detection** — SEP-2640 makes this a **MUST**: hosts must verify retrieved content against the advertised digest. The SDK verifies by default in its read path, so the simplest correct call is `readSkill()` with a discovered summary — it checks the content (skill-md) or raw archive bytes against `summary.digest` and throws on mismatch (or if the entry carries no digest):

```typescript
import { readSkill, readSkillUri, verifyDigest } from "@modelcontextprotocol/experimental-ext-skills/client";

// Default-verified read (recommended). skill-md → SKILL.md text; archive → unpacked files.
const content = await readSkill(client, summary);

// Reading by URI verifies when you pass the index digest:
const verified = await readSkillUri(client, summary.uri, summary.digest);

// Or check content you already hold:
if (summary.digest && !verifyDigest(content, summary.digest)) {
  // content was altered in transit or drifted from what the index advertised
}
```

`readSkill()` throws when `summary.digest` is absent, since a conforming index always carries one; pass `{ allowUnverified: true }` to read from a non-conforming server anyway.

`SKILL.md` is UTF-8, so hashing the received `text` (as UTF-8) matches the server's raw-byte hash exactly — a UTF-8 decode→encode round-trip is byte-identical (CRLF, BOM, multibyte all preserved). Only genuinely non-UTF-8 content (disallowed for `SKILL.md`) would differ.

**2. Caching** — this is the digest's headline purpose, and it does **not** hash content. Store each skill's digest from a prior index read; on a later poll, refetch only the (small) index and compare the new digest against the stored one. Equal ⇒ the skill content is unchanged, skip refetching it (skill payloads can be large):

```typescript
// `cache` is your own Map<uri, digest> from a previous run.
const fresh = await listSkillsFromIndex(client) ?? [];
for (const s of fresh) {
  if (s.digest && cache.get(s.uri) === s.digest) continue; // unchanged — skip refetch
  const content = await readSkillContent(client, s.skillPath);
  cache.set(s.uri, s.digest!);
  // ... (re)load content
}
```

The SDK exposes `SkillSummary.digest` for this comparison but doesn't manage a cache store — that belongs to the host. The same compare also surfaces drift (e.g. an agent edited a skill locally) for a `/skills list`-style view.

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
- [Agent Skills specification](https://agentskills.io/specification) -- the skill format (frontmatter, directory layout) this transports
- [Server example](../../examples/skills-server/typescript/) -- reference MCP server
- [Client example](../../examples/skills-client/typescript/) -- reference MCP client

## License

Apache-2.0
