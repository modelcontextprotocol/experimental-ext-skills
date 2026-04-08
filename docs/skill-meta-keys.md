# Using `_meta` for Skill Resources

> Guidelines for structured metadata on skill resources served over MCP.

**Issue:** [#55](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/55)
**Status:** Draft
**Related:** [Skill URI Scheme Proposal](skill-uri-scheme.md)

---

## Overview

The [Skill URI Scheme Proposal](skill-uri-scheme.md) defines a `skill://` URI convention for identifying skill resources over MCP, and notes that servers MAY use the `_meta` field for additional skill metadata — but doesn't specify what keys would be useful or how `_meta` relates to other metadata surfaces.

Skills exposed as MCP resources already have multiple metadata surfaces: `Resource` fields (`name`, `description`, `uri`), `annotations` (`audience`, `priority`), and [Agent Skills frontmatter](https://agentskills.io/specification) in the resource content. Before defining any `_meta` keys, it's important to establish clear boundaries between these surfaces to avoid duplication and fragmentation.

This document establishes scoping principles for when `_meta` is appropriate, defines a namespace convention for skill-related keys, surveys how existing implementations handle skill metadata, and identifies candidate keys for future standardization.

## Metadata Surfaces for Skill Resources

Skill resources have four distinct metadata surfaces. Understanding which metadata goes where is essential before using `_meta`.

| Surface | Fields | Purpose | Who uses it |
| :--- | :--- | :--- | :--- |
| **Resource fields** | `name`, `description`, `uri`, `mimeType`, `size` | Structural identity — what the resource is | Protocol layer, all clients |
| **`annotations`** | `audience`, `priority`, `lastModified` | Display and routing hints — how the client should treat it | Client UX, model routing |
| **Frontmatter** | `name`, `description`, `allowed-tools`, `compatibility`, etc. | Skill-level semantics — what the skill does and how it behaves | Skill-aware clients, all implementations |
| **`_meta`** | Extensible key-value object | Additional metadata not covered by the above surfaces | Varies by use case |

### Scoping Principles

**Don't duplicate information across surfaces.** Each piece of metadata should have one authoritative home:

- A skill's name and description belong in `Resource.name` and `Resource.description`
- Audience routing belongs in `annotations`
- Skill-level semantics (version, invocation mode, allowed tools) belong in **frontmatter** — these properties apply to skills regardless of whether they are served over MCP, and frontmatter is the mechanism defined by the [Agent Skills specification](https://agentskills.io/specification) for expressing them
- Distribution-level concerns (inter-server dependencies, provenance, packaging) may be better addressed at the **plugin or distribution layer** rather than per-resource `_meta`

**Prefer existing surfaces over `_meta`.** The bar for adding a `_meta` key should be high: the metadata must not fit cleanly into Resource fields, `annotations`, frontmatter, or a distribution-layer mechanism. `_meta` is the right choice when metadata is specific to the MCP transport context and has no natural home elsewhere.

**Keep `_meta` lightweight.** Well-built clients will cache skill resources locally and use `annotations.lastModified` plus change notifications to stay current. Metadata reads will greatly outnumber content reads, so `_meta` should be kept lean. If clients need skill-level properties (version, invocation mode, allowed tools), they read them from the cached resource content — not from a duplicated `_meta` projection.

### What Not to Put in `_meta`

- **`name` / `description`** — Use `Resource.name` and `Resource.description`
- **Skill-level semantics** — Fields like `version`, `invocation`, `allowed-tools`, `compatibility`, `model`, `hooks`, `argument-hint`, and `context`/`agent` belong in frontmatter. Duplicating these in `_meta` creates sync risk and blurs the boundary between transport and content. Even as a "materialized view," the duplication is a net pessimization if clients are caching resource content anyway.
- **Content** — `_meta` is for metadata about the skill, not the skill instructions themselves. Skill content is the resource body.

### Using `annotations` for Skill Resources

Skill resources SHOULD populate `annotations` for effective client behavior:

- **`audience`**: Use `["assistant"]` for skills consumed only by the model. Use `["user", "assistant"]` for skills that may also be displayed in a skill browser or management UI.
- **`priority`**: Use higher values (e.g., `0.8`) for the primary SKILL.md resource and lower values (e.g., `0.3`) for supporting reference files. This helps clients decide what to load first in progressive disclosure.
- **`lastModified`**: ISO 8601 timestamp. Enables cache invalidation when skill content changes.

## Namespace Convention

When `_meta` keys are needed for skill resources, implementations SHOULD use the `io.modelcontextprotocol.skills/` reverse-domain prefix. This:

- **Follows the MCP spec:** The [2025-11-25 specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) recommends reverse DNS notation for `_meta` keys (e.g., `com.example/key` rather than `example.com/key`). Keys without a namespace prefix are valid but risk collisions.
- **Signals MCP-layer semantics:** These keys describe how skills relate to the MCP ecosystem, distinct from skill-level behavior in frontmatter.
- **Avoids collisions:** Implementation-specific keys (like FastMCP's `fastmcp` key) can coexist alongside namespaced keys without conflict.

Implementation-specific keys MAY use their own namespace (e.g., `com.fastmcp/` or a top-level scoped key like `fastmcp`), but SHOULD NOT use the `io.modelcontextprotocol.skills/` prefix for non-standardized keys.

## Survey of Existing Implementations

Four implementations illustrate the current state of skill metadata in the ecosystem. Each has made different choices about what metadata to surface and how.

### NimbleBrain

[NimbleBrain](https://github.com/NimbleBrainInc/skills) exposes skills as `skill://` resources directly on their MCP servers, with skill content colocated alongside the tools it describes. Five reference servers ([mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search)) independently converged on this pattern.

At the registry layer, NimbleBrain uses a `skill` field in registry `_meta` to support `.skill` artifact bundles (ZIP containing SKILL.md + manifest.json). The individual skill resources on the servers don't currently carry `_meta` keys — metadata lives at the registry level rather than per-resource.

> "Skills living as skill:// resources on the server itself was the natural endpoint of that consolidation. The skill context is colocated with the tools it describes, versioned together, shipped together." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain), via Discord

### FastMCP 3.0

[FastMCP](https://gofastmcp.com/servers/providers/skills) added native skills support in version 3.0 with a pull-based resource update model. FastMCP uses a `fastmcp` key in `_meta` containing structured metadata including tags, version, and a skill sub-object with the skill name and manifest flag. This is an implementation-specific namespace — not reverse-DNS prefixed, but scoped under a single top-level key to avoid collisions.

### Agent Skills Specification

The [Agent Skills specification](https://agentskills.io/specification) defines 6 allowed top-level fields in SKILL.md YAML frontmatter: `name`, `description`, `license`, `compatibility`, `allowed-tools`, and `metadata`. The `metadata` field is a flat `dict[str, str]` intended as the extension point for client-specific data.

However, multiple implementations already ship fields beyond this set. `disable-model-invocation` is supported by Claude Code, Cursor, and VS Code Copilot. `user-invocable` is supported by Claude Code and VS Code Copilot. Claude Code additionally supports `model`, `context`, `agent`, `hooks`, and `argument-hint`. The gap between spec and implementation is significant — non-spec fields are already shipping in three independent implementations.

The agentskills community has also proposed open frontmatter with namespacing guidance ([agentskills#211](https://github.com/agentskills/agentskills/issues/211)), where non-standard fields would be prefixed with `{AGENT_NAME}-` or nested under `{AGENT_NAME}:` (e.g., `claude:model`). This reinforces keeping skill-level semantics in frontmatter while reserving `_meta` for concerns that frontmatter cannot address.

### Summary

| Implementation | Metadata surface | Namespace approach | Skill-specific keys |
| :--- | :--- | :--- | :--- |
| NimbleBrain | Registry `_meta` | `skill` field | Bundle metadata (manifest.json) |
| FastMCP 3.0 | Resource `_meta` | `fastmcp` top-level key | `tags`, `version`, `skill.name`, `skill.is_manifest` |
| Agent Skills spec | YAML frontmatter | Flat + `metadata` dict | `name`, `description`, `license`, `compatibility`, `allowed-tools` |

**Key observations:**

- FastMCP uses a non-namespaced but scoped key (`fastmcp`) — valid but doesn't follow the MCP spec's reverse DNS recommendation
- NimbleBrain's metadata lives at the registry layer, not per-resource — complementary to per-resource `_meta`
- The Agent Skills spec's `metadata` dict is flat `dict[str, str]`, which can't express lists or nested objects — MCP's `_meta` can
- Skill-level semantics (version, invocation, tools) are well-served by frontmatter; most metadata needs for skills today don't require `_meta`

## Example: Skill Resource Without `_meta`

Most skill resources won't need `_meta` keys. Resource fields, `annotations`, and frontmatter cover the common cases. This example uses the `skill://` URI convention from the [Skill URI Scheme Proposal](skill-uri-scheme.md).

```json
{
  "resources": [
    {
      "uri": "skill://ipinfo/usage",
      "name": "ipinfo-usage",
      "description": "Tool selection guidance and context reuse patterns for IP lookup tools.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.8,
        "lastModified": "2026-03-01T12:00:00Z"
      }
    },
    {
      "uri": "skill://code-review/SKILL.md",
      "name": "code-review",
      "description": "Structured code review workflow with checklist-driven analysis and inline annotations.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.8,
        "lastModified": "2026-02-15T09:30:00Z"
      }
    },
    {
      "uri": "skill://code-review/references/security-checklist.md",
      "name": "code-review-security-checklist",
      "description": "OWASP-aligned security review checklist for code review skill.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.3,
        "lastModified": "2026-02-15T09:30:00Z"
      }
    }
  ]
}
```

Skill-level metadata (version, allowed tools, invocation mode) lives in the SKILL.md frontmatter, read from the resource content. The `annotations.priority` field differentiates the primary skill from supporting content, enabling clients to load the main skill first and defer references until needed.

## Candidate Keys for Future Standardization

The following areas have been identified as potential uses for `_meta` on skill resources. Each requires further discussion to determine whether `_meta` is the right home — some may be better addressed at the distribution/plugin layer, in frontmatter, or in MCP itself.

| Area | Description | Open Questions | Community References |
| :--- | :--- | :--- | :--- |
| **Provenance** | Server origin, authorship, canonical source for skills aggregated across servers | Could be solved at the plugin/distribution layer instead of per-resource. Also applies to non-MCP skills, suggesting frontmatter may be more appropriate. | [Skill URI Scheme Proposal](skill-uri-scheme.md) |
| **Dependencies** | Inter-skill and inter-server dependency declarations for host-mediated resolution | Plugin-level dependency resolution may be more appropriate than per-skill declarations. Versioning is also an open MCP-wide concern (see server versioning SEPs). | [agentskills#21](https://github.com/agentskills/agentskills/issues/21), [agentskills#195](https://github.com/agentskills/agentskills/issues/195) |
| **Input/output schemas** | Typed contracts for skills-as-tools bridge | May belong in frontmatter if applicable to non-MCP skills. | [agentskills#136](https://github.com/agentskills/agentskills/issues/136), [agentskills#61](https://github.com/agentskills/agentskills/issues/61) |
| **Content integrity** | Hash for verifying skill content hasn't been modified in transit | Potentially MCP-transport-specific; no frontmatter equivalent. | — |
| **Activation triggers** | File patterns, keywords, or intents that trigger skill loading | Likely a skill-level concern better addressed in frontmatter. | [agentskills#57](https://github.com/agentskills/agentskills/issues/57), [agentskills#64](https://github.com/agentskills/agentskills/issues/64) |

The general razor for evaluating candidates: **does this metadata also apply to non-MCP skills?** If so, it should be solved in frontmatter rather than `_meta`, to avoid fragmenting the skills ecosystem across transport mechanisms.

## Relationship to Other Work

### Skill URI Scheme (PR #53)

The [Skill URI Scheme Proposal](skill-uri-scheme.md) defines the `skill://` URI convention for identifying skill resources. The URI scheme determines *how skills are addressed*; this document establishes conventions for *what metadata they carry* in `_meta`, when `_meta` is warranted at all.

### Agent Skills Spec Frontmatter

Frontmatter remains the authoritative source for skill-level semantics. This document intentionally does not recommend `_meta` keys that duplicate frontmatter. The [open frontmatter proposal (agentskills#211)](https://github.com/agentskills/agentskills/issues/211) and ongoing convergence across implementations (Claude Code, Cursor, VS Code Copilot) will continue to expand what frontmatter can express — reducing the surface area where `_meta` is needed.

### Plugin and Distribution Layer

Concerns like provenance, inter-server dependencies, and packaging may be more naturally addressed at the plugin or distribution layer (e.g., Claude Code plugins) rather than per-resource `_meta`. The distribution layer can express inter-server *and* inter-skill dependencies, with a broader scope than individual skill resources. This document acknowledges that deferred candidates may migrate to that layer as it matures.

### Registry `skills.json` Proposal

The [registry `skills.json` proposal](https://github.com/modelcontextprotocol/registry/discussions/895) addresses discovery metadata at the registry layer — categories, search tags, server-skill pairing. Registry metadata helps users *find* skills; `_meta` (when used) provides per-resource context at runtime.

### SEP-2076: Skills as a First-Class Primitive

[SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) proposes `skills/list` and `skills/get` as protocol methods. The scoping principles and namespace convention in this document apply regardless of whether skills are exposed as resources or as protocol primitives — `_meta` is available on both.

## References

- [MCP Resources Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) — Resource schema, `annotations`, `_meta` field
- [Agent Skills Specification](https://agentskills.io/specification) — Frontmatter field definitions
- [Skill URI Scheme Proposal](skill-uri-scheme.md) — `skill://` URI convention
- [SEP-2076: Skills as MCP Primitives](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) — `skills/list` and `skills/get` proposal
- [Registry `skills.json` Discussion](https://github.com/modelcontextprotocol/registry/discussions/895) — Registry-layer skill metadata
- [agentskills#211: Open Frontmatter with Namespacing](https://github.com/agentskills/agentskills/issues/211) — Namespace convention for non-standard fields
- [FastMCP Skills Support](https://gofastmcp.com/servers/providers/skills) — FastMCP 3.0 skills provider
- [NimbleBrain Skills](https://github.com/NimbleBrainInc/skills) — Registry-integrated skill bundles
