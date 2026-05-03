"""Client-side discovery, reading, and catalog building for skills served
over MCP per SEP-2640.

Re-exports the public client API from
:mod:`mcp_experimental_ext_skills._client`. Types referenced by these
functions are re-exported here so consumers don't need a second import.
"""

from __future__ import annotations

from .._client import (
    READ_RESOURCE_TOOL,
    SkillsClient,
    build_skills_catalog,
    build_skills_summary,
    discover_and_build_catalog,
    discover_skills,
    list_skill_templates_from_index,
    list_skills,
    list_skills_from_index,
    parse_skill_frontmatter,
    read_skill_archive,
    read_skill_content,
    read_skill_document,
    read_skill_uri,
)
from .._types import (
    DiscoverCatalogOptions,
    DiscoverCatalogResult,
    ExtractArchiveOptions,
    SkillsCatalogOptions,
    SkillSummary,
    ToolDefinition,
    UnpackedSkillArchive,
)
from .._uri import build_skill_uri

__all__ = [
    "READ_RESOURCE_TOOL",
    "DiscoverCatalogOptions",
    "DiscoverCatalogResult",
    "ExtractArchiveOptions",
    "SkillSummary",
    "SkillsCatalogOptions",
    "SkillsClient",
    "ToolDefinition",
    "UnpackedSkillArchive",
    "build_skill_uri",
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
