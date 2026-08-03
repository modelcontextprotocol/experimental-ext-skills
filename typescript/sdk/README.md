# @modelcontextprotocol/experimental-ext-skills

TypeScript SDK for [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) v1 (Skills Extension) — serves agent skills as `skill://` resources over MCP, with `skills/list` / `skills/get` entry retrieval, per-file digest verification, and optional directory enumeration. Built on the v2 MCP TypeScript SDK (`@modelcontextprotocol/server` / `@modelcontextprotocol/client`).

> **Experimental.** Tracks the draft SEP while it is in review; the protocol surface may change with the SEP.

## Install

```bash
# Server-side
npm install @modelcontextprotocol/experimental-ext-skills @modelcontextprotocol/server

# Client-side
npm install @modelcontextprotocol/experimental-ext-skills @modelcontextprotocol/client
```

## Subpath exports

| Import path | Purpose |
|---|---|
| `@modelcontextprotocol/experimental-ext-skills` | Shared types, protocol method schemas, URI utilities, constants |
| `@modelcontextprotocol/experimental-ext-skills/server` | Server-side: discover skills, register resources + `skills/list` / `skills/get` handlers |
| `@modelcontextprotocol/experimental-ext-skills/client` | Client-side: list/get entries, verified reads, catalogs, directory enumeration |

## Protocol surface (SEP-2640 v1)

Every server declaring the `io.modelcontextprotocol/skills` extension implements two methods:

- **`skills/list`** — paginated enumeration of *skill entries*. Each entry carries the skill's `uri`, its **verbatim** `SKILL.md` frontmatter as JSON, and a complete `resources` manifest: `{uri, digest}` for `SKILL.md` and every supporting file. The listing MAY be empty or partial (large/generated/unenumerable catalogs); hosts MUST NOT treat that as proof a server has no skills. In protocol 2026-07-28+ the result also carries the SEP-2549 list-caching attributes (`ttlMs`, `cacheScope`).
- **`skills/get`** — returns the entry for one skill by the URI of its `SKILL.md`, whether or not it appears in the listing; errors `-32602` for URIs the server does not serve as skills. This is both how unlisted skills get verified and how a host confirms an explicitly referenced URI is a skill (never by inspecting the URI scheme).

One optional method, gated behind the `directoryRead` capability setting:

- **`resources/directory/read`** — `ls`-style, metadata-only, paginated listing of a directory resource's direct children; directories carry `mimeType: "inode/directory"`.

A skill is always retrieved as individually addressable resources via `resources/read` — the SEP defines no packed or bundled retrieval form (archive distribution was removed during core-maintainer review; see the SEP's "Appendix: Deferred Features").

## Server usage

Discover skills from a directory of `SKILL.md` files and serve them:

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  discoverSkills,
  registerSkillResources,
} from "@modelcontextprotocol/experimental-ext-skills/server";

// Recursively scan a directory for SKILL.md files (per-file SHA-256 digests
// are computed here, once).
const skillMap = discoverSkills("./skills");

const server = new McpServer(
  { name: "my-server", version: "1.0.0" },
  { capabilities: { resources: {} } },
);

// Registers the skill resources, the skills/list + skills/get handlers, the
// optional resources/directory/read handler, and declares
// capabilities.extensions["io.modelcontextprotocol/skills"] — all before
// connect(), because capabilities ship in the initialize handshake.
registerSkillResources(server, skillMap, "./skills", {
  template: true,        // catch-all resource template for supporting files
  directoryRead: true,   // implement resources/directory/read + declare the setting
  ttlMs: 60_000,         // SEP-2549 freshness hint on skills/list results
  cacheScope: "public",  // safe only when the catalog has no user-specific data
  // audience defaults to ["assistant"] — skills consumed only by the model;
  // use ["user", "assistant"] for skills also shown in a skill browser UI
});

await server.connect(new StdioServerTransport());
```

`registerSkillResources` declares the extension capability itself (pass `declareCapability: false` and call `declareSkillsExtension(server.server, …)` yourself if you need manual control). Declaring the extension commits the server to `skills/list` and `skills/get`; clients MUST NOT call `resources/directory/read` unless `directoryRead: true` was declared.

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

Per the SEP, the final segment of the skill path MUST equal the frontmatter `name` (the SDK validates this and skips violators), and skills MAY nest: a `SKILL.md` in a descendant directory of another skill is discovered as a skill in its own right, while its files remain ordinary supporting content of the enclosing skill (the enclosing entry's `resources` lists them too).

### What gets registered

- `skill://{skillPath}/SKILL.md` — one listed resource per discovered skill
- `skill://{+skillFilePath}` — catch-all resource template for supporting files (optional, on by default)
- `skills/list` and `skills/get` request handlers (always)
- A `resources/directory/read` handler when `directoryRead: true`

