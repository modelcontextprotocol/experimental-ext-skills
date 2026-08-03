# Skills Extension SEP — Reference Examples

End-to-end TypeScript reference for [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) v1 (Skills Extension), exercising every normative surface in the SEP against the bundled SDK, built on the v2 MCP TypeScript SDK (`@modelcontextprotocol/server` / `@modelcontextprotocol/client`).

## Layout

```
examples/
├── sample-skills/                  ← individually-served skills (5 entries)
│   ├── code-review/
│   │   ├── SKILL.md
│   │   └── references/REFERENCE.md
│   ├── git-commit-review/SKILL.md
│   ├── pdf-processing/
│   │   ├── SKILL.md
│   │   └── references/FORMS.md
│   └── acme/
│       ├── onboarding/SKILL.md
│       └── billing/refunds/
│           ├── SKILL.md
│           └── templates/refund-email-template.md
│
├── skills-server/typescript/       ← MCP server using @modelcontextprotocol/experimental-ext-skills/server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts                ← discovers, registers, declares capability
│
└── skills-client/typescript/       ← MCP client using @modelcontextprotocol/experimental-ext-skills/client
    ├── package.json
    ├── tsconfig.json
    └── src/index.ts                ← walks every client-side surface
```

## What it demonstrates

| SEP feature | Server | Client |
|---|---|---|
| Capability declaration `io.modelcontextprotocol/skills` (`directoryRead: true`) | declared by `registerSkillResources()` | `serverSupportsSkills()` / `serverSupportsDirectoryRead()` |
| `skill://` scheme + multi-segment paths | 5 file skills, 1 multi-segment (`acme/billing/refunds`) | parses each URI |
| `skills/list` (verbatim frontmatter, per-file `resources` manifest, `ttlMs`/`cacheScope`) | handler installed by `registerSkillResources()` | `listSkills()` |
| `skills/get` (single-entry retrieval, `-32602` for non-skills) | handler installed by `registerSkillResources()` | `getSkill()` |
| Digest verification + frontmatter identity check | `sha256:` digests computed per file at discovery | `readSkill()` |
| Unlisted-file reads are verification failures | `resources` manifest is complete | `readSkillResource()` |
| `resources/directory/read` (`inode/directory`) | handler installed via `directoryRead: true` | `readDirectory()` / `walkDirectory()` |
| Pointer from server instructions | `instructions` names a skill URI | `extractSkillUrisFromInstructions()` + `skills/get` confirmation |
| Supporting-file flow | catch-all template `skill://{+skillFilePath}` | `readSkillResource()` |
| `read_resource` tool schema | n/a (host concern) | `READ_RESOURCE_TOOL` exported |

Archive distribution is gone: SEP-2640 v1 removed it during core-maintainer review (host-side unpacking is an attack surface disproportionate to the benefit, and two ways to serve one skill breaks the flat compatibility floor). A skill is always retrieved as individually addressable resources — `pdf-processing`, formerly the archive demo, is now an ordinary file skill.

## Run it

```bash
# Build the SDK first (workspace dep)
cd typescript/sdk
npm install
npm run build

# Build the example server
cd ../../examples/skills-server/typescript
npm install
npm run build

# Build and run the example client (it spawns the server via stdio)
cd ../../skills-client/typescript
npm install
npm run build
npm start
```

The client output walks through its sections, each demonstrating one SEP surface — capability declaration, `skills/list` enumeration, `skills/get` retrieval, verified reads (digest + frontmatter identity), the unlisted-file rule, `resources/directory/read` enumeration, instructions confirmation, and the system-prompt catalog.
