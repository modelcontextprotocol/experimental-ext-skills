"""Type definitions for the Skills Extension SDK.

Wire types are Pydantic v2 BaseModel with snake_case attributes and camelCase
JSON aliases. Server-side declarations with callbacks are dataclasses.

Key design point: SkillMetadata separates ``skill_path`` (the multi-segment
URI locator, e.g. "acme/billing/refunds") from ``name`` (the skill identity
from YAML frontmatter). The URI path is a locator, not an identifier.

Per SEP-2640 §Index, every wire model uses ``extra="ignore"`` so unknown
fields parse without error ("Clients SHOULD ignore unrecognized fields").
The ``digest`` field is intentionally absent from index entry models —
SEP-2640 omits it from this binding. We accept it via ``extra="ignore"``
when servers include it (forward-compat) but never emit it.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Discriminator, Field
from pydantic.alias_generators import to_camel

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Schema URI for the Agent Skills discovery index format (SEP-2640 §Index).
SKILL_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"

#: Set of known schema URIs for forward-compatible validation.
KNOWN_SKILL_INDEX_SCHEMAS: frozenset[str] = frozenset({SKILL_INDEX_SCHEMA})


# ---------------------------------------------------------------------------
# Pydantic base
# ---------------------------------------------------------------------------


class _WireModel(BaseModel):
    """Base for models that cross the JSON wire.

    ``extra="ignore"`` honors SEP-2640's "Clients SHOULD ignore unrecognized
    fields." ``populate_by_name=True`` lets callers construct via snake_case
    Python kwargs while serializing via camelCase JSON aliases.
    """

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        alias_generator=to_camel,
    )


# ---------------------------------------------------------------------------
# Skill metadata + summary
# ---------------------------------------------------------------------------


class SkillDocument(_WireModel):
    """A supplementary document found in a skill's subdirectories."""

    path: str
    """Relative path from skill root (e.g., "references/REFERENCE.md")."""

    mime_type: str
    """MIME type based on file extension."""

    size: int
    """File size in bytes."""


class SkillMetadata(_WireModel):
    """Metadata extracted from a skill's SKILL.md YAML frontmatter,
    extended with document scanning results.
    """

    name: str
    """Skill identity from YAML frontmatter — NOT derived from path."""

    skill_path: str
    """Multi-segment URI locator (e.g., "acme/billing/refunds")."""

    description: str
    """Skill description from YAML frontmatter."""

    absolute_path: str
    """Absolute filesystem path to the SKILL.md file."""

    skill_dir: str
    """Absolute filesystem path to the skill's directory."""

    metadata: dict[str, str] | None = None
    """Optional extra frontmatter metadata fields."""

    audience: list[str] | None = None
    """Audience annotation for this skill's resources (e.g., ["assistant"])."""

    documents: list[SkillDocument] = Field(default_factory=list)
    """Supplementary files found in the skill directory."""

    size: int = 0
    """SKILL.md file size in bytes."""

    last_modified: str = ""
    """ISO 8601 timestamp from SKILL.md file mtime."""


class SkillSummary(_WireModel):
    """Lightweight client-side summary of a discovered skill."""

    name: str
    """Skill name (from resource description or frontmatter)."""

    skill_path: str
    """Multi-segment skill path parsed from URI."""

    uri: str
    """URI to read this skill from.

    For ``type="skill-md"``: the SKILL.md resource URI.

    For ``type="archive"``: the archive resource URI (e.g.
    ``skill://pdf-processing.tar.gz``); fetch and unpack via
    :func:`read_skill_archive`. The post-unpack SKILL.md lives at
    ``skill://<skill_path>/SKILL.md``.
    """

    type: Literal["skill-md", "archive"] | None = None
    """Distribution type. When omitted (skills discovered via
    ``resources/list`` without an index), assume ``"skill-md"``.
    """

    description: str | None = None
    mime_type: str | None = None


# ---------------------------------------------------------------------------
# Index entries (discriminated union)
# ---------------------------------------------------------------------------


class SkillMdIndexEntry(_WireModel):
    """A skill-md entry in the discovery index — a concrete skill with a URI."""

    name: str
    """Skill name from frontmatter (= final segment of skill path)."""

    type: Literal["skill-md"]
    """Entry type discriminator."""

    description: str
    """Skill description from frontmatter."""

    url: str
    """Full skill:// URI for the SKILL.md resource."""