The entry served for each skill is built by `buildSkillEntry(skill)` — exported for servers that assemble their own handlers (`makeSkillsListHandler` / `makeSkillsGetHandler` / `makeDirectoryReadHandler` are exported too).

### Resource annotations

All resources include `annotations` with `audience`, `priority`, and `lastModified` (see [`skill-meta-keys.md`](../../docs/skill-meta-keys.md)):

- **`audience`** defaults to `["assistant"]`. Override globally via options, or per-skill via `SkillMetadata.audience`.
- **`priority`** is set per resource type: 1.0 (SKILL.md), 0.2 (supporting-file catch-all)
- **`lastModified`** uses per-skill mtime for SKILL.md and the most recent mtime across all skills for the catch-all template
- **`size`** is set on all resources except the catch-all template (which varies per request)

### Custom `_meta` per skill

Per [`skill-meta-keys.md`](../../docs/skill-meta-keys.md), most skills do **not** need `_meta` — name, description, version, allowed-tools, and other skill-level semantics belong in frontmatter (the resource body), not duplicated on the resource. The SDK reflects this: it never auto-projects frontmatter into `_meta`. When you need transport-layer metadata that has no frontmatter equivalent, set it on the discovered `SkillMetadata.meta`:

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

## Client usage

### Quick start

Discover skills and build a system prompt catalog in one call:

```typescript
import { discoverAndBuildCatalog } from "@modelcontextprotocol/experimental-ext-skills/client";

const { skills, catalog } = await discoverAndBuildCatalog(client, {
  serverName: "my-skills-server",
});

console.log(`Discovered ${skills.length} skill(s)`);
// `skills` are SkillEntry objects — keep them; they are what reads verify against.
// Inject `catalog` into your agent's system prompt.
```

All options are optional:

- Pass `serverName` when your reader tool takes a `server` parameter (e.g., the bundled `READ_RESOURCE_TOOL`); omit it for host-scoped readers that take only `uri`. The catalog drops the `with server …` clause when omitted.
- Pass `serverInEntries: true` to also inject `<server>` inside every `<skill>` entry. Off by default because per-entry placement is host-implementation guidance, not in SEP-2640. Empirically lifts first-call activation ~33% → ~90% for `(server, uri)` reader tools.
- Pass `instructions: true` to mine the server's `instructions` for skill URIs; each is confirmed via `skills/get` and merged with the listing (deduplicated by URI). Off by default.

### Step by step

```typescript
import {
  serverSupportsSkills,
  serverSupportsDirectoryRead,
  listSkills,
  getSkill,
  readSkill,
  readSkillResource,
  readSkillUri,
  readDirectory,
  walkDirectory,
  skillSummariesFromEntries,
  buildSkillsCatalog,
  buildSkillsSummary,
  verifyDigest,
  READ_RESOURCE_TOOL,
} from "@modelcontextprotocol/experimental-ext-skills/client";

// Gate on the extension declaration (clients only issue skills/* calls
// after seeing it).
if (serverSupportsSkills(client)) {
  // Enumerate entries (paginates to exhaustion; MAY be empty or partial).
  const skills = await listSkills(client);

  // Retrieve one skill's entry by URI — listed or not. This is how a URI
  // from server instructions, another skill, or the user becomes a
  // verifiable entry. Errors -32602 for non-skill URIs.
  const entry = await getSkill(client, "skill://acme/billing/refunds/SKILL.md");

  // Verified SKILL.md read: checks the fetched bytes against the manifest
  // digest AND compares the parsed frontmatter field-by-field with the
  // entry's frontmatter (both host-side MUSTs). Throws on any mismatch.
  const content = await readSkill(client, entry);

  // Verified supporting-file read: the URI must be listed in the entry's
  // `resources` (an unlisted read is a verification failure), and the
  // content is checked against its digest.
  const doc = await readSkillResource(
    client,
    entry,
    "skill://acme/billing/refunds/templates/refund-email-template.md",
  );

  // Directory enumeration (only if the server declared the setting).
  if (serverSupportsDirectoryRead(client)) {
    const { resources } = await readDirectory(client, "skill://acme/billing/refunds");
    const allFiles = await walkDirectory(client, "skill://acme/billing/refunds");
  }

  // Catalog / summary for context injection.
  const summaries = skillSummariesFromEntries(skills);
  const catalog = buildSkillsCatalog(summaries, { toolName: "read_resource", serverName: "my-server" });
  const summary = buildSkillsSummary(summaries);
}

// Baseline: a URI alone is always enough to *read* a skill via
// resources/read, listed or not — pass a digest to verify when you hold one.
const raw = await readSkillUri(client, "skill://acme/billing/refunds/SKILL.md");

// READ_RESOURCE_TOOL — tool schema for model-driven skill loading.
console.log(READ_RESOURCE_TOOL);
```

