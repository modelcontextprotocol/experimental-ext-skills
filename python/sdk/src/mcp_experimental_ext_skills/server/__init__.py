"""Server-side discovery, resource registration, and capability
declaration for skills served over MCP per SEP-2640.

Re-exports the public server API from
:mod:`mcp_experimental_ext_skills._server` and
:mod:`mcp_experimental_ext_skills._resource_extensions`. Types referenced
by these functions are re-exported here so consumers don't need a second
import.
"""

from __future__ import annotations

from .._resource_extensions import (
    SKILLS_EXTENSION_CAPABILITY,
    SKILLS_EXTENSION_ID,
    SkillsServer,
    declare_skills_extension,
)
from .._server import (
    MAX_FILE_SIZE,
    discover_skills,
    generate_skill_index,
    is_path_within_base,
    load_document,
    load_skill_content,
    load_skill_metadata,
    register_skill,
    register_skill_resources,
    scan_documents,
    skill,
)
from .._types import (
    ArchiveFormat,
    RegisterSkillResourcesOptions,
    SkillArchiveDeclaration,
    SkillDocument,
    SkillMetadata,
    SkillTemplateDeclaration,
    TemplateCompletionCallback,
    TemplateReadCallback,
    TemplateReadResult,
)

__all__ = [
    "MAX_FILE_SIZE",
    "SKILLS_EXTENSION_CAPABILITY",
    "SKILLS_EXTENSION_ID",
    "ArchiveFormat",
    "RegisterSkillResourcesOptions",
    "SkillArchiveDeclaration",
    "SkillDocument",
    "SkillMetadata",
    "SkillTemplateDeclaration",
    "SkillsServer",
    "TemplateCompletionCallback",
    "TemplateReadCallback",
    "TemplateReadResult",
    "declare_skills_extension",
    "discover_skills",
    "generate_skill_index",
    "is_path_within_base",
    "load_document",
    "load_skill_content",
    "load_skill_metadata",
    "register_skill",
    "register_skill_resources",
    "scan_documents",
    "skill",
]
