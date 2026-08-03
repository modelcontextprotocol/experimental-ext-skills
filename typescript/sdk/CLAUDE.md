# Skills Extension SDK

## Design philosophy

This SDK implements three layers:

1. **Protocol layer** — Types, method schemas, URI scheme, constants. Maps directly to SEP-2640 v1. Lives in `types.ts`, `skills-methods.ts`, `directory.ts`, `uri.ts`, `mime.ts`.

2. **API layer** — Direct wrappers around single protocol operations. Each function maps to one spec concept: `listSkills()` calls `skills/list` (paginating), `getSkill()` calls `skills/get`, `readSkillUri()` calls `resources/read`, `registerSkillResources()` registers resources and installs the method handlers. Lives in `_client.ts`, `_server.ts`, `resource-extensions.ts`.

3. **Ergonomic layer** — Chains API-layer calls with opinionated defaults. `readSkill()` / `readSkillResource()` bundle the SEP's host-side verification MUSTs; `discoverSkills()` merges the listing with instructions-confirmed entries; `discoverAndBuildCatalog()` chains discovery into catalog building.

The main principle is to **make simple things easy and complex things possible.** The ergonomic layer handles the 80% case; the API layer remains available for full control.

## Protocol surface (SEP-2640 v1)

The extension defines two required methods and one optional method; there is no index resource and no archive distribution (both removed during core-maintainer review — the index in favor of `skills/list`, archives into the SEP's "Appendix: Deferred Features").

- `skills/list` (`skills-methods.ts`) — paginated entry enumeration. Entries are `{uri, frontmatter, resources}`: verbatim frontmatter as JSON, and a **complete** per-file `resources` manifest of `{uri, digest}` pairs including `SKILL.md` itself. Entries are atomic across pages. Results carry the SEP-2549 `ttlMs`/`cacheScope` attributes (server options, defaults `0`/`"private"`). The listing MAY be empty or partial; never proof of absence.
- `skills/get` (`skills-methods.ts`) — one entry by `SKILL.md` URI, listed or not; `-32602` for non-skill URIs. Doubles as the skill-identity confirmation for explicitly referenced URIs (schemes are non-privileged — never infer skill-ness from `skill://`).
- `resources/directory/read` (`directory.ts` schemas/tree; handler in `_server.ts`) — optional, gated behind the `directoryRead` capability setting; metadata-only, non-recursive, paginated; directories are `mimeType: "inode/directory"`; `-32602` for non-directories.

`resources` MAY be omitted only for dynamically generated skills; such skills are unverifiable and the client read path throws unless `allowUnverified` is passed.

## v2 MCP SDK

Built against the v2 TypeScript SDK (`@modelcontextprotocol/server` ^2 peer dep; `@modelcontextprotocol/client` used in tests only — client code stays structural). Key idioms:

- Custom methods register via `lowLevel.setRequestHandler(method, { params, result }, handler)` where params/result are Standard Schemas (zod v4 here) and the handler receives **parsed params**, not the request envelope.
- Errors thrown from handlers use `ProtocolError(ProtocolErrorCode.InvalidParams, msg, data)` (replaces v1 `McpError`).
- Resources register via `server.registerResource(name, uriOrTemplate, config, cb)` — the config argument is mandatory in v2.
- Capabilities declare via `registerCapabilities({ extensions: { "io.modelcontextprotocol/skills": {...} } })`, which merges (so it composes with caller-declared capabilities) and throws after connect.
- Client-side custom requests are `client.request({ method, params }, resultSchema)` — the result schema is **required** for non-spec methods in v2; the wrappers always pass it.
- `integration.test.ts` exercises the real wiring: `McpServer` + `Client` over `InMemoryTransport.createLinkedPair()` (both halves imported from `@modelcontextprotocol/client`; the server half is cast — the pair must come from one package because each bundles private state).

## Capability declaration

`registerSkillResources()` declares `capabilities.extensions["io.modelcontextprotocol/skills"]` itself by default (`declareCapability: true`), with `{directoryRead: true}` when the handler is enabled — one call, before `connect()`. `declareSkillsExtension()` remains exported for manual control (`declareCapability: false`). Declaring the extension commits the server to `skills/list` + `skills/get`; `directoryRead` additionally gates `resources/directory/read`, which clients check via `serverSupportsDirectoryRead()`. Client wrappers gate the skills methods on `serverSupportsSkills()` when the structural client exposes `getServerCapabilities` (unreadable capabilities → permissive, absent extension → throw / empty discovery).

## Verification model (client)

The entry is the verification unit and what user approval content-binds to:

- `readSkill(client, entry)` — digest-verifies the fetched `SKILL.md` against the manifest ref matching `entry.uri`, then enforces the **frontmatter identity check**: parsed YAML frontmatter must deep-equal `entry.frontmatter` (JSON round-tripped before comparison). Any discrepancy is a verification failure.
- `readSkillResource(client, entry, uri)` — enforces the **unlisted-file rule** (a read of a URI not in `resources` is a verification failure equivalent to a digest mismatch) and verifies text (UTF-8 hash) or blob (decoded-bytes hash) content.
- `readSkillUri()` is the unverified baseline (URI alone is always readable); optional digest arg.
- Digests are unsigned server-supplied consistency checks, not a security boundary — mirror the SEP's framing in any docs.

## Nested skills

Nesting is allowed (v1 change): `discoverSkills()` (server, `_server.ts`) collects every `SKILL.md` at any depth as its own skill, and an enclosing skill's `documents` (and therefore its entry `resources`) include nested skills' files — completeness extends to nested content per the SEP. There is no no-nesting enforcement anymore.

## Discovery paths (client)

1. `skills/list` — always (when the extension is declared).
2. Server `instructions` — opt-in (`{ instructions: true }`); mined URIs are confirmed via `skills/get` and merged, deduplicated by URI. Failures are dropped silently (instructions are advisory).

There is no `resources/list` fallback: scanning for `skill://` URIs would infer skill-ness from the scheme, which the SEP forbids.

## `_meta` policy

The SDK never auto-projects frontmatter into resource `_meta`. Per `docs/skill-meta-keys.md`, skill-level semantics belong in frontmatter — the resource content — not duplicated on the resource. `SkillMetadata.meta` is the opt-in surface for transport-layer concerns; the SDK only sets `_meta` when the caller fills this field.

## Defaults policy

Behaviors normatively prescribed by SEP-2640 are on by default. Host-narrative behaviors are opt-in:

| Behavior | Source | Default |
|---|---|---|
| `skills/list` + `skills/get` handlers (server) | SEP-2640 MUST | always registered |
| Capability declaration in `registerSkillResources` | SEP-2640 | on; opt-out via `declareCapability: false` |
| Per-file digests in entry `resources` | SEP-2640 | always emitted |
| Digest verification + frontmatter identity + unlisted-file rule (client) | SEP-2640 MUST | default-on in `readSkill` / `readSkillResource`; `allowUnverified` for manifest-less skills |
| Final-segment-equals-name validation | SEP-2640 | always enforced |
| Skill name `^[a-z0-9-]+$` validation | SEP-2640 + agentskills.io | always enforced |
| Nested skill discovery | SEP-2640 | always on (no-nesting rule removed) |
| `ttlMs` / `cacheScope` on `skills/list` | SEP-2549 via SEP-2640 | emitted; defaults `0` / `"private"` |
| `resources/directory/read` handler | SEP-2640 optional | opt-in (`directoryRead: true`) |
| `instructions` mining (with `skills/get` confirmation) | SEP-2640 pointer | opt-in (`instructions: true`) |
| Custom URI extractor | SDK | opt-in (`extractor`) |
| Per-entry `<server>` in catalog XML | host SKILL.md | opt-in (`serverInEntries: true`) |
| Custom `_meta` per skill | `skill-meta-keys.md` | opt-in (caller fills `meta`) |
| `serverName` in catalog prose wrapper | host SKILL.md | optional (set `serverName`) |
| Catch-all supporting-files template | SDK mechanism | on (delivers SEP-prescribed function) |
| `audience: ["assistant"]` annotation | `skill-meta-keys.md` | default (overridable) |

## Structural typing

`SkillsClient` and `SkillsServer` are structural interfaces, not re-exports of the MCP SDK's concrete classes. This avoids type incompatibilities when consumers have a different version of the MCP SDK installed. The only hard imports from the peer are server-side (`ResourceTemplate`, `ProtocolError`), which is why `@modelcontextprotocol/server` is the sole peer dependency; `directory.ts` and `skills-methods.ts` stay dependency-free so the client subpath needs no MCP package at all.

## Subpath exports

- `experimental-ext-skills` — shared types, method schemas, URI utilities
- `experimental-ext-skills/client` — client-side discovery, verified reading, catalog building
- `experimental-ext-skills/server` — server-side discovery, registration, handler factories

Client and server exports are intentionally separate. Types used by exported functions should be re-exported from the same subpath so users don't need multiple imports.