### Digests: verification and caching

Each entry's `resources` manifest carries a `sha256:{hex}` digest per file, and it serves two distinct purposes:

**1. Verification** — SEP-2640 makes this a **MUST**: when a host retrieves a file listed in a skill's `resources`, it must verify the content against that entry's digest, treat reads of unlisted files within the skill as verification failures, and (for `SKILL.md`) check the parsed frontmatter is identical to the entry's `frontmatter`. `readSkill()` and `readSkillResource()` do all of this by default. A mismatch means the content is not what the entry promised — corrupted, tampered, or stale because the skill changed; recover by calling `getSkill()` for a fresh entry (which, being different, revokes any content-bound approval) and retrying.

Digests are unsigned and come from the same server as the content: a match proves consistency, not trustworthiness. Hosts MUST NOT treat a digest match as a security boundary.

**2. Caching** — compare a fresh entry's digests against stored ones to decide whether cached content is still current, without re-reading files; or fetch, verify, and cache the entire set at approval time and serve every subsequent read from the verified copy:

```typescript
// `cache` is your own Map<uri, digest> from a previous run.
const entry = await getSkill(client, skillUri);
for (const ref of entry.resources ?? []) {
  if (cache.get(ref.uri) === ref.digest) continue; // unchanged — skip refetch
  const doc = await readSkillResource(client, entry, ref.uri);
  cache.set(ref.uri, ref.digest);
  // ... (re)load content
}
```

**Dynamically generated skills** omit `resources` and are unverifiable by construction. `readSkill()` / `readSkillResource()` throw for them by default; pass `{ allowUnverified: true }` to read anyway. Hosts MAY simply decline such skills.

`SKILL.md` is UTF-8, so hashing the received `text` (as UTF-8) matches the server's raw-byte hash exactly. Binary supporting files arrive as base64 `blob`s and are verified over the decoded bytes.

### Scheme-agnostic skill identity

No URI scheme is privileged. A host learns that a resource is a skill from a `skills/list` entry or a `skills/get` answer — never from the URI scheme, `skill://` included. Servers MAY serve skills under any scheme (`github://`, `repo://`, …); the structural constraints (path ends in the skill name, explicit `SKILL.md`) apply regardless, and all the client functions here are scheme-agnostic.

### Server `instructions` as a pointer

A server MAY name specific skill URIs in its `instructions`. `discoverSkills()` / `discoverAndBuildCatalog()` accept `{ instructions: true }` to mine `client.getInstructions()` for `<scheme>://…SKILL.md` URIs; each is confirmed via `skills/get` (the server answers for skills it serves and errors otherwise) and merged with the listing. Off by default — it costs one `skills/get` round-trip per URI mentioned. Pass `extractor` to override the built-in regex when the server uses a non-standard URI convention in prose:

```typescript
const skills = await discoverSkills(client, {
  instructions: true,
  extractor: (text) => JSON.parse(text)["skills"] as string[],
});
```

## URI scheme

```
skill://code-review/SKILL.md                     # single-segment path
skill://acme/billing/refunds/SKILL.md            # multi-segment path
skill://acme/billing/refunds/templates/email.md  # supporting file
skill://acme/billing/refunds                     # directory resource (inode/directory)
```

URI utilities are available from the main import:

```typescript
import { parseSkillUri, buildSkillUri, isSkillContentUri } from "@modelcontextprotocol/experimental-ext-skills";
```

## Related

- [SEP-2640 — Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) -- the spec this implements
- [Skills Over MCP Working Group](https://github.com/modelcontextprotocol/experimental-ext-skills) -- parent repository
- [Agent Skills specification](https://agentskills.io/specification) -- the skill format (frontmatter, directory layout) this transports
- [Server example](../../examples/skills-server/typescript/) -- reference MCP server
- [Client example](../../examples/skills-client/typescript/) -- reference MCP client

## License

Apache-2.0