class ArchiveIndexEntry(_WireModel):
    """An archive entry in the discovery index — a single packed resource
    (.tar.gz or .zip) whose contents populate the skill directory.

    Per SEP-2640, ``<skill-path>`` is the entry ``url`` with the archive
    suffix stripped. ``skill://pdf-processing.tar.gz`` unpacks to
    ``skill://pdf-processing/``.

    Per SEP-2640 §Archive entries: hosts SHOULD determine the format from
    the resource's ``mimeType``, falling back to the URL suffix. Either
    the URL SHOULD end in ``.tar.gz`` / ``.tgz`` / ``.zip`` or the
    resource MUST be served with the matching ``mimeType``
    (``application/gzip`` / ``application/zip``); otherwise hosts cannot
    determine the archive format. The SDK's
    :func:`mcp_experimental_ext_skills.server.generate_skill_index`
    always emits URLs with a suffix; if you hand-construct
    :class:`ArchiveIndexEntry` instances directly, ensure at least one
    of the two signals is present at the wire.
    """

    name: str
    """Skill name from frontmatter (= final segment of post-unpack skill path)."""

    type: Literal["archive"]
    """Entry type discriminator."""

    description: str
    """Skill description from frontmatter."""

    url: str
    """Resource URI for the archive (e.g. skill://pdf-processing.tar.gz).

    SHOULD end in ``.tar.gz`` / ``.tgz`` / ``.zip`` so that hosts that
    do not see a ``mimeType`` can still detect the archive format from
    the URL suffix per SEP-2640.
    """


class McpResourceTemplateIndexEntry(_WireModel):
    """An mcp-resource-template entry in the discovery index — a
    parameterized skill namespace that clients resolve via the MCP
    completion API.

    Per SEP-2640 §Index field table, ``name`` is omitted for template
    entries; the URI template value is carried in ``url``.
    """

    type: Literal["mcp-resource-template"]
    """Entry type discriminator."""

    description: str
    """Template description."""

    url: str
    """RFC 6570 URI template (e.g., "skill://docs/{product}/SKILL.md")."""

    name: str | None = None
    """Always omitted for mcp-resource-template per SEP-2640."""


SkillIndexEntry = Annotated[
    SkillMdIndexEntry | ArchiveIndexEntry | McpResourceTemplateIndexEntry,
    Discriminator("type"),
]
"""Discriminated union of index entry types.

Per SEP-2640 §Index, the ``type`` field MUST be one of ``"skill-md"``,
``"archive"``, or ``"mcp-resource-template"``. Unrecognized variants are
skipped at the call site (in :func:`list_skills_from_index`), not here —
Pydantic's discriminator raises on unknown tags by default, and SEP-2640
requires graceful skipping rather than failing the whole index parse.
"""


class SkillIndex(_WireModel):
    """The skill://index.json resource content.

    Follows the Agent Skills well-known URI discovery index format with
    SEP-2640's modifications (no ``digest`` field, additional
    ``mcp-resource-template`` entry type).
    """

    schema_uri: str = Field(alias="$schema", serialization_alias="$schema")
    """Schema version URI."""

    skills: list[SkillIndexEntry] = Field(default_factory=list)
    """Array of skill entries."""


# ---------------------------------------------------------------------------
# Resource templates (server-side declarations with callbacks)
# ---------------------------------------------------------------------------


@dataclass
class TemplateReadResult:
    """Content returned by a template-skill read handler.

    Mirrors the contents shape that the MCP server emits for a
    ``resources/read`` result.
    """

    text: str | None = None
    """Markdown / text content for the resolved URI."""

    blob: str | None = None
    """Base64-encoded binary content for the resolved URI."""

    mime_type: str | None = None
    """MIME type. Defaults to ``text/markdown`` for SKILL.md URIs."""


TemplateCompletionCallback = Callable[
    [str, "dict[str, str] | None"],
    "list[str] | Awaitable[list[str]]",
]
"""Per-variable completion callback.

Returns the candidate values for ``{variable}`` given the prefix the user
has typed. The second argument carries already-bound variable values.
"""


TemplateReadCallback = Callable[
    [str, dict[str, str]],
    "TemplateReadResult | Awaitable[TemplateReadResult]",
]
"""Read handler for a parameterized skill template.

Receives the resolved URI (with variables substituted) and a record of the
bound variables.
"""


@dataclass
class SkillTemplateDeclaration:
    """Server-side declaration for a parameterized skill namespace.

    When ``read`` is provided, the SDK registers an MCP ResourceTemplate for
    ``uri_template`` so hosts can read resolved URIs. When ``complete`` is
    provided, each variable's callback is wired to the MCP completion API.

    If both are omitted, the template is enumerated in
    ``skill://index.json`` but not served — useful for servers that proxy
    template resolution to another mechanism.
    """

    name: str
    description: str
    uri_template: str
    read: TemplateReadCallback | None = None
    complete: dict[str, TemplateCompletionCallback] | None = None


# ---------------------------------------------------------------------------
# Archive declarations + extraction
# ---------------------------------------------------------------------------


ArchiveFormat = Literal["tar.gz", "zip"]
"""Archive format. Per SEP-2640, hosts MUST support both."""


