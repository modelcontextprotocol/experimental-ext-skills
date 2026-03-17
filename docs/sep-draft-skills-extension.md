# SEP-0000: Skills Extension

- **Status**: Draft (pre-submission)
- **Type**: Extensions Track
- **Created**: 2026-03-17
- **Author(s)**: Skills Over MCP Interest Group
- **Sponsor**: _(seeking)_
- **Extension Identifier**: `io.modelcontextprotocol/skills`
- **PR**: _(to be assigned on submission)_

> This document is a pre-submission draft maintained by the [Skills Over MCP Interest Group](https://github.com/modelcontextprotocol/experimental-ext-skills). It has not yet been submitted to the main MCP repository. Discussion welcome via [GitHub Issues](https://github.com/modelcontextprotocol/experimental-ext-skills/issues) or [Discord #skills-over-mcp-ig](https://discord.com/channels/1358869848138059966/1464745826629976084).

## Abstract

This SEP defines a convention for serving [Agent Skills](https://agentskills.io/) over MCP using the existing Resources primitive. A _skill_ is a directory of files (minimally a `SKILL.md`) that provides structured workflow instructions to an agent. This extension specifies that each file in a skill directory is exposed as an MCP resource under the `skill://` URI scheme, with skill discovery achieved through scoped `resources/list` calls (per [SEP-2093]). The skill format itself — directory structure, YAML frontmatter, naming rules — is delegated entirely to the [Agent Skills specification](https://agentskills.io/specification); this SEP defines only the transport binding.

Because the extension adds no new protocol methods or capabilities, hosts that already treat MCP resources as a virtual filesystem can consume MCP-served skills identically to local filesystem skills. The specification is accompanied by implementation guidelines for host-provided resource-reading tools and SDK-level convenience wrappers.

## Motivation

Native skills support in host applications demonstrates strong demand for rich, progressively disclosed workflow instructions. MCP does not currently offer a conventional way to ship this content alongside the tools it describes, which leads to:

- **Fragmented distribution.** A server and the skill that teaches an agent to use it are versioned, discovered, and installed separately. Users installing a server from a registry have no signal that a companion skill exists. ([problem-statement.md](problem-statement.md))
- **Instruction size limits.** Server instructions load once at initialization and are practically bounded in size. Complex workflows — such as the 875-line [mcpGraph skill](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) — do not fit this model. ([experimental-findings.md](experimental-findings.md#mcpgraph-skills-in-mcp-server-repo))
- **Inconsistent ad-hoc solutions.** Absent a convention, four independent implementations have each invented their own `skill://` URI structure, with diverging semantics for authority, path, and sub-resource addressing. ([skill-uri-scheme.md](skill-uri-scheme.md#survey-of-existing-patterns))

This SEP codifies that answer.

## Specification

### Dependencies

This extension depends on [SEP-2093] (Resource Contents Metadata and Capabilities) for scoped `resources/list`. Servers implementing this extension MUST support `resources/list` with a `uri` parameter.

### Skill Format

A skill served over MCP MUST conform to the [Agent Skills specification](https://agentskills.io/specification). In particular:

- A skill is a directory identified by a _skill name_.
- Every skill MUST contain a `SKILL.md` file at its root.
- `SKILL.md` MUST begin with YAML frontmatter containing at minimum the `name` and `description` fields as defined by the Agent Skills specification.
- A skill MAY contain additional files and subdirectories (references, scripts, examples, assets).

This extension does not redefine, constrain, or extend the skill format. Future revisions of the Agent Skills specification apply automatically.

### Resource Mapping

Each file within a skill directory MUST be exposed as an MCP resource. The resource URI MUST follow the form:

```
skill://<skill-name>/<path>
```

where:

- `<skill-name>` is the skill's directory name, which MUST follow the Agent Skills specification [naming rules](https://agentskills.io/specification#name-field) (1–64 characters, lowercase alphanumeric and hyphens, no leading/trailing or consecutive hyphens).
- `<path>` is the file's path relative to the skill directory root, using `/` as the path separator.

The resource for the skill's required `SKILL.md` is therefore always:

```
skill://<skill-name>/SKILL.md
```

Per [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986), `<skill-name>` occupies the authority component and `<path>` is the path. Skill names are not network hosts; clients MUST NOT attempt DNS or network resolution of the authority.

#### Examples

| File in skill directory | Resource URI |
|---|---|
| `git-workflow/SKILL.md` | `skill://git-workflow/SKILL.md` |
| `pdf-processing/SKILL.md` | `skill://pdf-processing/SKILL.md` |
| `pdf-processing/references/FORMS.md` | `skill://pdf-processing/references/FORMS.md` |
| `pdf-processing/scripts/extract.py` | `skill://pdf-processing/scripts/extract.py` |

#### Resource Metadata

For each `skill://<skill-name>/SKILL.md` resource:

- `mimeType` SHOULD be `text/markdown`.
- `name` SHOULD be set from the `name` field of the `SKILL.md` YAML frontmatter.
- `description` SHOULD be set from the `description` field of the `SKILL.md` YAML frontmatter.

Servers MAY expose additional frontmatter fields via the resource's `_meta` object. Other files in the skill use the `mimeType` appropriate to their content.

### Discovery

Servers implementing this extension MUST respond to a scoped list request for the `skill://` scheme root:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {
    "uri": "skill://"
  }
}
```

The response MUST include, for each skill the server provides, the resource entry for that skill's `SKILL.md`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resources": [
      {
        "uri": "skill://git-workflow/SKILL.md",
        "name": "git-workflow",
        "description": "Follow this team's Git conventions for branching and commits",
        "mimeType": "text/markdown"
      },
      {
        "uri": "skill://pdf-processing/SKILL.md",
        "name": "pdf-processing",
        "description": "Extract, transform, and annotate PDF documents",
        "mimeType": "text/markdown"
      }
    ]
  }
}
```

Servers MAY additionally list supporting files in this response, but MUST at minimum list each `SKILL.md`. Clients enumerate the skills a server provides by filtering the response for URIs matching `skill://*/SKILL.md`.

Servers SHOULD also respond to `resources/list` with `uri` set to `skill://<skill-name>/` by listing all files within that skill directory, enabling clients to discover a skill's supporting files without reading `SKILL.md` first.

#### Capability Declaration

Per [SEP-2133] extension negotiation, servers declare support for this extension in their `initialize` response:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/skills": {}
    }
  }
}
```

No extension-specific settings are currently defined; an empty object indicates support.

### Reading

Skill files are read via the standard `resources/read` method. No skill-specific read semantics are defined.

Internal references within a skill (e.g., `SKILL.md` linking to `references/GUIDE.md`) are relative paths, as in the filesystem form of the Agent Skills specification. A client resolves a relative reference against the skill's root — `references/GUIDE.md` in `skill://pdf-processing/SKILL.md` resolves to `skill://pdf-processing/references/GUIDE.md` — exactly as a filesystem path would resolve.

## Implementation Guidelines

The following are recommendations for interoperable implementations. They are not part of the normative specification.

### Hosts: Model-Driven Resource Loading

Hosts SHOULD expose a tool to the model that reads MCP resources by server and URI, enabling the model to load skill content on demand:

```json
{
  "name": "read_resource",
  "description": "Read an MCP resource from a connected server.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "server": { "type": "string", "description": "Name of the connected MCP server" },
      "uri":    { "type": "string", "description": "The resource URI, e.g. skill://git-workflow/SKILL.md" }
    },
    "required": ["server", "uri"]
  }
}
```

Including the server name disambiguates identical `skill://` URIs served by different connected servers. This tool is general-purpose — it reads any MCP resource — and benefits resource use cases beyond skills.

The typical flow: the host calls `resources/list(uri="skill://")` on each connected server at initialization, surfaces the returned names and descriptions in the model's context, and the model calls `read_resource` when a skill is relevant to the task.

### Hosts: Unified Treatment of Filesystem and MCP Skills

Hosts that support both filesystem-based skills (loaded from local directories) and MCP-served skills SHOULD treat them identically, as though the set of connected servers' `skill://` resources were mounted into a virtual filesystem alongside local skill directories.

Concretely: the same discovery surface, the same loading tool, and the same relative-path resolution. A model that has learned to follow `references/GUIDE.md` from a local `SKILL.md` should find that MCP-served skills behave the same way. Divergence between the two paths is a source of model confusion and implementation complexity.

### SDKs: Convenience Wrappers

SDK maintainers SHOULD provide affordances that wrap the underlying resource operations in skill-specific terms. For example:

**Server-side** — declare a skill from a directory:

```python
@server.skill("git-workflow")
def git_workflow():
    return Path("./skills/git-workflow")  # directory containing SKILL.md
```

The SDK handles: reading `SKILL.md` frontmatter to populate resource metadata, registering a `skill://git-workflow/{+path}` resource template, responding to scoped `resources/list` calls, and serving file content on `resources/read`.

**Client-side** — enumerate and fetch skills:

```python
skills = await client.list_skills()           # wraps resources/list(uri="skill://")
content = await client.read_skill("git-workflow")  # wraps resources/read(uri="skill://git-workflow/SKILL.md")
```

These wrappers are thin — each is a single underlying protocol call with a fixed URI pattern — but they give server authors an ergonomic way to declare skills and give client authors a discoverable entry point.

## Rationale

### Why Resources Instead of a New Primitive?

The Interest Group's [decision log](decisions.md#2026-02-26-prioritize-skills-as-resources-with-client-helper-tools) records this as settled. Skills are files; Resources exist to expose files. Reusing Resources inherits URI addressability, `resources/read`, `resources/subscribe`, templates, and the existing client tooling for free. A new primitive would duplicate most of this and add [ecosystem complexity the community has explicitly pushed back on](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/14).

[SEP-2076] proposes the new-primitive alternative. That approach offers cleaner capability negotiation and dedicated list-changed notifications, but at the cost of flattening skills to name-addressed blobs — losing the directory model that the Agent Skills specification defines and that supporting files depend on.

### Why `skill://<name>/<file>` With an Explicit `SKILL.md`?

Four independent implementations converged on `skill://` as the scheme without coordination — a strong signal. They diverged on structure. The [URI scheme survey](skill-uri-scheme.md) evaluates each; this SEP adopts the FastMCP-style explicit-file structure because:

- It directly mirrors the Agent Skills specification's directory model. A skill _is_ a directory; its URI space should look like one.
- `SKILL.md` being explicit means supporting files are siblings at the same level, with no special casing for "the skill URI" versus "a file in the skill."
- Hosts implementing both filesystem and MCP skills can use one path-resolution codepath.

The cost — `SKILL.md` is always typed out rather than implied — is small, and the discovery response already points clients at the right URI.

### Why Delegate the Format to agentskills.io?

The Agent Skills specification already defines YAML frontmatter fields, naming rules, directory conventions, and the progressive-disclosure model. It has its own governance, contributing process, and multi-vendor participation. Redefining any of this in an MCP SEP would create a second source of truth and a drift risk. This SEP is a transport binding; the payload format is someone else's concern.

### Why Depend on SEP-2093?

Without scoped `resources/list`, a client discovers skills by calling unscoped `resources/list` and filtering the response for `skill://` URIs client-side. This works but is inefficient on servers with many non-skill resources and gives servers no signal to apply skill-specific listing behavior. [SEP-2093]'s `uri` parameter fixes both: the client asks specifically for skills, and the server knows it is being asked.

## Backward Compatibility

This extension introduces no new protocol methods, message types, or schema changes beyond those already proposed in [SEP-2093]. A server that does not implement this extension simply exposes no `skill://` resources; existing clients are unaffected. A client that does not implement this extension sees `skill://` resources as ordinary resources, which they are.

Existing implementations using other `skill://` URI structures (NimbleBrain's `skill://server/skill`, skilljack's implicit-`SKILL.md` `skill://name`) will need to adjust their URI paths to conform. These are small, mechanical changes, and the [survey](skill-uri-scheme.md#survey-of-existing-patterns) documents each implementation's current structure.

## Reference Implementation

Will be provided prior to reaching Final status.

## Security Implications

Skill content is instructional text delivered to a model, which makes it a prompt-injection surface. The Interest Group's position, recorded in [open-questions.md §10](open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries), is:

- **Trust inherits from the server.** A user who connects a server has already extended their trust boundary to it; a malicious server can cause more harm via tools than via a skill document. Skills do not introduce a new trust tier.
- **Skills are data, not directives.** Hosts MUST NOT treat `skill://` resources as higher-authority than other context. Explicit user policy governs whether a skill is loaded.
- **Provenance SHOULD be surfaced.** Hosts SHOULD indicate which server a skill originates from when presenting it, and MAY let users approve skills per-server.
- **Not a third-party marketplace.** This extension is for servers to ship skills that describe their own tools, not for distributing arbitrary third-party content through a connected server.

The instructor-only scope of this extension ([decisions.md, 2026-02-14](decisions.md#2026-02-14-skills-served-over-mcp-use-the-instructor-format)) excludes the helper model of local code execution, which bounds the attack surface to text that influences model behavior rather than code that executes on the host.

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [SEP-2093]: Resource Contents Metadata and Capabilities
- [SEP-2133]: Extensions
- [SEP-2076]: Agent Skills as first-class primitive (alternative approach)
- [Skill URI Scheme Proposal](skill-uri-scheme.md) — survey of existing patterns and recommended convention
- [Decision Log](decisions.md) — Interest Group decisions and rationale
- [Experimental Findings](experimental-findings.md) — results from implementations
- [RFC 3986: URIs](https://datatracker.ietf.org/doc/html/rfc3986)

[SEP-2076]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076
[SEP-2093]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093
[SEP-2133]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2133
