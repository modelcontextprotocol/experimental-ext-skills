---
name: implement-skills-mcp-extension-server
description: This skill should be used when the user asks to "add skills to my MCP server", "implement the skills SEP on the server side", "expose agent skills over MCP", "serve SKILL.md files as resources", "add skill:// URIs to my server", "build a skill index.json for MCP", or needs guidance on serving Agent Skills via MCP resources per the experimental Skills-over-MCP SEP. Covers the io.modelcontextprotocol/skills capability declaration, URI scheme and structure (final-segment-equals-name rule), skill://index.json enumeration with skill-md / archive / mcp-resource-template entry types, per-file resource exposure, server instructions that point at skills, archive distribution constraints, base resource metadata fields (mimeType, name, description) and _meta usage, update/subscription patterns, and the trust-boundary framing for what to expose under skill://.
---

# Implementing Skills-over-MCP in an MCP Server

> Skills Extension SEP: [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640).

---

Three concerns determine how an MCP server exposes skills: what URI scheme and structure to use, how to make skills discoverable, and how to distribute multi-file skills. Before any of that, the server declares the extension.

### Capability declaration

Per [SEP-2133](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2133) extension negotiation, a server advertises support for this extension in its `initialize` response:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/skills": {}
    }
  }
}
```

The empty object indicates support; no extension-specific settings are defined. Hosts use this signal to decide which connected servers to register as skill origins, so omitting it means hosts that gate on the capability won't surface your skills even if `skill://index.json` is reachable. SDKs that implement this SEP set the capability for you when you declare any skill.

### URI structure

Skills are exposed as MCP resources. Servers SHOULD use the `skill://` URI scheme, under which each file in a skill directory is addressable as:

`skill://<skill-path>/<file-path>`

The final segment of `<skill-path>` MUST match the skill's `name` as declared in its `SKILL.md` frontmatter. Preceding segments are a server-chosen organizational prefix — use them if the server has meaningful hierarchy (by team, product, domain, or version), omit them for flat catalogs.

Servers MAY serve skills under a domain-native scheme (`github://owner/repo/skills/refunds/SKILL.md`) provided every skill is listed in `skill://index.json`. The structural constraints above (final segment matches name, `SKILL.md` explicit, no skill nesting inside another skill) apply regardless of scheme.

| Server shape | Example URI |
|---|---|
| Single flat catalog | `skill://git-workflow/SKILL.md` |
| Organizational hierarchy | `skill://acme/billing/refunds/SKILL.md` |
| Per-product documentation | `skill://docs/widget-api/SKILL.md` |

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

**Individual resources (default).** Each file is its own `skill://` resource (`type: "skill-md"` in the index). Simple, composable, and gives hosts fine-grained control over what they fetch and when. Appropriate for most multi-file skills.

**Archive distribution.** For skills with many supporting files, where atomicity across the bundle matters, or where UNIX file metadata (executable bits, symlinks) needs to round-trip, declare the skill as `type: "archive"` in `skill://index.json` with `url` pointing at a single archive resource:

```json
{
  "name": "pdf-processing",
  "type": "archive",
  "description": "Extract and transform PDF documents",
  "url": "skill://pdf-processing.tar.gz"
}
```

The archive MUST be `.tar.gz` (`mimeType: application/gzip`) or `.zip` (`mimeType: application/zip`). `SKILL.md` MUST be at the archive root — no wrapper directory — and the archive MUST NOT contain path-traversal sequences (`..`) or absolute paths. The `<skill-path>` the host exposes is the entry's `url` with the archive suffix stripped: `skill://pdf-processing.tar.gz` unpacks to `skill://pdf-processing/`, `skill://acme/billing/refunds.zip` to `skill://acme/billing/refunds/`. The host-facing namespace is identical to individual-file distribution after unpacking.

If you're unsure which to use, always start with individual resources. Archive distribution is an optimization for servers shipping pre-built skill bundles, hitting round-trip-count issues with large multi-file skills, or needing UNIX file metadata that individual-resource distribution can't represent. The trade-off is per-file `resources/subscribe` granularity, which the skill reading model does not depend on.

### Metadata

Most skill metadata lives in `SKILL.md` YAML frontmatter per the [Agent Skills specification](https://agentskills.io/specification) — that's the authoritative source for skill-level semantics (version, compatibility, allowed tools).

For each `skill://<skill-path>/SKILL.md` resource, the server SHOULD set the following on the MCP `Resource` object:

- `mimeType: "text/markdown"`
- `name` — copied from the frontmatter `name` field (which by the URI rule always equals the final segment of `<skill-path>`).
- `description` — copied from the frontmatter `description` field.

Other files in the skill use the `mimeType` appropriate to their content. SDKs that implement this SEP populate these fields automatically from the `SKILL.md` you declare; you only need to set them by hand on a hand-rolled server.

Additional frontmatter fields MAY be exposed via the resource's `_meta` object using the `io.modelcontextprotocol.skills/` reverse-domain prefix. See [Using `_meta` for Skill Resources](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.md) for when `_meta` is appropriate vs. when frontmatter suffices.

### Updates

Skill content changes flow through the generic MCP Resources update mechanism. Servers MAY support `resources/subscribe` for hosts that want push-style invalidation, or rely on the host's cache TTL for pull-style refresh. The SEP does not mandate a specific update model; pick what fits your deployment.

### What to expose

Skill content reaches the model as instructional text and is treated by hosts as untrusted input. Two server-side framings worth keeping in mind:

**Not a third-party marketplace.** This extension is for shipping skills that describe your *own* tools and workflows — the things this server already authoritatively speaks for. Relaying arbitrary third-party skill content through `skill://` puts that content inside the trust boundary the user extended to your server when they connected. Don't do it. (A skill that *links* to external docs is fine; a skill that *is* user-supplied content fed through your server is not.)

**No covert-channel directives.** Hosts MUST NOT silently honor mechanisms in skill content that would cause local code execution (hooks, pre/post-invocation scripts, shell commands in frontmatter); a host that does is exposing its users to remote code execution. Don't author such fields into MCP-served skills expecting them to fire — at best they'll be ignored, at worst they'll be flagged as a hostile-server signal during host review.

For archive distribution, also: produce archives that pass [Agent Skills archive safety](https://agentskills.io/well-known-uri#archive-safety) — no path-traversal sequences, no absolute paths, no symlinks resolving outside the skill directory, bounded uncompressed size. Hosts will reject archives that fail these checks.

---

## References

The relative link `skill-meta-keys.md` above resolves to the authoritative WG doc on `modelcontextprotocol/experimental-ext-skills@main`.

- [SEP-2640 — Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640)
- [Skill URI Scheme](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-uri-scheme.md)
- [Using `_meta` for Skill Resources](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.md)
- [Decisions log](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/decisions.md)
- [Agent Skills specification](https://agentskills.io/specification)
- [Well-known URI discovery index](https://agentskills.io/well-known-uri)