@dataclass
class SkillArchiveDeclaration:
    """Server-side declaration for an archive-distributed skill.

    The archive is served as a single resource at
    ``skill://<skill_path>.<format>``. After the host unpacks it, files are
    addressable at ``skill://<skill_path>/<file-path>`` — identical
    namespace to individual-file distribution.
    """

    name: str
    """Skill name from frontmatter; MUST equal the final segment of
    ``skill_path`` per SEP-2640.
    """

    description: str
    skill_path: str
    """Multi-segment skill path that the archive unpacks to. The final
    segment MUST equal ``name``.
    """

    archive_path: str
    """Local filesystem path to the prebuilt archive."""

    format: ArchiveFormat | None = None
    """Archive format. Defaults to inference from ``archive_path`` suffix."""


@dataclass
class UnpackedSkillArchive:
    """Result of unpacking a skill archive.

    Maps file paths (relative to skill root, forward-slash separated) to
    raw byte contents.
    """

    files: dict[str, bytes]
    """Files in the archive, keyed by relative path."""

    total_size: int
    """Total uncompressed bytes across all entries."""

    symlinks: dict[str, str] = field(default_factory=dict)
    """Symlinks within the archive, keyed by link path → original target
    string (relative). Per SEP-2640 archive safety, only links whose
    resolved target stays within the skill directory are preserved;
    out-of-scope links cause extraction to fail. Only populated for
    ``.tar.gz`` archives — ``.zip`` symlink semantics vary across
    encoders, so the SDK does not preserve them.
    """


@dataclass
class ExtractArchiveOptions:
    """Options for archive extraction."""

    max_total_size: int = 50 * 1024 * 1024
    """Maximum total uncompressed bytes. Default: 50MB."""

    max_file_size: int = 10 * 1024 * 1024
    """Maximum bytes per single file. Default: 10MB."""

    max_entries: int = 1024
    """Maximum number of entries. Default: 1024."""


# ---------------------------------------------------------------------------
# Catalog + discovery options
# ---------------------------------------------------------------------------


@dataclass
class SkillsCatalogOptions:
    """Options for ``build_skills_catalog``."""

    tool_name: str
    """Tool name the model should call to read skill content."""

    server_name: str | None = None
    """MCP server name the model should target. Omit when the configured
    ``tool_name`` does not accept a ``server`` parameter.
    """


@dataclass
class DiscoverCatalogOptions:
    """Options for ``discover_and_build_catalog``."""

    server_name: str
    """MCP server name the model should target (required for activation
    reliability).
    """

    tool_name: str | None = None
    """Tool name the model should call to read resources.
    Default: ``"read_resource"``.
    """


@dataclass
class DiscoverCatalogResult:
    """Result of ``discover_and_build_catalog``."""

    skills: list[SkillSummary]
    """Discovered skills."""

    catalog: str
    """System prompt catalog text (empty string if no skills found)."""


# ---------------------------------------------------------------------------
# Server registration options
# ---------------------------------------------------------------------------


@dataclass
class RegisterSkillResourcesOptions:
    """Options for ``register_skill_resources``."""

    template: bool = True
    """Register the catch-all resource template for supporting files."""

    audience: list[str] = field(default_factory=lambda: ["assistant"])
    """Audience annotation for skill resources."""

    archives: list[SkillArchiveDeclaration] = field(default_factory=list)
    """Archive-distributed skills to register and include in
    ``skill://index.json``.
    """

    templates: list[SkillTemplateDeclaration] = field(default_factory=list)
    """Resource template entries to include in ``skill://index.json``."""


# ---------------------------------------------------------------------------
# Tool definition
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolDefinition:
    """MCP Tool definition shape — mirrors the SDK's Tool interface."""

    name: str
    description: str
    input_schema: dict[str, Any]
    annotations: dict[str, Any] | None = None


__all__ = [
    "KNOWN_SKILL_INDEX_SCHEMAS",
    "SKILL_INDEX_SCHEMA",
    "ArchiveFormat",
    "ArchiveIndexEntry",
    "DiscoverCatalogOptions",
    "DiscoverCatalogResult",
    "ExtractArchiveOptions",
    "McpResourceTemplateIndexEntry",
    "RegisterSkillResourcesOptions",
    "SkillArchiveDeclaration",
    "SkillDocument",
    "SkillIndex",
    "SkillIndexEntry",
    "SkillMdIndexEntry",
    "SkillMetadata",
    "SkillSummary",
    "SkillTemplateDeclaration",
    "SkillsCatalogOptions",
    "TemplateCompletionCallback",
    "TemplateReadCallback",
    "TemplateReadResult",
    "ToolDefinition",
    "UnpackedSkillArchive",
]
