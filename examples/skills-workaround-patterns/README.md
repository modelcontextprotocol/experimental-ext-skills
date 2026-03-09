# Skills Workaround Patterns

> Companion to the [Skills as Resources](../skills-as-resources/) reference
> implementation, demonstrating how servers can support MCP clients that do
> not yet provide `read_resource` to the model.

## Context

The [Skills as Resources](../skills-as-resources/) example implements the ideal
architecture: a resources-only server that exposes skills via the `skill://` URI
scheme, paired with a client-side SDK that builds context summaries from
`resources/list`. However, most MCP clients today do not provide `read_resource`
as a model-accessible tool, so the model cannot load skill content on demand.

This example shows how a single server can layer **workaround patterns** on top
of the canonical resources approach, so every client gets the best experience
its capabilities allow.

## Patterns

The `load_skill` tool interface is aligned with
[skilljack-mcp](https://github.com/olaservo/skilljack-mcp) — same tool name,
input schema, description format, and annotations.

| # | Pattern | Primitives | Model discovers skills via | Client support needed |
|---|---------|-----------|---------------------------|----------------------|
| 1 | **Server Instructions** (opt-in) | Instructions + Resources | System prompt (auto-injected) | Instructions support |
| 2 | **Skill Tool** (default) | Tools + Resources | `load_skill` tool description with XML catalog | Tool listing (universal) |
| 3 | **MCP Prompts** | Prompts + Resources | Prompt menu (`/skills`, `/skill-{name}`) | Prompts support |

Plus the canonical **Resources Only** path via `skill://` URIs for clients with
`read_resource` support.

### Comparison

| Pattern | Pros | Cons |
|---------|------|------|
| Server Instructions | Clean separation; no tool pollution; always visible | Inflates every conversation; no lazy loading |
| Skill Tool | Works everywhere models see tools; on-demand loading | Description grows with skill count |
| MCP Prompts | Clean MCP-native UX; user-controlled | Not model-controlled; requires user action |
| Resources Only | Clean; cacheable; no workarounds needed | Requires client-side `read_resource` support |

## Running

```bash
cd typescript
npm install
npm run build
npm start [skillsDir]    # defaults to ../sample-skills
```

Or for development:

```bash
npm run dev [skillsDir]
```

### `--use-static-server-instructions`

By default, the skill catalog (names and descriptions) is embedded in the
`load_skill` tool description so the model discovers skills when it reads the tool
list. Pass `--use-static-server-instructions` to place the catalog in the
server's `instructions` field instead — clients that support server instructions
will inject it into the system prompt automatically. The two modes are mutually
exclusive: the catalog appears in one place or the other, never both.

```bash
npm start -- --use-static-server-instructions [skillsDir]
```

Uses the shared [sample-skills](../sample-skills/) directory, which contains
`code-review` and `git-commit-review` skills for testing.

## How It Works

The server performs skill discovery once at startup, then registers all
primitives from the same skill map:

1. **Skill discovery** — `discoverSkills()` scans a directory for `SKILL.md`
   files and parses YAML frontmatter for metadata

2. **Resources** (canonical) — `registerSkillResources()` exposes
   `skill://{name}/SKILL.md` and `skill://{name}/_manifest` resources

3. **Server instructions** (opt-in) — with `--use-static-server-instructions`,
   the `<available_skills>` XML (from `generateSkillsXML()`) is set as the
   server's `instructions` option, injected into the system prompt by
   supporting clients. Tool descriptions are kept minimal in this mode.

4. **`load_skill` tool** (aligned with skilljack-mcp) — by default, description
   embeds the full XML catalog; with `--use-static-server-instructions`,
   description is minimal and defers to server instructions. Calling it with
   a skill name returns the SKILL.md content via `loadSkillContent()`

5. **Prompts** — `/skills` lists all available skills; `/skill-{name}` returns
   the full SKILL.md content as an embedded resource

See [`src/index.ts`](typescript/src/index.ts) for the complete implementation
— it's a single file with clearly labeled sections for each pattern.

## Relationship to the Resources-Only Approach

These patterns are **complements**, not alternatives. A production server can
choose any combination based on its target client ecosystem:

- Resources for clients that support them (canonical path)
- Server instructions (`--use-static-server-instructions`) or tool descriptions (default) for skill discovery — one or the other
- A `load_skill` tool for model-controlled on-demand loading
- Prompts for user-controlled invocation

See the [approaches documentation](../../docs/approaches.md) for the full
design space.
