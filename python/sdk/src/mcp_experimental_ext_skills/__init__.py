"""Python SDK for the MCP Skills Extension (SEP-2640).

The top-level module re-exports the protocol-level types, URI/MIME/archive
helpers, and constants that are common to client and server code.

Use :mod:`mcp_experimental_ext_skills.client` for client-side discovery
and reading, and :mod:`mcp_experimental_ext_skills.server` for server-side
discovery and resource registration.
"""

from __future__ import annotations

from ._archive import (
    archive_mime_type,
    archive_suffix,
    detect_archive_format,
    extract_skill_archive,
    strip_archive_suffix,
)
from ._mime import get_mime_type, is_text_mime_type
from ._resource_extensions import (
    SKILLS_EXTENSION_CAPABILITY,
    SKILLS_EXTENSION_ID,
)
from ._types import (
    KNOWN_SKILL_INDEX_SCHEMAS,
    SKILL_INDEX_SCHEMA,
    ArchiveFormat,
    ArchiveIndexEntry,
    ExtractArchiveOptions,
    McpResourceTemplateIndexEntry,
    SkillDocument,
    SkillIndex,
    SkillIndexEntry,
    SkillMdIndexEntry,
    SkillMetadata,
    SkillSummary,
    UnpackedSkillArchive,
)
from ._uri import (
    INDEX_JSON_URI,
    SKILL_FILENAME,
    SKILL_URI_SCHEME,
    ParsedSkillUri,
    build_skill_uri,
    is_index_json_uri,
    is_skill_content_uri,
    parse_skill_uri,
    resolve_skill_file_uri,
)

__version__ = "0.1.0"

__all__ = [
    "INDEX_JSON_URI",
    "KNOWN_SKILL_INDEX_SCHEMAS",
    "SKILLS_EXTENSION_CAPABILITY",
    "SKILLS_EXTENSION_ID",
    "SKILL_FILENAME",
    "SKILL_INDEX_SCHEMA",
    "SKILL_URI_SCHEME",
    "ArchiveFormat",
    "ArchiveIndexEntry",
    "ExtractArchiveOptions",
    "McpResourceTemplateIndexEntry",
    "ParsedSkillUri",
    "SkillDocument",
    "SkillIndex",
    "SkillIndexEntry",
    "SkillMdIndexEntry",
    "SkillMetadata",
    "SkillSummary",
    "UnpackedSkillArchive",
    "__version__",
    "archive_mime_type",
    "archive_suffix",
    "build_skill_uri",
    "detect_archive_format",
    "extract_skill_archive",
    "get_mime_type",
    "is_index_json_uri",
    "is_skill_content_uri",
    "is_text_mime_type",
    "parse_skill_uri",
    "resolve_skill_file_uri",
    "strip_archive_suffix",
]
