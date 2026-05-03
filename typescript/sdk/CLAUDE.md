# Skills Extension SDK

## Design philosophy

This SDK implements three layers:

1. **Protocol layer** — Types, URI scheme, index format, constants. Maps directly to the SEP spec. Lives in `types.ts`, `uri.ts`, `mime.ts`.

2. **API layer** — Direct wrappers around single protocol operations. Each function maps to one spec concept: `listSkillsFromIndex()` reads `skill://index.json`, `readSkillUri()` calls `resources/read`, `registerSkillResources()` registers MCP resources. Lives in `_client.ts`, `_server.ts`, `resource-extensions.ts`.

3. **Ergonomic layer** — Chains API-layer calls with opinionated defaults and fallback logic. `discoverSkills()` tries index then falls back to `resources/list`. `discoverAndBuildCatalog()` chains discovery into catalog building with a sensible `toolName` default.

The main principle is to **make simple things easy and complex things possible.** The ergonomic layer handles the 80% case; the API layer remains available for full control.

## Scheme agnosticism

Index entries may use any URI scheme. Functions that accept URIs from the index (`readSkillUri`, `discoverSkills`, `buildSkillsCatalog`) are scheme-agnostic. Functions that construct URIs from skill paths (`readSkillContent`, `readSkillDocument`) always produce `skill://` and are documented accordingly.

Per SEP-2640, the structural constraints on `<skill-path>` apply *regardless of scheme*. `extractSkillPathFromUri()` extracts the path between `<scheme>://` and `/SKILL.md` for any URI; `listSkillsFromIndex()` and `listSkillsFromInstructions()` use it to populate `SkillSummary.skillPath`, falling back to the entry's `name` only when the URL doesn't match `<scheme>://<path>/SKILL.md`. The model-facing `skillPath` is therefore the SEP-defined locator across schemes.

## Resource-template registration order

`registerSkillResources()` registers user-declared templates from `templates[]` before the catch-all `skill://{+skillFilePath}`. This matters because the McpServer matches templates in registration order (`mcp.js` iterates `Object.values(_registeredResourceTemplates)` and returns the first match). The catch-all uses RFC 6570 reserved expansion (`{+...}`), so it would otherwise swallow specific patterns like `skill://docs/{product}/SKILL.md`.

A `SkillTemplateDeclaration` without a `read` handler is enumerated in `skill://index.json` but **not** registered as a `ResourceTemplate` — useful for index-only declarations that point at an out-of-band resolution mechanism. Setting `complete` without `read` is a configuration error (the completion callbacks would never be wired) and `registerSkillResources` throws on this combination.

## `_meta` policy

The SDK never auto-projects frontmatter into resource `_meta`. Per `docs/skill-meta-keys.md`, skill-level semantics (version, allowed-tools, invocation, etc.) belong in frontmatter — the resource content — not duplicated on the resource. `SkillMetadata.meta` is the opt-in surface for transport-layer concerns that have no frontmatter equivalent (provenance, content-integrity hashes). The SDK only sets `_meta` when the caller fills this field.

## Discovery paths

`discoverSkills()` covers the SEP's three discovery paths, but mines `instructions` only on opt-in:

1. `skill://index.json` (authoritative, scheme-agnostic) — primary, always tried
2. Server `instructions` (URIs the server names) — opt in with `{ instructions: true }`; read via `client.getInstructions()` when the structural `SkillsClient` exposes it; merged with index entries deduplicated by URI. Pass `{ extractor }` to override the built-in regex.
3. `resources/list` (skill:// scheme only) — fallback when both above are empty

The default is **opt-out** for `instructions` mining because most servers don't name skill URIs there, and the per-URI read round-trips would be wasted. Hosts that want the third path enable it explicitly per the SEP narrative.

Index hits don't suppress instructions mining when opted in; the two are merged. This handles servers that publish a base catalog *and* call out specific URIs in their instructions.

## Per-entry `<server>` in catalog

`generateSkillsXMLFromSummaries(skills, { serverName, serverInEntries: true })` injects `<server>` inside each `<skill>`. **Off by default**: per-entry placement is host-narrative from the host SKILL.md, not SEP-2640, so we don't impose it on every consumer. Hosts using `(server, uri)` reader tools opt in for the activation-reliability lift; hosts whose readers are server-scoped leave it off.

The wrapper-level mention of `serverName` in `buildSkillsCatalog`'s prose is a separate concern, controlled by `serverName` presence alone.

## Defaults policy

Behaviors normatively prescribed by SEP-2640 are on by default. Behaviors that come from the WIP host/server SKILL.md narrative or related WG docs (`skill-meta-keys.md`) but aren't in SEP-2640 are opt-in:

| Behavior | Source | Default |
|---|---|---|
| `skill://index.json` discovery (client) | SEP-2640 | always on |
| `skill://index.json` registration (server) | SEP-2640 SHOULD | on; opt-out via `index: false` for unenumerable catalogs |
| `resources/list` fallback | SEP-2640 | always on |
| Final-segment-equals-name validation | SEP-2640 | always enforced |
| Skill name `^[a-z0-9-]+$` validation | SEP-2640 + agentskills.io | always enforced |
| Archive safety | SEP-2640 | always enforced |
| `instructions` discovery path | host SKILL.md | opt-in (`instructions: true`) |
| Custom URI extractor | SDK | opt-in (`extractor`) |
| Per-entry `<server>` in catalog XML | host SKILL.md | opt-in (`serverInEntries: true`) |
| Custom `_meta` per skill | `skill-meta-keys.md` | opt-in (caller fills `meta`) |
| `serverName` in catalog prose wrapper | host SKILL.md | optional (set `serverName`) |
| No-nesting constraint | PR #70 | always enforced (correctness) |
| Catch-all supporting-files template | SDK mechanism | on (delivers SEP-prescribed function) |
| `audience: ["assistant"]` annotation | `skill-meta-keys.md` | default (overridable) |

## Structural typing

`SkillsClient` and `SkillsServer` are structural interfaces, not re-exports of the MCP SDK's concrete classes. This avoids type incompatibilities when consumers have a different version of `@modelcontextprotocol/sdk` installed.

## Subpath exports

- `experimental-ext-skills` — shared types, URI utilities
- `experimental-ext-skills/client` — client-side discovery, reading, catalog building
- `experimental-ext-skills/server` — server-side discovery, resource registration

Client and server exports are intentionally separate. Types used by exported functions should be re-exported from the same subpath so users don't need multiple imports.
