# mcp-experimental-ext-skills

Python SDK for the [MCP Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) (SEP-2640).

> **Status: experimental.** API surface tracks the SEP and may change between 0.x releases.

A skill is a directory containing a `SKILL.md` and (optionally) supporting files. This SDK serves skills as MCP resources from a Python server, and discovers/reads them from a Python client. The wire protocol is standard MCP — `resources/list` and `resources/read` — with the conventions defined in SEP-2640.

## Installation

```bash
pip install mcp-experimental-ext-skills
```

## Server: register skills as MCP resources

Bulk registration — discover every skill under a directory tree:

```python
from mcp.server.fastmcp import FastMCP
from mcp_experimental_ext_skills import SKILLS_EXTENSION_CAPABILITY
from mcp_experimental_ext_skills.server import (
    discover_skills,
    register_skill_resources,
)

mcp = FastMCP(
    "my-skills-server",
    experimental_capabilities=SKILLS_EXTENSION_CAPABILITY,
)

skills = discover_skills("./skills")
register_skill_resources(mcp, skills, "./skills")

if __name__ == "__main__":
    mcp.run()
```

Or single-skill registration — declare each skill explicitly with the URI path you want it served at (matches the [SEP §SDKs](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) decorator example):

```python
from mcp_experimental_ext_skills.server import register_skill

register_skill(mcp, "git-workflow", "./skills/git-workflow")
register_skill(mcp, "acme/billing/refunds", "./skills/refunds")
```

`discover_skills` recursively scans for `SKILL.md` files at any depth, parses YAML frontmatter, validates the SEP constraint that the final segment of each skill's path must equal its frontmatter `name`, validates the Agent Skills naming rules (lowercase letters, digits, hyphens), and enforces no-nesting (a `SKILL.md` cannot be an ancestor of another).

`register_skill_resources` registers, for each discovered skill:

- `skill://<skill-path>/SKILL.md` — the skill content (one per skill).
- `skill://<skill-path>/<file-path>` — one static resource per supporting file under the skill directory. (FastMCP's template matcher does not support RFC 6570 reserved expansion, so the SDK registers each file individually rather than via a `skill://{+skillFilePath}` catch-all template. The wire-visible URI namespace is identical.)

Plus, always:

- `skill://index.json` — the discovery index in the [Agent Skills well-known format](https://agentskills.io/well-known-uri).

Plus, optionally:

- One `mcp-resource-template` per `templates=[...]` declaration with a `read` callback (and per-variable `complete` callbacks wired to the MCP completion API).
- One archive resource per `archives=[...]` declaration (`.tar.gz` or `.zip`).

## Client: discover and read skills

```python
import asyncio
from mcp.client.session import ClientSession
from mcp_experimental_ext_skills.client import (
    discover_and_build_catalog,
    read_skill_uri,
    read_skill_archive,
)


async def main(session: ClientSession) -> None:
    result = await discover_and_build_catalog(session, server_name="my-skills-server")
    print(result.catalog)

    for skill in result.skills:
        if skill.type == "archive":
            archive = await read_skill_archive(session, skill.uri)
            print(skill.name, ":", len(archive.files), "files")
        else:
            content = await read_skill_uri(session, skill.uri)
            print(skill.name, ":", content[:80], "...")
```

`discover_and_build_catalog` reads `skill://index.json` (the SEP's authoritative discovery mechanism), falls back to `resources/list` filtered for `skill://` URIs if the index is unavailable, and returns both the discovered skills and a system-prompt catalog string ready for context injection.

## SEP conformance

The SDK follows SEP-2640 strictly:

- **`skill://` URI scheme** with multi-segment paths. The final segment equals the skill's frontmatter `name`; preceding segments are organizational prefix.
- **`skill://index.json`** — well-known discovery resource; format follows `https://schemas.agentskills.io/discovery/0.2.0/schema.json`.
- **Three index entry types**: `skill-md`, `archive`, `mcp-resource-template`.
- **Capability declaration**: `io.modelcontextprotocol/skills`.
- **Archive support**: `.tar.gz` (`application/gzip`) and `.zip` (`application/zip`) with the SEP's archive safety rules — reject path traversal, absolute paths, drive letters, symlinks resolving outside the skill directory, decompression bombs. In-scope tar symlinks are preserved on `UnpackedSkillArchive.symlinks`.
- **Scheme-agnostic client**: per the SEP, index entries may use any URI scheme. `read_skill_uri`, `discover_skills`, and `build_skills_catalog` work with any scheme; `read_skill_content` and `read_skill_document` always emit `skill://`.
- **`_meta` reverse-domain prefix**: per SEP §Resource Metadata, frontmatter `metadata` fields and `lastModified` are surfaced under the `io.modelcontextprotocol.skills/` reverse-domain prefix; `audience`/`priority` go on the standard MCP `annotations` field.
- **Template completion API**: `SkillTemplateDeclaration.complete` callbacks are wired into FastMCP's completion handler so hosts can drive variable completion through the MCP completion API.

## Public API

Top-level (`mcp_experimental_ext_skills`):

- Wire types: `SkillIndex`, `SkillIndexEntry`, `SkillMdIndexEntry`, `ArchiveIndexEntry`, `McpResourceTemplateIndexEntry`, `SkillSummary`, `SkillMetadata`, `SkillDocument`, `UnpackedSkillArchive`, `ParsedSkillUri`
- Constants: `SKILL_INDEX_SCHEMA`, `KNOWN_SKILL_INDEX_SCHEMAS`, `SKILL_URI_SCHEME`, `SKILL_FILENAME`, `INDEX_JSON_URI`, `SKILLS_EXTENSION_CAPABILITY`
- URI helpers: `parse_skill_uri`, `build_skill_uri`, `resolve_skill_file_uri`, `is_skill_content_uri`, `is_index_json_uri`
- Archive helpers: `extract_skill_archive`, `detect_archive_format`, `strip_archive_suffix`, `archive_mime_type`, `archive_suffix`
- MIME helpers: `get_mime_type`, `is_text_mime_type`

Client (`mcp_experimental_ext_skills.client`):

- Discovery: `list_skills`, `list_skills_from_index`, `list_skill_templates_from_index`, `discover_skills`, `discover_and_build_catalog`
- Reading: `read_skill_uri`, `read_skill_content`, `read_skill_archive`, `read_skill_document`
- Catalog building: `parse_skill_frontmatter`, `build_skills_summary`, `build_skills_catalog`
- Tool schema: `READ_RESOURCE_TOOL`
- Protocol: `SkillsClient`

Server (`mcp_experimental_ext_skills.server`):

- Discovery: `discover_skills` (sync, filesystem)
- Registration: `register_skill_resources`, `register_skill`, `generate_skill_index`, `declare_skills_extension`
- Loaders: `load_skill_content`, `load_skill_metadata`, `load_document`, `scan_documents`, `is_path_within_base`
- Declarations: `SkillTemplateDeclaration`, `SkillArchiveDeclaration`, `RegisterSkillResourcesOptions`, `TemplateReadResult`, `TemplateReadCallback`, `TemplateCompletionCallback`, `ArchiveFormat`
- Protocol: `SkillsServer`

## Development

```bash
pip install -e ".[dev]"
pytest -v
mypy src/ tests/
ruff check src/ tests/
```

## License

Apache-2.0
