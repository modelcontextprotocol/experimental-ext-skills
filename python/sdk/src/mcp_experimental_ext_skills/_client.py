"""Client-side utilities for discovering, reading, and summarizing skills
exposed as MCP resources by a skills server.

Per SEP-2640, ``skill://`` is SHOULD, not MUST. Servers MAY serve skills
under any scheme provided each skill is listed in ``skill://index.json``.
The index is the authoritative record of which resources are skills;
outside the index, hosts recognize skills by the ``skill://`` scheme
prefix.

Each MCP Client instance is inherently server-scoped — it represents a
connection to a single MCP server. This is the architectural basis for
excluding server names from ``skill://`` URIs: disambiguation happens at
the call site, not in the URI.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import asdict
from typing import Any, Protocol

from pydantic import ValidationError

from ._archive import detect_archive_format, strip_archive_suffix
from ._archive import (
    extract_skill_archive as _extract_skill_archive,
)
from ._types import (
    KNOWN_SKILL_INDEX_SCHEMAS,
    DiscoverCatalogOptions,
    DiscoverCatalogResult,
    ExtractArchiveOptions,
    SkillIndex,
    SkillsCatalogOptions,
    SkillSummary,
    ToolDefinition,
    UnpackedSkillArchive,
)
from ._uri import (
    INDEX_JSON_URI,
    SKILL_FILENAME,
    build_skill_uri,
    parse_skill_uri,
)
from ._xml import generate_skills_xml_from_summaries

logger = logging.getLogger(__name__)


class SkillsClient(Protocol):
    """Minimal structural interface for an MCP Client.

    Matches the shape of :class:`mcp.client.session.ClientSession` for the
    methods this SDK uses. Using a Protocol avoids version-skew issues
    when consumers have a different ``mcp`` install than the SDK was
    tested against.
    """

    async def list_resources(self, cursor: str | None = None, /) -> Any:
        """Call ``resources/list`` and return the response."""
        ...

    async def read_resource(self, uri: Any, /) -> Any:
        """Call ``resources/read`` and return the response."""
        ...


# ---------------------------------------------------------------------------
# Tool definition for host-provided read_resource tool
# ---------------------------------------------------------------------------


READ_RESOURCE_TOOL = ToolDefinition(
    name="read_resource",
    description="Read an MCP resource from a connected server.",
    input_schema={
        "type": "object",
        "properties": {
            "server": {
                "type": "string",
                "description": "Name of the connected MCP server",
            },
            "uri": {
                "type": "string",
                "description": "The resource URI, e.g. skill://git-workflow/SKILL.md",
            },
        },
        "required": ["server", "uri"],
    },
    annotations={
        "readOnlyHint": True,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)


# ---------------------------------------------------------------------------
# Helpers for normalizing MCP responses
# ---------------------------------------------------------------------------


def _resource_attr(resource: Any, name: str) -> Any:
    """Pull a field off either a Pydantic model or a dict-shaped resource."""
    if hasattr(resource, name):
        value = getattr(resource, name)
        return value
    if isinstance(resource, dict):
        return resource.get(name)
    return None


def _content_attr(content: Any, name: str) -> Any:
    return _resource_attr(content, name)


def _content_text(content: Any) -> str | None:
    text = _content_attr(content, "text")
    return text if isinstance(text, str) else None


def _content_blob(content: Any) -> str | None:
    blob = _content_attr(content, "blob")
    return blob if isinstance(blob, str) else None


def _content_mime_type(content: Any) -> str | None:
    mime = _content_attr(content, "mimeType")
    if isinstance(mime, str):
        return mime
    mime = _content_attr(content, "mime_type")
    return mime if isinstance(mime, str) else None


def _resource_uri(resource: Any) -> str:
    uri = _resource_attr(resource, "uri")
    return str(uri) if uri is not None else ""


# ---------------------------------------------------------------------------
# Listing skills
# ---------------------------------------------------------------------------


async def list_skills(client: SkillsClient) -> list[SkillSummary]:
    """List all skills available from an MCP client via ``resources/list``.

    Filters for ``skill://<skill_path>/SKILL.md`` URIs and returns
    :class:`SkillSummary` objects with both name and skill_path. Handles
    pagination automatically.

    Per SEP-2640: "outside the index, hosts recognize skills by the
    ``skill://`` scheme prefix." For servers that use other schemes,
    use :func:`list_skills_from_index` instead.
    """
    skills: list[SkillSummary] = []
    cursor: str | None = None

    while True:
        result = await client.list_resources(cursor)

        resources = _resource_attr(result, "resources") or []
        for resource in resources:
            uri = _resource_uri(resource)
            parsed = parse_skill_uri(uri)
            if parsed is None:
                continue
            if (
                parsed.file_path != SKILL_FILENAME
                and parsed.file_path.lower() != "skill.md"
            ):
                continue

            skills.append(
                SkillSummary(
                    name=str(_resource_attr(resource, "name") or parsed.skill_path),
                    skill_path=parsed.skill_path,
                    uri=uri,
                    description=_resource_attr(resource, "description"),
                    mime_type=_content_mime_type(resource),
                )
            )

        next_cursor = _resource_attr(result, "nextCursor") or _resource_attr(
            result, "next_cursor"
        )
        if not next_cursor:
            break
        cursor = next_cursor

    return skills


async def _fetch_and_parse_index(client: SkillsClient) -> SkillIndex | None:
    """Fetch and parse ``skill://index.json`` from an MCP server.

    Returns the parsed :class:`SkillIndex` or ``None`` if unavailable.

    Per SEP-2640, validates ``$schema`` against known URIs and warns (but
    proceeds) on unknown values, for forward-compat. Per SEP-2640
    "Clients SHOULD skip entries with an unrecognized ``type``", we parse
    each entry independently so unknown variants drop instead of failing
    the whole index parse.
    """
    try:
        result = await client.read_resource(INDEX_JSON_URI)
    except Exception:
        return None

    contents = _resource_attr(result, "contents") or []
    if not contents:
        return None

    text = _content_text(contents[0])
    if not text:
        return None

    try:
        raw = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict):
        return None

    schema = raw.get("$schema")
    if isinstance(schema, str) and schema not in KNOWN_SKILL_INDEX_SCHEMAS:
        logger.warning(
            "Unrecognized skill index $schema: %r. Known schemas: %s. "
            "Proceeding anyway.",
            schema,
            sorted(KNOWN_SKILL_INDEX_SCHEMAS),
        )

    raw_skills = raw.get("skills")
    if not isinstance(raw_skills, list):
        return None

    # Per SEP-2640, skip entries with unrecognized type. Parse each entry
    # individually so a single bad entry doesn't fail the whole index.
    valid_entries: list[dict[str, Any]] = []
    for entry in raw_skills:
        if not isinstance(entry, dict):
            continue
        entry_type = entry.get("type")
        if entry_type not in ("skill-md", "archive", "mcp-resource-template"):
            continue
        valid_entries.append(entry)

    try:
        return SkillIndex.model_validate(
            {"$schema": schema or "", "skills": valid_entries}
        )
    except ValidationError as err:
        logger.warning("Failed to validate skill index: %s", err)
        return None


async def list_skills_from_index(client: SkillsClient) -> list[SkillSummary] | None:
    """List skills by reading the well-known ``skill://index.json``.

    Returns ``None`` if the server does not expose the index.

    **Scheme-agnostic**: per SEP-2640, index entries may use any URI
    scheme. For ``skill://`` URIs, ``skill_path`` is extracted from the
    URI structure; for other schemes, ``skill_path`` falls back to
    ``entry.name``.
    """
    index = await _fetch_and_parse_index(client)
    if index is None:
        return None

    summaries: list[SkillSummary] = []
    for entry in index.skills:
        if entry.type == "skill-md":
            parsed = parse_skill_uri(entry.url)
            skill_path = parsed.skill_path if parsed else entry.name
            summaries.append(
                SkillSummary(
                    name=entry.name,
                    skill_path=skill_path,
                    uri=entry.url,
                    type="skill-md",
                    description=entry.description,
                    mime_type="text/markdown",
                )
            )
        elif entry.type == "archive":
            stripped = strip_archive_suffix(entry.url)
            parsed = parse_skill_uri(stripped + "/SKILL.md")
            skill_path = parsed.skill_path if parsed else entry.name
            archive_mime = (
                "application/zip"
                if detect_archive_format(None, entry.url) == "zip"
                else "application/gzip"
            )
            summaries.append(
                SkillSummary(
                    name=entry.name,
                    skill_path=skill_path,
                    uri=entry.url,
                    type="archive",
                    description=entry.description,
                    mime_type=archive_mime,
                )
            )
        # Template entries are returned by list_skill_templates_from_index().
    return summaries


async def list_skill_templates_from_index(
    client: SkillsClient,
) -> list[dict[str, Any]] | None:
    """List ``mcp-resource-template`` entries from ``skill://index.json``.

    Returns ``None`` if the server does not expose the index. Entries are
    returned as dicts with keys ``name`` (optional), ``description``, and
    ``uri_template``.
    """
    index = await _fetch_and_parse_index(client)
    if index is None:
        return None

    return [
        {
            "name": entry.name,
            "description": entry.description,
            "uri_template": entry.url,
        }
        for entry in index.skills
        if entry.type == "mcp-resource-template"
    ]


# ---------------------------------------------------------------------------
# Reading skills
# ---------------------------------------------------------------------------


async def read_skill_uri(client: SkillsClient, uri: str) -> str:
    """Read a resource by its full URI from an MCP server.

    Scheme-agnostic — works with any URI scheme (``skill://``,
    ``github://``, ``repo://``, etc.). Pass the
    :attr:`SkillSummary.uri` value directly.
    """
    result = await client.read_resource(uri)
    contents = _resource_attr(result, "contents") or []
    if not contents:
        raise ValueError(f"No content returned for {uri}")
    text = _content_text(contents[0])
    if text is None:
        raise ValueError(f"Expected text content for {uri}")
    return text


async def read_skill_content(client: SkillsClient, skill_path: str) -> str:
    """Read a skill's SKILL.md content by skill path.

    Convenience method that builds a ``skill://`` URI from the skill
    path. Only works for skills using the ``skill://`` scheme — for
    other schemes, use :func:`read_skill_uri` with the full URI from
    :attr:`SkillSummary.uri`.
    """
    return await read_skill_uri(client, build_skill_uri(skill_path))


async def read_skill_archive(
    client: SkillsClient,
    archive_uri: str,
    options: ExtractArchiveOptions | None = None,
) -> UnpackedSkillArchive:
    """Fetch a skill archive from an MCP server and unpack it in memory.

    Per SEP-2640, archive entries reference a single resource containing
    a packed skill directory (``.tar.gz`` or ``.zip``). This fetches the
    archive via ``resources/read``, dispatches on the resource's
    ``mimeType`` (falling back to URL suffix), and unpacks with archive
    safety: rejects path traversal, absolute paths, drive letters,
    symlinks resolving outside the skill directory, and decompression
    bombs.

    The returned ``files`` dict is keyed by paths relative to the skill
    root.
    """
    result = await client.read_resource(archive_uri)
    contents = _resource_attr(result, "contents") or []
    if not contents:
        raise ValueError(f"No content returned for archive {archive_uri}")

    content = contents[0]
    blob = _content_blob(content)
    if blob is not None:
        data = base64.b64decode(blob)
    else:
        text = _content_text(content)
        if text is None:
            raise ValueError(
                f"Archive resource {archive_uri} returned neither blob nor "
                "text content"
            )
        data = base64.b64decode(text)

    return _extract_skill_archive(
        data,
        mime_type=_content_mime_type(content),
        url=archive_uri,
        options=options,
    )


async def read_skill_document(
    client: SkillsClient,
    skill_path: str,
    document_path: str,
) -> dict[str, Any]:
    """Read a supporting file from a skill directory.

    The ``document_path`` is relative to the skill root (e.g.,
    ``"references/REFERENCE.md"``). Constructs a ``skill://`` URI — only
    works for skills using the ``skill://`` scheme.
    """
    uri = build_skill_uri(skill_path, document_path)
    result = await client.read_resource(uri)
    contents = _resource_attr(result, "contents") or []
    if not contents:
        raise ValueError(f"No content returned for {uri}")
    content = contents[0]
    return {
        "text": _content_text(content),
        "blob": _content_blob(content),
        "mime_type": _content_mime_type(content),
    }


# ---------------------------------------------------------------------------
# Frontmatter parsing (regex, no YAML dep on the client)
# ---------------------------------------------------------------------------


_FRONTMATTER_NAME = re.compile(r"^name:\s*(.+)$", re.MULTILINE)
_FRONTMATTER_DESC = re.compile(r"^description:\s*(.+)$", re.MULTILINE)


def parse_skill_frontmatter(content: str) -> dict[str, str] | None:
    """Parse name and description from SKILL.md YAML frontmatter content.

    Uses a simple regex approach — no YAML dependency required on the
    client side. Returns ``None`` if the content doesn't contain valid
    frontmatter.
    """
    if not content.startswith("---"):
        return None

    end_index = content.find("---", 3)
    if end_index == -1:
        return None

    frontmatter = content[3:end_index]
    name_match = _FRONTMATTER_NAME.search(frontmatter)
    if name_match is None:
        return None

    name = name_match.group(1).strip().strip("\"'")
    desc_match = _FRONTMATTER_DESC.search(frontmatter)
    description = desc_match.group(1).strip().strip("\"'") if desc_match else ""
    return {"name": name, "description": description}


# ---------------------------------------------------------------------------
# Catalog building
# ---------------------------------------------------------------------------


def build_skills_summary(skills: list[SkillSummary]) -> str:
    """Build a plain-text summary of available skills for context injection."""
    if not skills:
        return "No skills available."

    lines = ["Available skills:"]
    for skill in skills:
        desc = f": {skill.description}" if skill.description else ""
        path_info = (
            f" [path: {skill.skill_path}]" if skill.name != skill.skill_path else ""
        )
        lines.append(f"- {skill.name}{path_info} ({skill.uri}){desc}")
    return "\n".join(lines)


def build_skills_catalog(
    skills: list[SkillSummary],
    options: SkillsCatalogOptions,
) -> str:
    """Build a structured skill catalog for system prompt injection.

    Produces an XML ``<available_skills>`` block (per agentskills.io
    guide) with behavioral instructions that tell the model which tool
    (and optionally which server) to use for loading skill content.

    When the reader tool accepts a ``server`` parameter, pass
    ``server_name`` so the instructions name it. The TS SDK's e2e agent
    demo found that including the server name raises activation
    reliability from ~33% to ~90%.

    Returns an empty string if no skills are provided.
    """
    if not skills:
        return ""

    tool_name = options.tool_name
    server_name = options.server_name
    xml = generate_skills_xml_from_summaries(skills)

    if server_name:
        instructions = [
            f"When a task matches a skill's description, use the `{tool_name}` tool",
            f"with server `{server_name}` and the skill's URI to load its full",
            "instructions before proceeding.",
        ]
    else:
        instructions = [
            f"When a task matches a skill's description, use the `{tool_name}` tool",
            "with the skill's URI to load its full instructions before proceeding.",
        ]

    parts = [
        "",
        "## Available Skills",
        "",
        "The following skills provide specialized instructions for specific tasks.",
        *instructions,
        "",
        xml,
        "",
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Discovery (ergonomic layer)
# ---------------------------------------------------------------------------


async def discover_skills(client: SkillsClient) -> list[SkillSummary]:
    """Discover all available skills from an MCP server.

    Implements the SEP's recommended discovery strategy:

    1. Try ``skill://index.json`` (authoritative, scheme-agnostic).
    2. Fall back to ``resources/list`` (``skill://`` scheme only).
    3. Return empty list if neither yields results.

    Per SEP-2640, hosts MUST NOT treat an absent or empty index as proof
    that a server has no skills.
    """
    index_skills = await list_skills_from_index(client)
    if index_skills is not None and len(index_skills) > 0:
        return index_skills
    return await list_skills(client)


async def discover_and_build_catalog(
    client: SkillsClient,
    options: DiscoverCatalogOptions | None = None,
    *,
    server_name: str | None = None,
    tool_name: str | None = None,
) -> DiscoverCatalogResult:
    """Discover skills and build a system prompt catalog in one call.

    Pass either an :class:`DiscoverCatalogOptions` or the keyword args
    ``server_name`` and (optional) ``tool_name``.
    """
    if options is None:
        if server_name is None:
            raise TypeError(
                "discover_and_build_catalog: pass options=... or server_name=..."
            )
        options = DiscoverCatalogOptions(server_name=server_name, tool_name=tool_name)

    skills = await discover_skills(client)
    catalog = build_skills_catalog(
        skills,
        SkillsCatalogOptions(
            tool_name=options.tool_name or READ_RESOURCE_TOOL.name,
            server_name=options.server_name,
        ),
    )
    return DiscoverCatalogResult(skills=skills, catalog=catalog)


# Suppress an unused-import lint warning while keeping the helper
# discoverable for future code that wants to dump callback-bearing types.
_ = asdict


__all__ = [
    "READ_RESOURCE_TOOL",
    "SkillsClient",
    "build_skills_catalog",
    "build_skills_summary",
    "discover_and_build_catalog",
    "discover_skills",
    "list_skill_templates_from_index",
    "list_skills",
    "list_skills_from_index",
    "parse_skill_frontmatter",
    "read_skill_archive",
    "read_skill_content",
    "read_skill_document",
    "read_skill_uri",
]
