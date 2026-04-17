# Skills Extension SDK

## Design philosophy

This SDK implements three layers:

1. **Protocol layer** — Types, URI scheme, index format, constants. Maps directly to the SEP spec. Lives in `types.ts`, `uri.ts`, `mime.ts`.

2. **API layer** — Direct wrappers around single protocol operations. Each function maps to one spec concept: `listSkillsFromIndex()` reads `skill://index.json`, `readSkillUri()` calls `resources/read`, `registerSkillResources()` registers MCP resources. Lives in `_client.ts`, `_server.ts`, `resource-extensions.ts`.

3. **Ergonomic layer** — Chains API-layer calls with opinionated defaults and fallback logic. `discoverSkills()` tries index then falls back to `resources/list`. `discoverAndBuildCatalog()` chains discovery into catalog building with a sensible `toolName` default.

The main principle is to **make simple things easy and complex things possible.** The ergonomic layer handles the 80% case; the API layer remains available for full control.

## Scheme agnosticism

Index entries may use any URI scheme. Functions that accept URIs from the index (`readSkillUri`, `discoverSkills`, `buildSkillsCatalog`) are scheme-agnostic. Functions that construct URIs from skill paths (`readSkillContent`, `readSkillManifest`, `readSkillDocument`) always produce `skill://` and are documented accordingly.

## Structural typing

`SkillsClient` and `SkillsServer` are structural interfaces, not re-exports of the MCP SDK's concrete classes. This avoids type incompatibilities when consumers have a different version of `@modelcontextprotocol/sdk` installed.

## Subpath exports

- `ext-skills` — shared types, URI utilities
- `ext-skills/client` — client-side discovery, reading, catalog building
- `ext-skills/server` — server-side discovery, resource registration
- `ext-skills/well-known` — HTTP bridge for well-known URI fetching

Client and server exports are intentionally separate. Types used by exported functions should be re-exported from the same subpath so users don't need multiple imports.
