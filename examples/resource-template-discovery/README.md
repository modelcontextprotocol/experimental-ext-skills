# Resource Template Discovery Prototype

Investigating [#57](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/57): Can MCP resource templates be used for scalable skill discovery?

## Background

The [skills-as-resources reference implementation](../skills-as-resources/) discovers skills via `resources/list`. This works for bounded skill sets but doesn't scale to platforms like GitHub where enumerating all repos isn't feasible.

[Sam Morrow](https://github.com/SamMorrowDrums) (GitHub) built a [proof-of-concept](https://github.com/github/github-mcp-server/pull/2129) that uses resource templates instead:

```
skill://{owner}/{repo}/{skill_name}/SKILL.md    — skill content
skill://{owner}/{repo}/{skill_name}/_manifest   — file manifest with repo:// URIs
```

Clients discover skills by calling `completion/complete` to enumerate available values for each template variable.

## What's Here

### Test Fixture Server (`typescript/src/server.ts`)

A template-only MCP server that mimics the GitHub pattern locally:
- Exposes skills via resource templates (NOT `resources/list`)
- Supports completions for `owner`, `repo`, and `skill_name` variables
- Returns manifests with `file://` URIs (local equivalent of `repo://`)
- Uses the sample skills from `examples/sample-skills/`

### Integration Test (`typescript/integration-test.ts`)

End-to-end test proving the template discovery flow:
1. `listSkillResources()` returns empty (proves the gap)
2. `listSkillTemplates()` finds `skill://` templates
3. `completeTemplateArg()` enumerates skill names
4. `discoverSkillsFromTemplate()` builds skill summaries
5. `loadSkillFromTemplate()` reads content + manifest
6. `resolveManifestFiles()` follows manifest URIs to load files
7. `discoverAllSkillsFromTemplates()` high-level single-call discovery + loading

### SDK Extensions (`typescript/sdk/src/template.ts`)

New client-side functions for template-based discovery — see [the SDK](../../typescript/sdk/).

## Running

```bash
cd typescript
npm install
npm test       # runs integration test (37 assertions)
```

## Related

- [olaservo/mcp-docs-template-discovery](https://github.com/olaservo/mcp-docs-template-discovery) — Same template discovery pattern applied to MCP documentation (non-skills demo)

## Findings

See [docs/experimental-findings.md](../../docs/experimental-findings.md#resource-template-skill-discovery-github-mcp-server-poc) for the full write-up answering all 4 questions from #57.
