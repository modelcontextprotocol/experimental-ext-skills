---
name: implement-skills-server
description: This skill should be used when the user asks to "add skills to my MCP server", "implement the skills SEP on the server side", "expose agent skills over MCP", "serve SKILL.md files as resources", "add skill:// URIs to my server", "build a skill index.json for MCP", or needs guidance on serving Agent Skills via MCP resources per the experimental Skills-over-MCP SEP. Covers URI scheme choices, skill://index.json enumeration, per-file resource exposure, server instructions that point at skills, and update/subscription patterns.
---

# Implementing Skills-over-MCP in an MCP Server

> Skills Extension SEP draft: [modelcontextprotocol/experimental-ext-skills#69](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69).
> Note that this link will change in future versions.

---

Three concerns determine how an MCP server exposes skills: what URI scheme and structure to use, how to make skills discoverable, and how to distribute multi-file skills. Most authors can accept defaults on all three.  This section covers when and why to deviate.

### URI structure

Skills are exposed as MCP resources. Servers SHOULD use the `skill://` URI scheme, under which each file in a skill directory is addressable as:

`skill://<skill-path>/<file-path>`

The final segment of `<skill-path>` MUST match the skill's `name` as declared in its `SKILL.md` frontmatter. Preceding segments are a server-chosen organizational prefix — use them if the server has meaningful hierarchy (by team, product, domain, or version), omit them for flat catalogs.

| Server shape | Example URI |
|---|---|
| Single flat catalog | `skill://git-workflow/SKILL.md` |
| Organizational hierarchy | `skill://acme/billing/refunds/SKILL.md` |
| Per-product documentation | `skill://docs/widget-api/SKILL.md` |
Servers MAY serve skills under a domain-native scheme (`github://owner/repo/skills/refunds/SKILL.md`) provided every skill is listed in `skill://index.json`. The structural constraints above (final segment matches name, `SKILL.md` explicit, no skill nesting inside another skill) apply regardless of scheme.

### Enumeration

Servers SHOULD expose a `skill://index.json` resource listing available skills. The format matches the [Agent Skills well-known URI discovery index](https://agentskills.io/well-known-uri) — same schema, same field shape — with two transport-specific differences: `url` holds the full MCP resource URI, and `digest` is omitted (integrity is handled by the authenticated MCP connection).

```
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "git-workflow",
      "type": "skill-md",
      "description": "Follow this team's Git conventions for branching and commits",
      "url": "skill://git-workflow/SKILL.md"
    }
  ]
}
```

The index is how hosts discover what's available without having to read every resource. An SDK that supports this SEP will typically generate the index automatically from your declared skills; you only need to produce it by hand if you're not using such an SDK.

**When to skip the index.** Some servers have skill catalogs that don't enumerate meaningfully.  A documentation server synthesizing a skill per API endpoint, a gateway fronting an external catalog, a server generating skills from templates at read time. For these, the index is either too large to be useful or doesn't exist as a fixed list. Hosts are required to handle this case: a `skill://` URI is always valid for `resources/read` whether or not it appears in any index. If you skip the index, use server `instructions` to tell the agent which URIs to read and when.

**Resource templates for parameterized namespaces.** A server that serves a skill per entry in some external catalog can describe this in the index as a template entry rather than enumerating each one:

```json
{
  "type": "mcp-resource-template",
  "description": "Per-product documentation skill",
  "url": "skill://docs/{product}/SKILL.md"
}
```

Register the same URI as an MCP resource template so hosts can wire the `{product}` variable to the completion API for interactive discovery.

### Multi-file skills

A skill is a directory: `SKILL.md` plus any supporting files the skill references (additional markdown, scripts, templates, examples). Two ways to distribute these:

**Individual resources (default).** Each file is its own `skill://` resource. Simple, composable, and gives hosts fine-grained control over what they fetch and when. Appropriate for most multi-file skills.

**Archive distribution.** For skills with many supporting files or where atomicity across the bundle matters, the server publishes a single archive resource (`.tar.gz` or `.zip`) that the host unpacks into the skill's URI namespace. The host-facing namespace is identical to individual-file distribution after unpacking.

If you're unsure which to use, start with individual resources. Archive distribution is an optimization for servers shipping pre-built skill bundles or hitting round-trip-count issues with large multi-file skills.

### Metadata

Most skill metadata lives in `SKILL.md` YAML frontmatter per the [Agent Skills specification](https://agentskills.io/specification) — that's the authoritative source for skill-level semantics (version, compatibility, allowed tools). See [Using `_meta` for Skill Resources](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.mdd) for guidance on when MCP resource `_meta` is appropriate vs. when frontmatter suffices.

### Updates

Skill content changes flow through the generic MCP Resources update mechanism. Servers MAY support `resources/subscribe` for hosts that want push-style invalidation, or rely on the host's cache TTL for pull-style refresh. The SEP does not mandate a specific update model; pick what fits your deployment.

---

## References

The relative link `skill-meta-keys.md` above resolves to the authoritative WG doc on `modelcontextprotocol/experimental-ext-skills@main`.

- [SEP draft — experimental-ext-skills#69](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)
- [Skill URI Scheme](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-uri-scheme.md)
- [Using `_meta` for Skill Resources](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.md)
- [Decisions log](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/decisions.md)
- [Agent Skills specification](https://agentskills.io/specification)
- [Well-known URI discovery index](https://agentskills.io/well-known-uri)
