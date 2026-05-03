# Skills Extension SDKs

This repo hosts language-specific SDKs for the MCP Skills Extension (SEP-2640). Each SDK lives in its own subdirectory (`typescript/sdk/`, `python/sdk/`, …) with its own build tooling, but they implement the same protocol surface and share the design notes below.

For language-specific notes (build commands, idiomatic patterns, framework integration), see the `CLAUDE.md` inside each SDK directory.

## Design philosophy

Each SDK is structured in three layers:

1. **Protocol layer** — Types, URI scheme, index format, constants. Maps directly to the SEP spec.
2. **API layer** — Direct wrappers around single protocol operations. Each function maps to one spec concept: `listSkillsFromIndex` reads `skill://index.json`, `readSkillUri` calls `resources/read`, `registerSkillResources` registers MCP resources.
3. **Ergonomic layer** — Chains API-layer calls with opinionated defaults and fallback logic. `discoverSkills` tries the index then falls back to `resources/list`. `discoverAndBuildCatalog` chains discovery into catalog building with a sensible `toolName` default.

The principle is **make simple things easy and complex things possible.** The ergonomic layer handles the 80% case; the API layer remains available for full control.

## Scheme agnosticism

Index entries may use any URI scheme (per SEP-2640: a server "MAY instead serve skills under another scheme native to its domain (e.g., `github://...`), provided each skill is listed in `skill://index.json`"). Functions that accept URIs from the index (`readSkillUri`, `discoverSkills`, `buildSkillsCatalog`) are scheme-agnostic. Functions that construct URIs from skill paths (`readSkillContent`, `readSkillDocument`) always produce `skill://` and are documented accordingly.

## Subpath exports

Each SDK exposes three entry points:

- top-level — shared types, URI utilities, MIME utilities, archive utilities
- `/client` — client-side discovery, reading, catalog building
- `/server` — server-side discovery, resource registration

In TypeScript these are `package.json` `exports`; in Python they are submodules (`mcp_experimental_ext_skills.client`, `mcp_experimental_ext_skills.server`). Client and server entry points are intentionally separate. Types used by exported functions should be re-exported from the same entry point so users don't need multiple imports. Server-only types (callback-bearing declarations like `SkillTemplateDeclaration`) live only in the server entry point.

## Cross-language consistency

The SDKs are mirrors of each other — same protocol surface, same layering, same names for the same concepts (allowing for language-idiomatic case differences: `discoverSkills` ↔ `discover_skills`).

When making a behavior change, update each SDK in the same PR or in immediately adjacent PRs. Drift between SDKs is the largest correctness risk — both are reference implementations of the same spec.

When adding a new feature, design it once at the protocol layer (does it match SEP-2640?), then implement in one SDK, then port to the other. Use the ported SDK's tests as the conformance check.
