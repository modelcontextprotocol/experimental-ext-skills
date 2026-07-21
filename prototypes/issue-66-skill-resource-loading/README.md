# Issue #66 prototype: client-side skill:// resource loading

Personal exploration of [issue #66](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/66)
("Prototype skill resource loading in a major open-source client"), built
against the design in the now-**merged** [`docs/sep-draft-skills-extension.md`](../../docs/sep-draft-skills-extension.md)
(SEP-2640), not the older custom-methods approach #66 originally referenced.

**Scope note:** this is a standalone Node.js client/server pair, not an
integration into a major host (VS Code, Claude Code, etc.) — #66's stated
bar. It exercises the discovery + loading flow the spec defines, as a local
test bed, not a submission toward closing #66 as scoped.

## What's here

- `server.mjs` — a from-scratch MCP server (low-level `Server`, stdio
  transport) serving three skills from `./skills`, implementing the
  SEP-2640 resource mapping directly (no server-side SDK helpers for
  skills exist yet in `@modelcontextprotocol/sdk`).
- `client.mjs` — a client that connects to it and walks through discovery
  and loading step by step, printing what it finds at each stage.
- `skills/` — three fixture skills exercising different corners of the spec:
  - `git-workflow` — flat skill-path (`skill://git-workflow/SKILL.md`).
  - `acme/billing/refunds` — nested skill-path with a sub-resource
    (`templates/email.md`), the same example the SEP itself uses to justify
    decoupling the path from the skill name.
  - `hidden-skill` — deliberately excluded from **both** `resources/list`
    and `skill://index.json`, to test the spec's baseline claim that a
    `skill://` URI must remain directly readable via `resources/read` even
    when no enumeration mechanism ever surfaced it.

## Running it

```sh
npm install
npm run demo    # runs client.mjs, which spawns server.mjs itself
```

Requires Node 20+ (the `@modelcontextprotocol/sdk` client/server APIs).

## What it demonstrates

1. **Capability declaration** — reads `extensions["io.modelcontextprotocol/skills"]`
   off the initialize result.
2. **Discovery via `resources/list`** — `skill://` resources appear as
   ordinary resources; no protocol changes needed.
3. **Discovery via `skill://index.json`** — the well-known enumeration
   resource, parsed like the [Agent Skills discovery index](https://agentskills.io/well-known-uri)
   it mirrors.
4. **Loading via `resources/read`** — fetching each indexed skill's
   `SKILL.md`.
5. **Relative-reference resolution** — `refunds/SKILL.md` links to
   `templates/email.md`; the client resolves that relative to the skill's
   root (not the `skill://` scheme root) and reads it, per spec §Reading.
6. **Baseline direct-read** — `hidden-skill` is read successfully by URI
   despite never appearing in `resources/list` or the index, confirming
   "hosts MUST NOT treat empty/absent enumeration as proof of absence."
7. **Simulated context injection** — since there's no live LLM in this
   prototype, it prints the block of `name`/`description` pairs a real host
   would load into model context, standing in for the "inject" step.

## URI patterns used

Exactly the SEP-2640 convention: `skill://<skill-path>/<file-path>`, with
`SKILL.md` always explicit and the final `<skill-path>` segment required to
equal the frontmatter `name` (`server.mjs`'s `loadSkills()` asserts this and
throws if violated). Both flat (`git-workflow`) and nested
(`acme/billing/refunds`) paths are exercised.

## URI-based vs. metadata-based identification (issue #54)

This prototype identifies skill resources purely by the `skill://` scheme
prefix plus the well-known `index.json` resource — no custom `_meta` keys
are read for identification. Observed trade-off, matching the SEP's own
rationale: scheme-based identification needs zero extra fields and works
immediately for any client that recognizes the prefix, but it can't carry
structured metadata (tags, versioning, provenance) without either parsing
frontmatter after the fact or layering `_meta` on top anyway. The SEP
threads this by allowing servers to layer `_meta` under an
`io.modelcontextprotocol.skills/` prefix for anything beyond `name`/
`description` — which this prototype doesn't need, since its three fixture
skills have nothing more to say.

## A discrepancy worth flagging

The local copy of the SEP text says the `skill://index.json` `digest` field
is "omitted (integrity is the transport's concern...)" — but [PR #96](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/96)
in this same repo is titled "reinstate `digest` field in `skill://index.json`."
This prototype follows the local doc text (no `digest` field) since that's
what's checked into this repo, but the two are inconsistent and whoever
looks at this next should check which is current before relying on either.

See [`../../docs/experimental-findings.md`](../../docs/experimental-findings.md#prototype-skill-resource-discovery-and-loading-issue-66)
for the write-up of this exercise.
