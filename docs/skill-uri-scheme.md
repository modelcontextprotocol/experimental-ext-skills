# Skill URI Scheme Proposal

> Proposed convention for identifying skill resources over MCP.

**Issue:** [#44](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/44)
**Status:** Draft

---

## Summary

This document surveys existing URI patterns for skill resources across implementations, analyzes their trade-offs, and proposes a recommended `skill://` URI scheme for the MCP Skills Convention.

## Survey of Existing Patterns

### 1. NimbleBrain: `skill://server-name/skill-name`

**Pattern:** `skill://{authority}/{path}`

NimbleBrain uses `skill://` URIs where the authority segment identifies the server or domain, and the path identifies the skill within that server.

```
skill://ipinfo/usage
```

Skills are registered as MCP resources using FastMCP's `@mcp.resource()` decorator. The server instructions direct the agent to read the skill resource before using tools:

```python
mcp = FastMCP("IPInfo", instructions=(
    "Before using IPInfo tools, read the skill://ipinfo/usage resource "
    "for tool selection guidance and context reuse patterns."
))

@mcp.resource("skill://ipinfo/usage")
def ipinfo_skill() -> str:
    return SKILL_CONTENT
```

**Discovery:** Via `resources/list` — skills appear alongside other resources.

**Pros:**
- Clean, human-readable URIs
- Authority segment naturally scopes skills to a server
- Already deployed in production across multiple servers ([mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search))
- Skills colocated with the tools they describe — versioned and shipped atomically
- Ephemeral availability: context present while server is connected, gone when disconnected

**Cons:**
- Authority segment usage varies across implementations (server name vs. skill name)
- No versioning in the URI
- No formal convention for sub-resources (references, scripts)
- Departs from the Agent Skills spec model where a skill is a directory containing at least `SKILL.md` — skills are exposed as flat, opaque resources with no directory structure

### 2. skilljack-mcp: `skill://{skillName}` with directory collections

**Pattern:** `skill://{skillName}` (no authority)

Skilljack uses `skill://` URIs where the skill name is placed directly after the scheme, without an authority segment. It also defines a directory collection pattern using a trailing slash:

```
skill://code-style              # SKILL.md content
skill://code-style/             # All files in skill directory (collection)
skill://code-style/reference.md # Individual file (accessed via tool, not listed)
```

**Discovery:** Via `resources/list` with resource templates (`skill://{skillName}`). Includes `_meta` annotations for skill metadata.

**Pros:**
- Simple, minimal URIs for the common case
- Directory collection pattern (`/`) efficiently bundles all files
- Resource templates enable auto-completion via MCP's completion API
- Separates listed resources from tool-accessible files to reduce noise

**Cons:**
- No authority segment means no built-in scoping across multiple servers
- Skill names must be globally unique within a client session
- `SKILL.md` is implicit in the base URI (`skill://code-style`) — diverges from the Agent Skills spec directory model where `SKILL.md` is an explicit file within the skill directory

### 3. skills-over-mcp: `skill://{skillName}` with index and templates

**Pattern:** `skill://{skillName}` plus well-known index URIs

Keith Groves' implementation uses a richer set of `skill://` URIs including an index resource and lookup templates:

```
skill://index                           # JSON listing all skills
skill://prompt-xml                      # XML for system prompt injection
skill://code-review                     # Skill SKILL.md content
skill://code-review/documents           # JSON list of supporting documents
skill://code-review/document/SECURITY.md  # Individual document
skill://lookup/{name}                   # Dynamic lookup by name (template)
```

**Discovery:** Via `skill://index` resource (returns JSON array of all skills with URIs) and `resources/list`.

**Pros:**
- Index resource provides structured discovery separate from `resources/list`
- Document sub-paths provide progressive disclosure
- Resource templates with completion support enable dynamic lookup
- XML prompt injection resource for system prompt integration

**Cons:**
- Multiple overlapping discovery mechanisms (index + lookup template + resources/list)
- More complex URI space to learn and implement
- No authority segment
- `SKILL.md` is implicit in the base URI (`skill://code-review`) — diverges from the Agent Skills spec directory model

### 4. FastMCP 3.0: `skill://{skillName}/SKILL.md` with manifest

**Pattern:** `skill://{skillName}/{filePath}`

FastMCP 3.0 uses a file-path-based URI structure where every file within a skill directory gets its own URI, including a synthetic manifest:

```
skill://pdf-processing/SKILL.md        # Main instruction file
skill://pdf-processing/_manifest       # Synthetic JSON manifest (sizes + SHA-256)
skill://pdf-processing/reference.md    # Supporting file
skill://pdf-processing/examples/sample.pdf  # Nested supporting file
```

**Discovery:** Via `resources/list` (configurable disclosure level). Client utilities (`list_skills`, `download_skill`, `sync_skills`) provide higher-level access.

**Pros:**
- File-path structure is intuitive and predictable
- Most compatible with the Agent Skills spec model — URIs directly reflect the directory structure (`skill://name/SKILL.md`, `skill://name/references/...`)
- Manifest with SHA-256 hashes enables integrity verification
- Configurable disclosure: `"template"` (minimal listing) vs. `"resources"` (all files listed)
- SDK-level utilities for listing, downloading, and syncing skills
- Built-in providers for multiple skill directory conventions (Claude, Cursor, Codex, VS Code)

**Cons:**
- `SKILL.md` is always explicit in the URI (more verbose for the common case)
- File-path structure couples the URI to the internal directory layout
- No authority segment for multi-server scoping

### 5. Agent Skills Discovery RFC: `/.well-known/skills/{name}/SKILL.md`

**Pattern:** HTTPS URLs under `/.well-known/skills/`

The Cloudflare RFC defines domain-level discovery via HTTP, not a custom URI scheme. Skills are regular HTTPS resources at well-known paths:

```
https://example.com/.well-known/skills/index.json
https://example.com/.well-known/skills/wrangler/SKILL.md
https://example.com/.well-known/skills/wrangler/scripts/deploy.sh
```

**Discovery:** Fetch `/.well-known/skills/index.json` which lists all skills with name, description, and file inventory.

**Pros:**
- No custom URI scheme — uses standard HTTPS
- Domain-level trust model (organizational identity)
- Progressive disclosure built into the spec (3 levels)
- File inventory in index enables prefetching and caching
- Complementary to MCP (discovery and distribution vs. runtime consumption)

**Cons:**
- Not an MCP resource URI scheme — designed for HTTP-level discovery
- Requires organizations to host web endpoints
- Not directly usable as an MCP resource URI

### 6. SEP-2076: `skills/list` and `skills/get`

**Pattern:** New protocol primitive, not URI-based

SEP-2076 proposes skills as a first-class MCP primitive with dedicated methods rather than a URI scheme:

```json
// skills/list response
{
  "skills": [{
    "name": "git-workflow",
    "description": "Follow team Git conventions",
    "tags": ["git", "workflow"]
  }]
}

// skills/get request
{ "name": "git-workflow" }
```

**Discovery:** Via `skills/list` method (dedicated, not via `resources/list`).

**Pros:**
- Clean separation from other resource types
- Dedicated capability and notification support
- No URI collision concerns

**Cons:**
- Requires protocol-level changes (new methods, capabilities)
- Adds a new primitive when resources may suffice
- Not yet accepted into the MCP spec
- Flattens skills to a name-addressed blob — does not model the Agent Skills spec's directory structure (skill as a directory containing `SKILL.md` plus optional supporting files)

## Comparison Matrix

| Pattern | URI Scheme | Authority | Versioning | Sub-resources | Templates | MCP-native |
|---------|-----------|-----------|------------|---------------|-----------|------------|
| NimbleBrain | `skill://` | Server name | No | No | No | Yes |
| skilljack-mcp | `skill://` | None | No | `/` collection | Yes | Yes |
| skills-over-mcp | `skill://` | None | No | `/document/` path | Yes | Yes |
| FastMCP 3.0 | `skill://` | None | No | File paths | Configurable | Yes |
| Well-Known RFC | `https://` | Domain | No | File paths | N/A | No |
| SEP-2076 | N/A | N/A | N/A | N/A | N/A | New primitive |

## Analysis

### Points of Convergence

All MCP-native implementations have independently converged on `skill://` as the URI scheme. This is a strong signal — four independent implementations chose the same scheme without coordination.

The divergence is in URI structure, specifically:

1. **Authority segment**: NimbleBrain uses it (server name); all others omit it.
2. **Path structure**: Ranges from minimal (`skill://name`) to file-path-based (`skill://name/SKILL.md`).
3. **Sub-resource access**: Different patterns for accessing supporting files.
4. **Discovery**: Some use `resources/list` alone; others add index resources or templates.

### Key Design Decisions

**1. Should the URI include an authority segment?**

In RFC 3986, the authority component (`scheme://authority/path`) is semantically a host identifier. A skill name is not a host. However, all four existing MCP implementations use `skill://name` (double slash), placing the skill name in the authority position. While not semantically precise, this is established practice, produces clean URIs, and works well with MCP-aware parsers that don't need to resolve the authority as a network host.

**Recommendation:** Follow existing practice. Use `skill://skill-name/...` (double slash), with the convention that the first path-like segment identifies the skill. This matches all existing implementations and avoids the awkward triple-slash (`skill:///`) form.

**2. Should `SKILL.md` be explicit in the URI?**

FastMCP includes `SKILL.md` in every skill content URI. Other implementations treat the skill name itself as the content URI, with `SKILL.md` implicit.

Making `SKILL.md` explicit mirrors the directory structure and aligns with the Agent Skills spec, which defines a skill as a directory containing at least `SKILL.md`. Omitting it creates an abstraction that diverges from the spec and makes the relationship between the URI and the underlying skill format ambiguous.

**Recommendation:** `SKILL.md` MUST be explicit in the URI. The primary skill content is always at `skill://name/SKILL.md`. This keeps the URI structure aligned with the Agent Skills spec and makes the directory model visible. Sub-resources are siblings at the same level (e.g., `skill://name/references/GUIDE.md`).

**3. How should sub-resources (references, scripts) be addressed?**

Multiple patterns exist: trailing-slash collections (skilljack), `/document/` subpath (skills-over-mcp), direct file paths (FastMCP), and no sub-resource support (NimbleBrain).

**Recommendation:** Use path-based sub-resource addressing for consistency with other URI schemes.

## Proposed Convention

### URI Scheme: `skill://`

All skill resources MUST use the `skill://` URI scheme.

### URI Structure

```
skill://skill-name/SKILL.md
skill://skill-name/[path]
```

Following [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986) structure:

- **Scheme:** `skill`
- **First path segment:** The skill name, identifying which skill directory is being addressed.
- **Subsequent path segments:** `SKILL.md` for the primary content, or a relative path for supporting files.

### Naming Rules

Skill names in the path MUST:
- Be 1-64 characters
- Use lowercase alphanumeric characters and hyphens only (`a-z`, `0-9`, `-`)
- Not start or end with a hyphen
- Not contain consecutive hyphens

These rules align with the [Agent Skills specification naming rules](https://agentskills.io/specification#name-field) and DNS label conventions.

### URI Patterns

#### Single skill

```
skill://git-workflow/SKILL.md
```

The primary skill content is always at `SKILL.md` within the skill's path, matching the Agent Skills spec directory model.

#### Sub-resources

```
skill://pdf-processing/SKILL.md              # Primary skill content (required)
skill://pdf-processing/references/FORMS.md   # Supporting document
skill://pdf-processing/scripts/extract.py    # Supporting script
```

Supporting files are addressed by appending their path relative to the skill directory.

#### Resource templates

```
skill://{skill_name}/SKILL.md               # Template for skill content
skill://{skill_name}/{+path}                # Template for any file in the skill directory
```

Servers SHOULD register resource templates to enable auto-completion via MCP's completion API.

### Examples

| Use Case | URI | Notes |
|----------|-----|-------|
| Basic skill | `skill://git-workflow/SKILL.md` | Primary skill content |
| Supporting document | `skill://code-review/references/SECURITY.md` | Sub-resource within skill directory |
| Supporting script | `skill://pdf-processing/scripts/extract.py` | Executable sub-resource |

### How Clients Identify Skills

Clients can identify skill resources in `resources/list` responses by:

1. **URI scheme:** Resources with URIs starting with `skill://` are skill resources.
2. **MIME type:** Skill SKILL.md content SHOULD use `text/markdown`.
3. **Annotations:** Servers MAY use the `_meta` field for additional skill metadata.

This allows clients to filter, surface, and treat skills distinctly from other resources without requiring a new primitive.

### MCP Spec Alignment

The `skill://` scheme is a custom URI scheme as permitted by the MCP specification:

> Custom URI schemes **MUST** be in accordance with [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986).

The proposed scheme follows RFC 3986 structure. It uses existing MCP primitives (`resources/list`, `resources/read`, resource templates, subscriptions) without requiring protocol changes.

## References

- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [RFC 3986: URIs](https://datatracker.ietf.org/doc/html/rfc3986)
- [RFC 6570: URI Templates](https://datatracker.ietf.org/doc/html/rfc6570)
- [Agent Skills specification](https://agentskills.io/specification)
- [Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)
- [NimbleBrain skill:// findings](experimental-findings.md#nimblebrain-skill-resource-consolidation)
- [Approach 6: Official Convention](approaches.md#6-official-convention-as-intermediate-step)
