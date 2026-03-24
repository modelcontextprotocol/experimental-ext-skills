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

This SEP defines a convention for serving [Agent Skills](https://agentskills.io/) over MCP using the existing Resources primitive. A _skill_ is a directory of files (minimally a `SKILL.md`) that provides structured workflow instructions to an agent. This extension specifies that each file in a skill directory is exposed as an MCP resource under the `skill://` URI scheme. Skills are addressed by URI and may be read directly; enumeration via a well-known `skill://index.json` resource and discovery via resource templates are supported but not required, accommodating servers whose skill catalogs are large, generated, or otherwise unenumerable. The skill format itself — directory structure, YAML frontmatter, naming rules, and the [progressive disclosure](https://agentskills.io/specification#progressive-disclosure) model that governs how hosts stage content into context — is delegated entirely to the [Agent Skills specification](https://agentskills.io/specification); this SEP defines only the transport binding.

Because the extension adds no new protocol methods or capabilities, hosts that already treat MCP resources as a virtual filesystem can consume MCP-served skills identically to local filesystem skills. The specification is accompanied by implementation guidelines for host-provided resource-reading tools and SDK-level convenience wrappers.

## Motivation

Native skills support in host applications demonstrates strong demand for rich, progressively disclosed workflow instructions. MCP does not currently offer a conventional way to ship this content alongside the tools it describes, which leads to:

- **Fragmented distribution.** A server and the skill that teaches an agent to use it are versioned, discovered, and installed separately. Users installing a server from a registry have no signal that a companion skill exists. ([problem-statement.md](problem-statement.md))
- **Instruction size limits.** Server instructions load once at initialization and are practically bounded in size. Complex workflows — such as the 875-line [mcpGraph skill](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) — do not fit this model. ([experimental-findings.md](experimental-findings.md#mcpgraph-skills-in-mcp-server-repo))
- **Inconsistent ad-hoc solutions.** Absent a convention, four independent implementations have each invented their own `skill://` URI structure, with diverging semantics for authority, path, and sub-resource addressing.

## Specification

### Dependencies

This extension has no dependencies beyond the base MCP Resources primitive.

### Skill Format

A skill served over MCP MUST conform to the [Agent Skills specification](https://agentskills.io/specification). In particular:

- A skill is a directory. Its _skill name_ is the value of the `name` field in its `SKILL.md` frontmatter.
- Every skill MUST contain a `SKILL.md` file at its root.
- `SKILL.md` MUST begin with YAML frontmatter containing at minimum the `name` and `description` fields as defined by the Agent Skills specification.
- A skill MAY contain additional files and subdirectories (references, scripts, examples, assets).

This extension does not redefine, constrain, or extend the skill format. Future revisions of the Agent Skills specification apply automatically.

### Resource Mapping

Each file within a skill directory is exposed as an MCP resource under the `skill://` scheme. The resource URI has the form:

```
skill://<skill-path>/<file-path>
```

where:

- `<skill-path>` is a `/`-separated path of one or more segments locating the skill directory within the server's skill namespace. It MAY be a single segment (`git-workflow`) or nested to arbitrary depth (`acme/billing/refunds`).
- `<file-path>` is the file's path relative to the skill directory root, using `/` as the separator.

The resource for the skill's required `SKILL.md` is therefore always addressable as `skill://<skill-path>/SKILL.md`, and the skill's root directory is the URI obtained by stripping the trailing `SKILL.md`.

The final segment of `<skill-path>` MUST equal the skill's `name` as declared in its `SKILL.md` frontmatter. This mirrors the Agent Skills specification's requirement that `name` [match the parent directory name](https://agentskills.io/specification#name-field). Preceding segments, if any, are a server-chosen organizational prefix — servers MAY organize skills hierarchically by domain, team, version, or any other axis. In `skill://acme/billing/refunds/SKILL.md`, the prefix is `acme/billing` and the skill's `name` is `refunds`; in `skill://git-workflow/SKILL.md` there is no prefix and the `name` is `git-workflow`. This means the skill name is always recoverable from the URI alone, without reading frontmatter.

Further constraints:

- A `SKILL.md` MUST NOT appear in any descendant directory of a skill. The skill directory is the boundary; skills do not nest inside other skills.
- The final `<skill-path>` segment, being the skill `name`, MUST satisfy the Agent Skills specification's naming rules. Prefix segments SHOULD be valid URI path segments per [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986); no further constraints are imposed on them.

Per RFC 3986, the first segment of `<skill-path>` occupies the authority component. This carries no special semantics under this convention and clients MUST NOT attempt DNS or network resolution of it.

#### Examples

| Skill path | File | Resource URI |
|---|---|---|
| `git-workflow` | `SKILL.md` | `skill://git-workflow/SKILL.md` |
| `pdf-processing` | `references/FORMS.md` | `skill://pdf-processing/references/FORMS.md` |
| `pdf-processing` | `scripts/extract.py` | `skill://pdf-processing/scripts/extract.py` |
| `acme/billing/refunds` | `SKILL.md` | `skill://acme/billing/refunds/SKILL.md` |
| `acme/billing/refunds` | `templates/email.md` | `skill://acme/billing/refunds/templates/email.md` |

#### Resource Metadata

For each `skill://<skill-path>/SKILL.md` resource:

- `mimeType` SHOULD be `text/markdown`.
- `name` SHOULD be set from the `name` field of the `SKILL.md` YAML frontmatter. By the path constraint above, this will equal the final segment of `<skill-path>`.
- `description` SHOULD be set from the `description` field of the `SKILL.md` YAML frontmatter.

Servers MAY expose additional frontmatter fields via the resource's `_meta` object. Other files in the skill use the `mimeType` appropriate to their content.

### Discovery

A server is not required to make its skills enumerable. A `skill://` URI is directly readable via `resources/read` whether or not it appears in any index, and hosts MUST support loading a skill given only its URI (see [Hosts: Model-Driven Resource Loading](#hosts-model-driven-resource-loading)). This is the baseline: if a model has the URI — from server instructions, from another skill, from the user — it can read the skill.

On top of that baseline, three discovery mechanisms are defined. A server MAY support any combination.

#### Enumeration via `skill://index.json`

A server whose skill set is enumerable SHOULD expose a resource at the well-known URI `skill://index.json` whose content is a JSON index of available skills. The index format follows the [Agent Skills well-known URI discovery index](https://agentskills.io/well-known-uri#index-format), with two differences: the `url` field contains the full `skill://` URI of the skill's `SKILL.md`, and the `digest` field is omitted (integrity is the transport's concern over an authenticated MCP connection).

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "skills": [
    {
      "name": "git-workflow",
      "type": "skill-md",
      "description": "Follow this team's Git conventions for branching and commits",
      "url": "skill://git-workflow/SKILL.md"
    },
    {
      "name": "refunds",
      "type": "skill-md",
      "description": "Process customer refund requests per company policy",
      "url": "skill://acme/billing/refunds/SKILL.md"
    }
  ]
}
```

Index fields:

| Field | Required | Description |
|---|---|---|
| `$schema` | Yes | Schema version URI. Clients SHOULD match against known URIs before processing. |
| `skills` | Yes | Array of skill entries. |
| `skills[].name` | Yes | The skill's `name`, matching its `SKILL.md` frontmatter and the final segment of its `<skill-path>`. |
| `skills[].description` | Yes | The skill's `description`, matching its `SKILL.md` frontmatter. |
| `skills[].type` | Yes | MUST be `"skill-md"` in the MCP context. Archive distribution does not apply; supporting files are individually addressable as resources. |
| `skills[].url` | Yes | The full `skill://<skill-path>/SKILL.md` URI. |

Clients SHOULD ignore unrecognized fields and SHOULD skip entries with an unrecognized `type`.

The `skill://index.json` resource is served via `resources/read` like any other resource, with `mimeType` of `application/json`. A server MAY also surface it in `resources/list` so clients can detect its presence, but clients MAY attempt to read it directly without prior discovery.

A server whose skill catalog is large, generated on demand, or otherwise unenumerable MAY decline to expose `skill://index.json`, or MAY expose a partial index. Hosts MUST NOT treat an absent or empty index as proof that a server has no skills.

The URI `skill://index.json` is reserved and does not conflict with any valid `<skill-path>`: skill names may contain only lowercase letters, digits, and hyphens, so `index.json` cannot be a skill name.

#### Discovery via Resource Templates

Servers MAY register one or more [resource templates](https://modelcontextprotocol.io/specification/2025-11-25/server/resources#resource-templates) with a `skill://` URI template, enabling hosts to discover the shape of the server's skill namespace and, where the template variables are completable, to enumerate skills interactively:

```json
{
  "resourceTemplates": [
    {
      "uriTemplate": "skill://docs/{product}/SKILL.md",
      "name": "Product documentation skill",
      "description": "Usage guidance for a named product",
      "mimeType": "text/markdown"
    },
    {
      "uriTemplate": "skill://acme/{domain}/{workflow}/SKILL.md",
      "name": "Acme workflow skill",
      "description": "Domain-specific workflow instructions"
    }
  ]
}
```

Resource templates are primarily a user-facing discovery mechanism. Hosts SHOULD recognize resource templates whose `uriTemplate` begins with `skill://` as skill discovery points and surface them in the host UI, wiring template variables to the MCP [completion API](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion) so the user can interactively fill in values and browse available skills. The user selects a skill; the host passes the resolved URI into the conversation.

This mechanism scales to servers with unbounded skill catalogs: the template describes the addressable space without requiring the server to materialize every entry, and completion narrows it as the user types.

#### Pointer from Server Instructions

A server MAY direct the agent to specific `skill://` URIs from its `instructions` field. This requires no discovery machinery on the host; the URI is simply present in the model's context and readable via `resources/read`.

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

Internal references within a skill (e.g., `SKILL.md` linking to `references/GUIDE.md`) are relative paths, as in the filesystem form of the Agent Skills specification. A client resolves a relative reference against the skill's root — `references/GUIDE.md` in `skill://acme/billing/refunds/SKILL.md` resolves to `skill://acme/billing/refunds/references/GUIDE.md` — exactly as a filesystem path would resolve. The skill's root is the directory containing `SKILL.md`, not the `skill://` scheme root.

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

The signature shown is illustrative. Including the server name is one disambiguation strategy for identical `skill://` URIs served by different connected servers; hosts MAY instead prefix URIs on conflict, scope by session, or use any other scheme appropriate to their architecture. The tool is general-purpose — it reads any MCP resource — and benefits resource use cases beyond skills.

Hosts SHOULD load the frontmatter (`name`, `description`) of available and enabled skills into the model's context so the model can judge relevance and construct a `read_resource` call when a skill applies. Hosts SHOULD surface available skills in their UI for user inspection and per-skill enable/disable, analogous to how tools are typically exposed.

A typical flow: the host reads `skill://index.json` from each connected server and surfaces the `name` and `description` of each entry in the model's context. The model calls `read_resource` with a concrete URI — one returned by enumeration, one handed to it by the user (who may have found it via a `skill://` resource template in the host UI), or one obtained out-of-band — when a skill is relevant to the task.

Because enumeration is optional, a `read_resource` call for a `skill://` URI that the host has never seen listed is normal and expected. The host forwards it to the named server; the server either serves the resource or returns a not-found error.

### Hosts: Unified Treatment of Filesystem and MCP Skills

Hosts that support both filesystem-based skills (loaded from local directories) and MCP-served skills SHOULD treat them identically, as though the set of connected servers' `skill://` resources were mounted into a virtual filesystem alongside local skill directories.

Concretely: the same discovery surface, the same loading tool, and the same relative-path resolution. A model that has learned to follow `references/GUIDE.md` from a local `SKILL.md` should find that MCP-served skills behave the same way. Divergence between the two paths is a source of model confusion and implementation complexity.

### SDKs: Convenience Wrappers

SDK maintainers SHOULD provide affordances that wrap the underlying resource operations in skill-specific terms. For example:

**Server-side** — declare a skill from a directory, at a given path:

```python
@server.skill("git-workflow")                 # → skill://git-workflow/SKILL.md
def git_workflow():
    return Path("./skills/git-workflow")

@server.skill("acme/billing/refunds")         # → skill://acme/billing/refunds/SKILL.md
def refunds():
    return Path("./skills/refunds")
```

The SDK handles: reading `SKILL.md` frontmatter to populate resource metadata, registering a `skill://<skill-path>/{+path}` resource template, serving file content on `resources/read`, and (where the server's skill set is bounded) generating the `skill://index.json` resource.

**Client-side** — enumerate and fetch skills:

```python
skills = await client.list_skills()               # reads skill://index.json, may be empty or absent
content = await client.read_skill_uri(
    "skill://acme/billing/refunds/SKILL.md")      # wraps resources/read, works regardless of enumeration
```

These wrappers are thin — each is a single underlying protocol call with a fixed URI pattern — but they give server authors an ergonomic way to declare skills and give client authors a discoverable entry point.

## Rationale

### Why Resources Instead of a New Primitive?

The Interest Group's [decision log](decisions.md#2026-02-26-prioritize-skills-as-resources-with-client-helper-tools) records this as settled. Skills are files; Resources exist to expose files. Reusing Resources inherits URI addressability, `resources/read`, `resources/subscribe`, templates, and the existing client tooling for free. A new primitive would duplicate most of this and add ecosystem complexity — a concern raised in [community discussion](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/14).

[SEP-2076] proposes the new-primitive alternative. That approach offers cleaner capability negotiation and dedicated list-changed notifications, but at the cost of flattening skills to name-addressed blobs — losing the directory model that the Agent Skills specification defines and that supporting files depend on.

### Why `skill://<path>/<file>` With an Explicit `SKILL.md`?

Four independent implementations converged on `skill://` as the scheme without coordination — a strong signal. They diverged on structure. This SEP adopts the explicit-file form because:

- It directly mirrors the Agent Skills specification's directory model. A skill _is_ a directory; its URI space should look like one.
- `SKILL.md` being explicit means supporting files are siblings at the same level, with no special casing for "the skill URI" versus "a file in the skill."
- Hosts implementing both filesystem and MCP skills can use one path-resolution codepath.

The cost — `SKILL.md` is always typed out rather than implied — is small, and where discovery is supported the response already points clients at the right URI.

### Why Allow a Path Prefix But Constrain the Final Segment?

Earlier drafts required `<skill-path>` to be a single segment equal to the frontmatter `name`. That breaks down when a server needs hierarchy: an organization serving both `acme/billing/refunds` and `acme/support/refunds` cannot satisfy "single segment" without renaming one skill to dodge the collision. Allowing a prefix (`acme/billing/`, `acme/support/`) solves this — both skills can be named `refunds` and the prefix disambiguates.

A subsequent draft went further and fully decoupled the path from the name. That was too loose: a URI like `skill://a/b/c/SKILL.md` tells you nothing about what the skill is called until you fetch and parse frontmatter. Clients listing skills, hosts displaying them in a picker, and models reasoning over URIs all want the name visible without a round trip.

Constraining the final segment to match the frontmatter `name` gets both properties. The prefix carries the server's organizational structure; the final segment carries the skill's identity; and the two together form a locator from which the name can be read directly.

### Why Is Enumeration Optional?

Requiring every server to expose a complete `skill://index.json` fails for at least three server shapes: a documentation server that synthesizes a skill per API endpoint (thousands), a skill gateway fronting an external index (unbounded), and a server that generates skills from templates parameterized at read time (unenumerable by construction). For these, the list is either too large to be useful in the model's context or does not meaningfully exist.

The baseline is therefore direct readability — a `skill://` URI is always a valid argument to `resources/read`. Enumeration and template discovery are layered on top for servers where they make sense. A host that assumes enumeration is exhaustive will miss skills on servers where it is not, hence the requirement that hosts MUST NOT treat empty enumeration as proof of absence.

### Why Delegate the Format to agentskills.io?

The Agent Skills specification already defines YAML frontmatter fields, naming rules, directory conventions, and the progressive-disclosure model. It has its own governance, contributing process, and multi-vendor participation. Redefining any of this in an MCP SEP would create a second source of truth and a drift risk. This SEP is a transport binding; the payload format is someone else's concern.

### Why an Index Resource Rather Than `resources/list`?

An earlier draft enumerated skills via a scoped `resources/list(uri="skill://")` call. Moving to a well-known index resource aligns discovery with the Agent Skills [well-known URI index](https://agentskills.io/well-known-uri) — the same JSON shape, the same schema URI, the same client-side parsing. A host that already consumes `.well-known/agent-skills/index.json` over HTTP can consume `skill://index.json` over MCP with the same code. It also drops the dependency on scoped `resources/list` (which the base spec does not guarantee), leaving this extension with zero protocol dependencies beyond `resources/read`.

## Backward Compatibility

This extension introduces no new protocol methods, message types, or schema changes. A server that does not implement this extension simply exposes no `skill://` resources; existing clients are unaffected. A client that does not implement this extension sees `skill://` resources as ordinary resources, which they are.

Existing implementations using other `skill://` URI structures (NimbleBrain's `skill://server/skill`, skilljack's implicit-`SKILL.md` `skill://name`) will need to adjust their URI paths to conform. These are small, mechanical changes.

## Reference Implementation

Will be provided prior to reaching Final status.

## Security Implications

Skill content is instructional text delivered to a model, which makes it a prompt-injection surface. The Interest Group's position, recorded in [open-questions.md §10](open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries), is:

- **Skill content is untrusted input.** Hosts MUST treat `skill://` resource content as untrusted model input, subject to the same prompt-injection defenses applied to any server-provided text. A server being connected does not make its skill content authoritative.
- **Skills do not introduce a new trust tier.** A user who connects a server has already extended their trust boundary to it; a malicious server can do as much harm via tools as via a skill document. Serving skills over MCP adds no risk beyond what skills already carry in any transport — but the defensive posture above applies regardless.
- **No implicit local execution.** Hosts MUST NOT honor mechanisms in skill content that would cause local code execution without explicit user opt-in. This includes, non-exhaustively: hook declarations, pre/post-invocation scripts, shell commands embedded in frontmatter, or any field that a filesystem-sourced skill might use to register executable behavior on the host. Hosts MUST either ignore such fields entirely when the skill arrives over MCP, or gate them behind an explicit per-skill user approval that states what will execute and where. Silently executing server-provided code because it appeared in a skill directory is a remote code execution vector.
- **Skills are data, not directives.** Hosts MUST NOT treat `skill://` resources as higher-authority than other context. Explicit user policy governs whether a skill is loaded at all.
- **Provenance and inspection.** Hosts SHOULD indicate which server a skill originates from when presenting it, SHOULD let users inspect a skill's content before it is loaded into model context, and MAY gate loading behind per-skill or per-server user approval.
- **Not a third-party marketplace.** This extension is for servers to ship skills that describe their own tools, not for distributing arbitrary third-party content through a connected server.

The instructor-only scope of this extension ([decisions.md, 2026-02-14](decisions.md#2026-02-14-skills-served-over-mcp-use-the-instructor-format)) deliberately excludes the helper model. A filesystem skill might reasonably carry scripts the user has audited; an MCP skill arrives from a remote party and MUST be handled as text that influences model behavior, not as code that executes on the host.

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [Agent Skills well-known URI discovery](https://agentskills.io/well-known-uri)
- [SEP-2133]: Extensions
- [SEP-2076]: Agent Skills as first-class primitive (alternative approach)
- [Decision Log](decisions.md) — Interest Group decisions and rationale
- [Experimental Findings](experimental-findings.md) — results from implementations
- [RFC 3986: URIs](https://datatracker.ietf.org/doc/html/rfc3986)

[SEP-2076]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076
[SEP-2133]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2133
