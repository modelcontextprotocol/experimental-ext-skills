# Skill MIME Type Proposal

> Proposed convention for identifying skill resources using a dedicated MIME type over MCP.

**Issue:** [#45](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/45)

**Status:** Draft

---

## Summary

This document proposes using the `text/skill` MIME type to identify resources as skills over the Model Context Protocol (MCP). By relying on the MIME type rather than a strict URI scheme, servers can define domain-specific URIs (e.g., `package-root:<package-name>/<path-to-skill>` in the Dart/Flutter ecosystem) while still allowing clients to discover and interact with skills effectively.

Relative paths within skills are resolved as relative to whatever the root skill URI is.

Note that this _allows_ servers to use a `skill://` URI scheme if they choose, but they are not required to do so.

## Existing Proposals

Currently, other proposals rely on specific URI schemes (like `skill://`) or specific file paths (like `SKILL.md`) to identify skills within MCP.

### 1. URI Scheme Identification

**Pattern:** Relying on `skill://` URIs.

**Pros:**

- Easy to parse; immediately obvious in `resources/list` responses.

**Cons:**

- Forces servers to adopt a specific URI structure, which might conflict with existing domain-specific URI schemes or resolution mechanics.
- Forces clients to deal with name collisions, typically by adding a `server` parameter to `readResource` tools. It is not clear how many servers will have to be altered in order to support this, although resources are already supposed to be scoped by server.

### 2. File Extension Identification

**Pattern:** Identifying skills by their `.md` extension or `SKILL.md` filename in the URI path.

**Pros:**

- Easy to parse; immediately obvious in `resources/list` responses.

**Cons:**

- Ambiguous, as many resources are Markdown files but not necessarily skills.

## Analysis

The fundamental need is for clients to reliably identify which MCP resources represent skills so they can be surfaced, indexed, or read automatically by agents, without colliding with standard text resources.

### Key Design Decisions

**1. What mime type should we use for skills?**
By defining a dedicated MIME type (`text/agent-skill`), any resource, regardless of its URI, can self-identify as a skill.

We should likely follow the [process](https://datatracker.ietf.org/doc/html/rfc6838) to register this as an official mime type.

We could alternatively use the [Unregistered type](https://datatracker.ietf.org/doc/html/rfc6838#section-3.4) `text/x-agent-skill` if this process proved to be too onerous.

**2. What content does `text/agent-skill` represent?**

A resource with the `text/agent-skill` should follow the SKILL.md format, as defined in the [Agent Skills specification](https://agentskills.io/specification#skill-md-format).

## Proposed Convention

### MIME Type: `text/agent-skill`

All primary skill resources MUST use the `text/agent-skill` MIME type in order to be treated as a skill. This type indicates that the content is a Markdown file conforming to the Agent Skills specification.

### How Clients Identify Skills

Clients can identify skill resources in `resources/list` responses by looking strictly at the `mimeType` field:

```json
{
  "resources": [
    {
      "uri": "package-root:my_package/skills/test_skill/SKILL.md",
      "name": "Test Skill",
      "description": "A skill for testing",
      "mimeType": "text/agent-skill"
    }
  ]
}
```

### Sub-resources

Clients resolve relative paths within skill filess relative to the primary skill's URI, whatever that may be. Reads of these resources should be sent to the same server which provided the primary skill resource, as that server is likely the only one which can resolve those URIs.

For example, if a server provides the following resource:

```json
[
  {
    "uri": "my-scheme://my/skills/test_skill/SKILL.md",
    "name": "Test Skill",
    "description": "A skill for testing",
    "mimeType": "text/agent-skill"
  }
]
```

Then a path like `../../resources/my_resource.md` should be resolved as `my-scheme://resources/my_resource.md`. This is because the `SKILL.md` file is the root of the skill, and all relative paths are resolved relative to the root of the skill.

This allows resources to be shared across skills, as long as they are all served by the same server. Note that this allows for skills to reference files outside of the skill directory, as long as the server supports this and the URI remains valid.

This also allows for progressive disclosure of skills themselves, as one skill can link to another.

Other resources (such as supporting scripts, `examples/`, or reference documents) SHOULD NOT have the `text/agent-skill` MIME type (unless they are also skills). They should use their native MIME types.

## MCP Spec Alignment

This proposal is consistent with the [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources), which allows for server specific schemes and already supports mime types.

## References

- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Agent Skills specification](https://agentskills.io/specification)
