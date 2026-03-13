# Recommended `_meta` Keys for Skill Resources

> Proposed conventions for structured metadata on skill resources served over MCP.

**Issue:** [#55](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/55)
**Status:** Draft
**Related:** [Skill URI Scheme Proposal](skill-uri-scheme.md)

---

## Overview

The [Skill URI Scheme Proposal](skill-uri-scheme.md) defines a `skill://` URI convention for identifying skill resources over MCP, and notes that servers MAY use the `_meta` field for additional skill metadata — but doesn't specify what keys would be useful. This document fills that gap.

Skills exposed as MCP resources carry structural identity through `Resource` fields (`name`, `description`, `uri`) and display hints through `annotations` (`audience`, `priority`). But skill-specific metadata — version, invocation control, dependencies, tool requirements — needs a home. MCP's `_meta` field is the extensible mechanism for this.

This document surveys how existing implementations handle skill metadata, proposes a recommended set of `_meta` keys, and provides example `resources/list` responses showing the convention in practice.

## Background: Metadata Surfaces for MCP Resources

MCP resources have three distinct metadata surfaces. Understanding which metadata goes where is essential before defining `_meta` keys.

| Surface | Fields | Purpose | Who uses it |
| :--- | :--- | :--- | :--- |
| **Resource fields** | `name`, `description`, `uri`, `mimeType`, `size` | Structural identity — what the resource is | Protocol layer, all clients |
| **`annotations`** | `audience`, `priority`, `lastModified` | Display and routing hints — how the client should treat it | Client UX, model routing |
| **`_meta`** | Extensible key-value object | Domain-specific metadata — additional context for consumers | Skill-aware clients, registries |

**Key principle:** Don't duplicate information across surfaces. A skill's name and description belong in `Resource.name` and `Resource.description`. Audience routing belongs in `annotations`. Skill-specific metadata — version, invocation mode, dependencies — belongs in `_meta`.

**Naming convention:** The [MCP specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) states that implementations SHOULD use reverse DNS notation for `_meta` keys (e.g., `com.example/key` rather than `example.com/key`). Keys without a namespace prefix are valid but risk collisions.

## Survey of Existing Implementations

Four implementations illustrate the current state of skill metadata in the ecosystem. Each has made different choices about what metadata to surface and how.

### NimbleBrain

[NimbleBrain](https://github.com/NimbleBrainInc/skills) exposes skills as `skill://` resources directly on their MCP servers, with skill content colocated alongside the tools it describes. Five reference servers ([mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search)) independently converged on this pattern.

At the registry layer, NimbleBrain uses a `skill` field in registry `_meta` to support `.skill` artifact bundles (ZIP containing SKILL.md + manifest.json). The individual skill resources on the servers don't currently carry `_meta` keys — metadata lives at the registry level rather than per-resource.

> "Skills living as skill:// resources on the server itself was the natural endpoint of that consolidation. The skill context is colocated with the tools it describes, versioned together, shipped together." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain), via Discord

### skilljack-mcp

[skilljack-mcp](https://github.com/olaservo/skilljack-mcp) loads skills into tool descriptions and uses dynamic tool updates to keep the skills manifest current. It passes the frontmatter `metadata` dictionary from SKILL.md files directly onto MCP resource `_meta`, validating keys against MCP spec rules. This makes skilljack-mcp the only current implementation that bridges Agent Skills frontmatter metadata to MCP `_meta` at the resource level.

### FastMCP 3.0

[FastMCP](https://gofastmcp.com/servers/providers/skills) added native skills support in version 3.0 with a pull-based resource update model. FastMCP uses a `fastmcp` key in `_meta` containing structured metadata including tags, version, and a skill sub-object with the skill name and manifest flag. This is an implementation-specific namespace — not reverse-DNS prefixed, but scoped under a single top-level key to avoid collisions.

### Agent Skills Specification

The [Agent Skills specification](https://agentskills.io/specification) defines 6 allowed top-level fields in SKILL.md YAML frontmatter: `name`, `description`, `license`, `compatibility`, `allowed-tools`, and `metadata`. The `metadata` field is a flat `dict[str, str]` intended as the extension point for client-specific data.

However, multiple implementations already ship fields beyond this set. `disable-model-invocation` is supported by Claude Code, Cursor, and VS Code Copilot. `user-invocable` is supported by Claude Code and VS Code Copilot. Claude Code additionally supports `model`, `context`, `agent`, `hooks`, and `argument-hint`. The gap between spec and implementation is significant — non-spec fields are already shipping in three independent implementations.

The agentskills community has also proposed open frontmatter with namespacing guidance ([agentskills#211](https://github.com/agentskills/agentskills/issues/211)), where non-standard fields would be prefixed with `{AGENT_NAME}-` or nested under `{AGENT_NAME}:` (e.g., `claude:model`). This directly informs the namespace convention proposed below.

### Summary

| Implementation | Metadata surface | Namespace approach | Skill-specific keys |
| :--- | :--- | :--- | :--- |
| NimbleBrain | Registry `_meta` | `skill` field | Bundle metadata (manifest.json) |
| skilljack-mcp | Resource `_meta` | Flat (from frontmatter `metadata` dict) | Passthrough from SKILL.md |
| FastMCP 3.0 | Resource `_meta` | `fastmcp` top-level key | `tags`, `version`, `skill.name`, `skill.is_manifest` |
| Agent Skills spec | YAML frontmatter | Flat + `metadata` dict | `name`, `description`, `license`, `compatibility`, `allowed-tools` |

**Key observations:**

- skilljack-mcp is the only implementation currently bridging Agent Skills frontmatter to MCP resource `_meta`
- FastMCP uses a non-namespaced but scoped key (`fastmcp`) — valid but doesn't follow the MCP spec's reverse DNS recommendation
- NimbleBrain's metadata lives at the registry layer, not per-resource — complementary to per-resource `_meta`
- The Agent Skills spec's `metadata` dict is flat `dict[str, str]`, which can't express lists or nested objects — MCP's `_meta` can

## Recommended `_meta` Keys

### Namespace Convention

All recommended keys use the `io.agentskills/` reverse-domain prefix. This:

- **Follows the MCP spec:** The 2025-11-25 specification recommends reverse DNS notation for `_meta` keys
- **Aligns with the agentskills community:** The namespacing proposal ([agentskills#211](https://github.com/agentskills/agentskills/issues/211)) establishes conventions for prefixed fields. Using the `agentskills.io` domain as the namespace root creates a transparent mapping between frontmatter fields and MCP metadata
- **Avoids collisions:** Implementation-specific keys (like FastMCP's `fastmcp` key) can coexist alongside `io.agentskills/` keys without conflict

> **Note:** Coordination with the agentskills.io specification maintainers is recommended before finalizing this namespace.

### Core Keys

These keys are recommended for all skill resources. They address metadata needs validated by multiple shipping implementations.

| Key | Type | Description |
| :--- | :--- | :--- |
| `io.agentskills/version` | `string` | Skill version. Semver recommended but freeform accepted. Enables version-aware caching, update detection, and pinning. |
| `io.agentskills/invocation` | `string` — `"user"`, `"assistant"`, or `"both"` | Who can trigger loading this skill. `"user"` means manual invocation only (e.g., slash command). `"assistant"` means the model can auto-load it. `"both"` means either. Maps to the `disable-model-invocation` and `user-invocable` frontmatter fields already shipping in Claude Code, Cursor, and VS Code Copilot. |

**Why not `io.agentskills/name` or `io.agentskills/description`?** These are redundant with `Resource.name` and `Resource.description`, which are first-class fields on every MCP resource. Servers SHOULD populate those Resource fields from the skill frontmatter and SHOULD NOT duplicate them in `_meta`.

**Distinguishing `invocation` from `annotations.audience`:** These address different questions. `annotations.audience` controls *visibility* — who sees the resource (`["user"]`, `["assistant"]`, or both). `io.agentskills/invocation` controls *activation* — who can trigger loading the skill into context. A skill might be visible to the assistant (`audience: ["assistant"]`) but only loadable by the user (`invocation: "user"`).

### Extended Keys

These keys are recommended for servers with richer skill metadata. They address needs with strong community demand but fewer shipping implementations.

| Key | Type | Description |
| :--- | :--- | :--- |
| `io.agentskills/allowed-tools` | `string[]` | Tool patterns this skill expects to use (e.g., `["Bash(git:*)", "Read"]`). JSON array format resolves the YAML string-vs-list ambiguity that affects 14% of community skills ([agentskills#144](https://github.com/agentskills/agentskills/issues/144)). |
| `io.agentskills/requires` | `object[]` | Dependencies this skill requires — other skill names, MCP server identifiers, or both. Each object has a `name` field (string) and an optional `version` field (string, semver range). See [Example 3](#example-3-multi-skill-server-with-dependencies) for structure. |
| `io.agentskills/category` | `string` | Discovery category for filtering and grouping (e.g., `"workflow"`, `"debugging"`, `"deployment"`). Useful for registries and multi-skill servers. No fixed taxonomy is prescribed — servers choose categories that fit their domain. |

### Using `annotations` Alongside `_meta`

Skill resources SHOULD also populate `annotations` for effective client behavior:

- **`audience`**: Use `["assistant"]` for skills consumed only by the model. Use `["user", "assistant"]` for skills that may also be displayed in a skill browser or management UI.
- **`priority`**: Use higher values (e.g., `0.8`) for the primary SKILL.md resource and lower values (e.g., `0.3`) for supporting reference files. This helps clients decide what to load first in progressive disclosure.
- **`lastModified`**: ISO 8601 timestamp. Enables cache invalidation when skill content changes.

### What Not to Put in `_meta`

- **`name` / `description`** — Use `Resource.name` and `Resource.description`
- **Client-specific concerns** — Fields like `model`, `hooks`, `argument-hint`, and `context`/`agent` are client implementation details. They belong in SKILL.md frontmatter where each client can interpret them, not in `_meta` where they imply cross-client semantics.
- **Content** — `_meta` is for metadata about the skill, not the skill instructions themselves. Skill content is the resource body.

## Examples

All examples use the `skill://` URI convention from the [Skill URI Scheme Proposal](skill-uri-scheme.md).

### Example 1: Minimal Skill Resource

A single skill exposed by an IP lookup server. Core `_meta` keys only — the simplest adoption path.

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
      },
      "_meta": {
        "io.agentskills/version": "1.2.0",
        "io.agentskills/invocation": "assistant"
      }
    }
  ]
}
```

### Example 2: Skill with Progressive Disclosure

A code review skill with a primary SKILL.md and supporting reference files. The `annotations.priority` field differentiates the primary skill from supporting content, enabling clients to load the main skill first and defer references until needed.

```json
{
  "resources": [
    {
      "uri": "skill://code-review/SKILL.md",
      "name": "code-review",
      "description": "Structured code review workflow with checklist-driven analysis and inline annotations.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.8,
        "lastModified": "2026-02-15T09:30:00Z"
      },
      "_meta": {
        "io.agentskills/version": "2.0.1",
        "io.agentskills/invocation": "both",
        "io.agentskills/allowed-tools": ["Read", "Grep", "Glob"],
        "io.agentskills/category": "workflow"
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
      },
      "_meta": {
        "io.agentskills/version": "2.0.1"
      }
    },
    {
      "uri": "skill://code-review/references/language-patterns.md",
      "name": "code-review-language-patterns",
      "description": "Language-specific code review patterns and anti-patterns.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.3,
        "lastModified": "2026-02-10T14:00:00Z"
      },
      "_meta": {
        "io.agentskills/version": "2.0.1"
      }
    }
  ]
}
```

### Example 3: Multi-Skill Server with Dependencies

A deployment server exposing two skills. The `deploy-to-staging` skill depends on the `git-workflow` skill and a specific MCP server. This demonstrates how `io.agentskills/requires` enables host-mediated dependency resolution — the host can verify that dependencies are available before surfacing the skill.

```json
{
  "resources": [
    {
      "uri": "skill://git-workflow/SKILL.md",
      "name": "git-workflow",
      "description": "Branch management, commit conventions, and PR workflow for the deployment pipeline.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["assistant"],
        "priority": 0.8
      },
      "_meta": {
        "io.agentskills/version": "1.0.0",
        "io.agentskills/invocation": "assistant",
        "io.agentskills/allowed-tools": ["Bash(git:*)"],
        "io.agentskills/category": "version-control"
      }
    },
    {
      "uri": "skill://deploy-to-staging/SKILL.md",
      "name": "deploy-to-staging",
      "description": "Step-by-step staging deployment with pre-flight checks, rollback procedures, and health verification.",
      "mimeType": "text/markdown",
      "annotations": {
        "audience": ["user", "assistant"],
        "priority": 0.8
      },
      "_meta": {
        "io.agentskills/version": "0.9.0",
        "io.agentskills/invocation": "user",
        "io.agentskills/allowed-tools": ["Bash(kubectl:*)", "Bash(helm:*)"],
        "io.agentskills/category": "deployment",
        "io.agentskills/requires": [
          {
            "name": "git-workflow",
            "version": ">=1.0.0"
          },
          {
            "name": "mcp-server:kubernetes-tools"
          }
        ]
      }
    }
  ]
}
```

## Relationship to Other Work

### Skill URI Scheme (PR #53)

The [Skill URI Scheme Proposal](skill-uri-scheme.md) defines the `skill://` URI convention for identifying skill resources. That document defers to this one for `_meta` key specifics. The URI scheme determines *how skills are addressed*; the `_meta` keys determine *what metadata they carry*. The two conventions are complementary and designed to work together.

The URI scheme doc also notes that servers MAY include provenance metadata in `_meta` to address multi-server skill name collisions. Provenance keys are deferred to [Future Considerations](#future-considerations) below.

### Agent Skills Spec Frontmatter

The `io.agentskills/` prefix creates a transparent mapping between Agent Skills frontmatter fields and MCP `_meta` keys. A server loading skills from SKILL.md files can translate frontmatter to `_meta` mechanically:

- `name` / `description` → `Resource.name` / `Resource.description` (not `_meta`)
- `allowed-tools` → `io.agentskills/allowed-tools` (as JSON array, resolving the YAML type ambiguity)
- `disable-model-invocation: true` + `user-invocable: true` → `io.agentskills/invocation: "user"`
- `compatibility` → `Resource.description` or a future `_meta` key
- `metadata` dict → passthrough to `_meta` (implementation-specific keys)

### Registry `skills.json` Proposal

The [registry `skills.json` proposal](https://github.com/modelcontextprotocol/registry/discussions/895) addresses discovery metadata at the registry layer — categories, search tags, server-skill pairing. Per-resource `_meta` keys complement registry metadata: the registry helps users *find* skills, while `_meta` helps clients *use* them once discovered.

### SEP-2076: Skills as a First-Class Primitive

[SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) proposes `skills/list` and `skills/get` as protocol methods. The `_meta` keys recommended here work regardless of whether skills are exposed as resources (Approach 3) or as protocol primitives (Approach 1) — `_meta` is available on both. If SEP-2076 is adopted, these keys could also appear on `Skill` objects returned by `skills/list`.

## Future Considerations

The following `_meta` keys are deferred for future work. Each addresses a real community need but lacks sufficient implementation experience or has open design questions.

| Candidate Key | Type | Description | Community References |
| :--- | :--- | :--- | :--- |
| `io.agentskills/inputSchema` | `object` (JSON Schema) | Typed input contract for skills-as-tools bridge | [agentskills#136](https://github.com/agentskills/agentskills/issues/136), [agentskills#61](https://github.com/agentskills/agentskills/issues/61) |
| `io.agentskills/outputSchema` | `object` (JSON Schema) | Typed output contract for skills-as-tools bridge | [agentskills#136](https://github.com/agentskills/agentskills/issues/136) |
| `io.agentskills/mcpServers` | `string[]` | MCP servers this skill depends on (URIs or identifiers) | [agentskills#21](https://github.com/agentskills/agentskills/issues/21), [agentskills#195](https://github.com/agentskills/agentskills/issues/195) |
| `io.agentskills/toolDependencies` | `string[]` | Specific MCP tools this skill requires | [agentskills#195](https://github.com/agentskills/agentskills/issues/195), [agentskills#217](https://github.com/agentskills/agentskills/issues/217) |
| `io.agentskills/activationTriggers` | `object` | File patterns, keywords, or intents that trigger skill loading | [agentskills#57](https://github.com/agentskills/agentskills/issues/57), [agentskills#64](https://github.com/agentskills/agentskills/issues/64) |
| `io.agentskills/credentials` | `object[]` | Required API keys or tokens for skill execution | [agentskills#173](https://github.com/agentskills/agentskills/discussions/173) |
| `io.agentskills/capabilities` | `string[]` | System access requirements (filesystem, network, shell) | [agentskills#181](https://github.com/agentskills/agentskills/discussions/181) |
| `io.agentskills/provenance` | `object` | Server origin and authorship for multi-server disambiguation | [Skill URI Scheme Proposal](skill-uri-scheme.md) |

## References

- [MCP Resources Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) — Resource schema, `annotations`, `_meta` field
- [Agent Skills Specification](https://agentskills.io/specification) — Frontmatter field definitions
- [Skill URI Scheme Proposal](skill-uri-scheme.md) — `skill://` URI convention
- [SEP-2076: Skills as MCP Primitives](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) — `skills/list` and `skills/get` proposal
- [Registry `skills.json` Discussion](https://github.com/modelcontextprotocol/registry/discussions/895) — Registry-layer skill metadata
- [agentskills#211: Open Frontmatter with Namespacing](https://github.com/agentskills/agentskills/issues/211) — Namespace convention for non-standard fields
- [skilljack-mcp](https://github.com/olaservo/skilljack-mcp) — Skills as tools/resources implementation
- [FastMCP Skills Support](https://gofastmcp.com/servers/providers/skills) — FastMCP 3.0 skills provider
- [NimbleBrain Skills](https://github.com/NimbleBrainInc/skills) — Registry-integrated skill bundles
