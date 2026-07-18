# Node.js Skills-over-MCP example server

A minimal, complete reference implementation of [SEP-2640 (Skills
Extension)](../../docs/sep-draft-skills-extension.md): serves [Agent
Skills](https://agentskills.io/) over MCP using the Resources primitive and
the `skill://` URI scheme.

## What it does

- Discovers skills from a local directory (default: `./skills`; override with
  `SKILLS_DIR`). A skill is any directory containing a `SKILL.md`.
- Parses each `SKILL.md`'s YAML frontmatter (`name`, `description`) with
  [`gray-matter`](https://www.npmjs.com/package/gray-matter).
- Validates the SEP-2640 constraints: the frontmatter `name` must match the
  skill directory's own name, must use only lowercase letters/digits/hyphens,
  and skills must not nest (a `SKILL.md` inside another skill's directory is
  a startup error, not a silent mis-resolution).
- Exposes every file in a skill directory as an MCP resource at
  `skill://<skill-path>/<file-path>`, served via standard `resources/list`
  and `resources/read`.
- Exposes `skill://index.json`, the well-known discovery index.
- Declares the `io.modelcontextprotocol/skills` extension capability in its
  `initialize` response (see the note in `server.js` about the current SDK's
  typing gap for this).

Scope: text-based skill files. Binary assets would use the `blob`
(base64) resource-content field instead of `text` — not implemented here, to
keep the example focused on the parts of the spec every skill server needs.

## Running it

```bash
npm install
npm start
```

This starts an MCP server over stdio. Connect any MCP client (or the sample
`skills/` in this directory, containing `git-workflow` and `pdf-processing`
— the same examples used in the SEP's own resource-mapping table).

Point it at a different skill directory:

```bash
SKILLS_DIR=/path/to/your/skills npm start
```

## Trying it with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector node server.js
```

Then, in the Inspector UI: `resources/list` shows `skill://index.json` plus
every skill file; `resources/read` on `skill://git-workflow/SKILL.md` returns
the skill's content; `resources/read` on
`skill://pdf-processing/references/FORMS.md` demonstrates a nested reference
file resolving correctly.

## Adding your own skills

Add a directory under `skills/` whose name matches the `name` field in its
`SKILL.md` frontmatter:

```
skills/
  my-skill/
    SKILL.md          # required: name + description frontmatter
    references/
      GUIDE.md         # optional: any additional files
```

No server code changes needed — skills are discovered at startup.
