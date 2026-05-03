"""Server-side skill discovery, content loading, and MCP resource registration.

Discovers Agent Skills by recursively scanning a directory for SKILL.md
files at any depth, parses YAML frontmatter for metadata, scans for
supplementary documents, and provides secure content loading.

Multi-segment skill paths are supported (path != name) per SEP-2640;
the no-nesting constraint (a SKILL.md cannot be an ancestor of another)
is enforced at discovery time.

Resource registration uses FastMCP's high-level API. Per the language-
agnostic three-layer architecture (see repo-root CLAUDE.md), this is the
API layer — single-operation wrappers around FastMCP's
``add_resource``/``add_template``.

**FastMCP limitation note**: the TS SDK uses an RFC 6570 reserved-
expansion catch-all template ``skill://{+skillFilePath}`` to serve all
supporting files via one registration. FastMCP's template matcher uses a
simple ``[^/]+`` regex per variable, which doesn't support reserved
expansion. The Python SDK therefore registers each supporting file as a
static resource. Visible client behavior (URIs that resolve, content
returned) is identical; only the wire-level resource layout differs.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import yaml

from ._archive import archive_mime_type, archive_suffix
from ._mime import get_mime_type, is_text_mime_type
from ._types import (
    SKILL_INDEX_SCHEMA as _SKILL_INDEX_SCHEMA,
)
from ._types import (
    ArchiveFormat,
    RegisterSkillResourcesOptions,
    SkillArchiveDeclaration,
    SkillDocument,
    SkillIndex,
    SkillMdIndexEntry,
    SkillMetadata,
    SkillTemplateDeclaration,
)
from ._types import (
    ArchiveIndexEntry as _ArchiveEntry,
)
from ._types import (
    McpResourceTemplateIndexEntry as _TemplateEntry,
)
from ._uri import INDEX_JSON_URI, SKILL_URI_SCHEME, build_skill_uri

logger = logging.getLogger(__name__)

#: Maximum file size for skill files (1MB). Mirrors TS SDK.
MAX_FILE_SIZE = 1 * 1024 * 1024

#: Per SEP-2640 §Index line 163: "skill names may contain only lowercase
#: letters, digits, and hyphens". This is also the Agent Skills naming
#: rule (referenced by SEP-2640 §Resource Mapping line 69). The reserved
#: ``skill://index.json`` URI relies on this constraint — ``index.json``
#: contains a period and cannot collide with any conformant skill name.
#: We additionally require the name to start and end with an
#: alphanumeric character to forbid leading/trailing hyphens.
_SKILL_NAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def _is_valid_skill_name(name: str) -> bool:
    """Return ``True`` if ``name`` satisfies the Agent Skills naming rules."""
    return bool(_SKILL_NAME_RE.fullmatch(name))


# ---------------------------------------------------------------------------
# Frontmatter parsing
# ---------------------------------------------------------------------------


def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter from SKILL.md content.

    Expects content to start with ``---`` and have a closing ``---``.
    Returns ``(frontmatter_dict, body)``.
    """
    if not content.startswith("---"):
        raise ValueError("SKILL.md must start with YAML frontmatter (---)")

    parts = content.split("---")
    if len(parts) < 3:
        raise ValueError("SKILL.md frontmatter not properly closed with ---")

    frontmatter = yaml.safe_load(parts[1])
    if not isinstance(frontmatter, dict):
        raise ValueError("SKILL.md frontmatter must be a YAML mapping")

    body = "---".join(parts[2:]).strip()
    return frontmatter, body


# ---------------------------------------------------------------------------
# Path safety
# ---------------------------------------------------------------------------


def is_path_within_base(target_path: str | Path, base_dir: str | Path) -> bool:
    """Check if a resolved path is within the allowed base directory.

    Resolves both paths (following symlinks where possible) and verifies
    the target is the base or a descendant.
    """
    target = Path(target_path)
    base = Path(base_dir)
    try:
        real_base = base.resolve(strict=True)
    except (OSError, RuntimeError):
        real_base = base.resolve(strict=False)
    try:
        real_target = target.resolve(strict=True)
    except (OSError, RuntimeError):
        real_target = target.resolve(strict=False)
    try:
        return real_target == real_base or real_target.is_relative_to(real_base)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Document scanning
# ---------------------------------------------------------------------------


def _scan_dir(dir_path: Path, relative_to: Path, base_dir: Path) -> list[SkillDocument]:
    """Recursively scan a directory and return SkillDocument entries."""
    documents: list[SkillDocument] = []

    if not dir_path.exists():
        return documents

    try:
        entries = list(dir_path.iterdir())
    except OSError:
        return documents

    for entry in entries:
        full_path = entry
        if not is_path_within_base(full_path, base_dir):
            continue

        if entry.is_file():
            try:
                stat = entry.stat()
                if stat.st_size > MAX_FILE_SIZE:
                    continue
                relative_path = entry.relative_to(relative_to).as_posix()
                documents.append(
                    SkillDocument(
                        path=relative_path,
                        mime_type=get_mime_type(entry.name),
                        size=stat.st_size,
                    )
                )
            except OSError:
                continue
        elif entry.is_dir():
            documents.extend(_scan_dir(full_path, relative_to, base_dir))

    return documents


def scan_documents(skill_dir: str | Path, base_dir: str | Path) -> list[SkillDocument]:
    """Scan a skill directory for all supplementary files.

    Excludes ``SKILL.md`` from the result. Per SEP-2640 §Skill Format the
    spelling is uppercase; lowercase ``skill.md`` is treated as a normal
    document.
    """
    skill_dir_p = Path(skill_dir)
    base_dir_p = Path(base_dir)
    documents: list[SkillDocument] = []
    skip_files = {"SKILL.md"}

    try:
        entries = list(skill_dir_p.iterdir())
    except OSError:
        return documents

    for entry in entries:
        full_path = entry
        if entry.is_dir():
            documents.extend(_scan_dir(full_path, skill_dir_p, base_dir_p))
        elif entry.is_file() and entry.name not in skip_files:
            if not is_path_within_base(full_path, base_dir_p):
                continue
            try:
                stat = entry.stat()
                if stat.st_size > MAX_FILE_SIZE:
                    continue
                relative_path = entry.relative_to(skill_dir_p).as_posix()
                documents.append(
                    SkillDocument(
                        path=relative_path,
                        mime_type=get_mime_type(entry.name),
                        size=stat.st_size,
                    )
                )
            except OSError:
                continue

    return documents


# ---------------------------------------------------------------------------
# Skill discovery
# ---------------------------------------------------------------------------


def _find_skill_files(
    dir_path: Path,
    skills_dir: Path,
    ancestor_has_skill: bool,
) -> list[tuple[Path, Path, str]]:
    """Recursively find all SKILL.md files under a directory.

    Returns a list of ``(skill_md_path, skill_dir, skill_path)`` tuples
    where ``skill_path`` is the relative directory path from ``skills_dir``
    to the directory containing SKILL.md, using forward slashes.

    Enforces the no-nesting constraint per SEP-2640: a SKILL.md cannot be
    an ancestor directory of another SKILL.md.
    """
    results: list[tuple[Path, Path, str]] = []

    if not dir_path.exists():
        return results

    try:
        entries = list(dir_path.iterdir())
    except OSError:
        return results

    # Per SEP-2640 §Skill Format the file is spelled ``SKILL.md``
    # (uppercase). On case-insensitive filesystems (Windows, default
    # macOS) this still resolves a file stored as ``skill.md``; we just
    # don't recognize a literal lowercase entry on case-sensitive Linux.
    skill_md_path: Path | None = None
    candidate = dir_path / "SKILL.md"
    if candidate.exists() and candidate.is_file():
        skill_md_path = candidate

    has_skill = skill_md_path is not None

    if has_skill and ancestor_has_skill:
        logger.warning(
            "Skipping nested SKILL.md at %s — ancestor directory already contains a skill",
            skill_md_path,
        )
    elif has_skill and skill_md_path is not None:
        try:
            relative = dir_path.relative_to(skills_dir).as_posix()
        except ValueError:
            relative = "."
        skill_path = relative if relative != "." else dir_path.name
        results.append((skill_md_path, dir_path, skill_path))

    for entry in entries:
        if not entry.is_dir():
            continue
        if not is_path_within_base(entry, skills_dir):
            continue
        results.extend(
            _find_skill_files(entry, skills_dir, ancestor_has_skill or has_skill)
        )

    return results


def load_skill_metadata(
    source_dir: str | Path,
    skill_path: str,
) -> SkillMetadata:
    """Build :class:`SkillMetadata` for a single skill at a given URI path.

    Reads ``source_dir/SKILL.md``, parses its YAML frontmatter, scans
    supplementary documents, and validates SEP-2640 constraints:

    * frontmatter ``name`` must equal the final segment of ``skill_path``
    * frontmatter ``name`` must satisfy the Agent Skills naming rules
    * SKILL.md size must be within :data:`MAX_FILE_SIZE`

    Raises :class:`ValueError` on any validation failure. Use this when
    you want to register a single skill at a hand-chosen ``skill_path``
    (i.e., not derived by directory layout); pair with
    :func:`register_skill` for the common case.
    """
    source_p = Path(source_dir).resolve()
    if not source_p.exists():
        raise ValueError(f"Source directory does not exist: {source_p}")

    # Per SEP-2640 §Skill Format the file is spelled ``SKILL.md``
    # (uppercase).
    candidate = source_p / "SKILL.md"
    if candidate.exists() and candidate.is_file():
        skill_md_path: Path | None = candidate
    else:
        skill_md_path = None
    if skill_md_path is None:
        raise ValueError(f"No SKILL.md found in {source_p}")

    stat = skill_md_path.stat()
    if stat.st_size > MAX_FILE_SIZE:
        raise ValueError(
            f"SKILL.md size {stat.st_size / 1024 / 1024:.2f}MB exceeds "
            f"{MAX_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )

    content = skill_md_path.read_text(encoding="utf-8")
    frontmatter, _ = _parse_frontmatter(content)
    fm_name = frontmatter.get("name")
    fm_description = frontmatter.get("description")
    if not isinstance(fm_name, str) or not fm_name.strip():
        raise ValueError(f"SKILL.md at {source_p}: missing 'name'")
    if not isinstance(fm_description, str) or not fm_description.strip():
        raise ValueError(f"SKILL.md at {source_p}: missing 'description'")

    name_clean = fm_name.strip()
    final_segment = skill_path.split("/")[-1]
    if final_segment != name_clean:
        raise ValueError(
            f"Frontmatter name {name_clean!r} does not match the final "
            f"segment of skill_path {skill_path!r}. Per SEP-2640, the "
            "final segment of the skill path MUST equal the frontmatter "
            "name."
        )
    if not _is_valid_skill_name(name_clean):
        raise ValueError(
            f"Frontmatter name {name_clean!r} does not satisfy the Agent "
            "Skills naming rules (lowercase letters, digits, hyphens; no "
            "leading/trailing hyphen)."
        )

    metadata: dict[str, str] = {}
    raw_metadata = frontmatter.get("metadata")
    if isinstance(raw_metadata, dict):
        for k, v in raw_metadata.items():
            if isinstance(v, str):
                metadata[k] = v

    documents = scan_documents(source_p, source_p)
    last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

    return SkillMetadata(
        name=name_clean,
        skill_path=skill_path,
        description=fm_description.strip(),
        absolute_path=str(skill_md_path),
        skill_dir=str(source_p),
        metadata=metadata or None,
        documents=documents,
        size=stat.st_size,
        last_modified=last_modified,
    )


def register_skill(
    server: Any,
    skill_path: str,
    source_dir: str | Path,
    options: RegisterSkillResourcesOptions | None = None,
) -> SkillMetadata:
    """Register a single skill at a given URI path.

    Imperative form — call it once per skill with the URI path you want
    the skill to live at and the source directory on disk::

        register_skill(server, "git-workflow", "./skills/git-workflow")
        register_skill(server, "acme/billing/refunds", "./skills/refunds")

    Each call registers the skill's ``SKILL.md`` and supporting files,
    plus emits ``skill://index.json`` for this single skill. For bulk
    registration of every skill under a directory tree, use
    :func:`discover_skills` + :func:`register_skill_resources` instead;
    mixing the two on the same server will yield two index resources
    and is not supported.

    For the decorator form shown in SEP-2640 §SDKs, see :func:`skill`.

    Returns the :class:`SkillMetadata` for the registered skill.
    """
    metadata = load_skill_metadata(source_dir, skill_path)
    register_skill_resources(server, {skill_path: metadata}, source_dir, options)
    return metadata


def skill(
    server: Any,
    skill_path: str,
    options: RegisterSkillResourcesOptions | None = None,
) -> Any:
    """Decorator form of :func:`register_skill`.

    Mirrors the SEP-2640 §SDKs example::

        @skill(server, "git-workflow")
        def git_workflow():
            return Path("./skills/git-workflow")

        @skill(server, "acme/billing/refunds")
        def refunds():
            return Path("./skills/refunds")

    The decorated function is invoked immediately to obtain the source
    directory; the skill is then registered at ``skill_path`` and the
    function is returned unchanged so callers can still reference it.
    """

    def decorator(fn: Any) -> Any:
        source_dir = fn()
        register_skill(server, skill_path, source_dir, options)
        return fn

    return decorator


def discover_skills(skills_dir: str | Path) -> dict[str, SkillMetadata]:
    """Discover all skills in a directory tree.

    Recursively scans for SKILL.md files at any depth (not just immediate
    subdirectories). The relative directory path from ``skills_dir``
    becomes the multi-segment ``skill_path`` used in skill:// URIs.

    Returns a dict keyed by ``skill_path`` (not name), since the path is
    the unique locator within a server.

    Per SEP-2640: validates that the final segment of ``skill_path``
    equals the frontmatter ``name`` field, and enforces the no-nesting
    constraint. Skills that fail validation are logged-and-skipped.
    """
    skill_map: dict[str, SkillMetadata] = {}
    resolved_dir = Path(skills_dir).resolve()

    if not resolved_dir.exists():
        logger.warning("Skills directory not found: %s", resolved_dir)
        return skill_map

    skill_files = _find_skill_files(resolved_dir, resolved_dir, False)

    for skill_md_path, skill_dir, skill_path in skill_files:
        try:
            stat = skill_md_path.stat()
        except OSError as err:
            logger.warning("Skipping %s: stat failed: %s", skill_md_path, err)
            continue

        if stat.st_size > MAX_FILE_SIZE:
            logger.warning(
                "Skipping %s: file size %.2fMB exceeds limit",
                skill_md_path,
                stat.st_size / 1024 / 1024,
            )
            continue

        if not is_path_within_base(skill_md_path, resolved_dir):
            logger.warning("Skipping %s: path escapes skills directory", skill_md_path)
            continue

        try:
            content = skill_md_path.read_text(encoding="utf-8")
            frontmatter, _ = _parse_frontmatter(content)
        except (OSError, ValueError, yaml.YAMLError) as err:
            logger.warning("Failed to parse skill at %s: %s", skill_dir, err)
            continue

        name = frontmatter.get("name")
        description = frontmatter.get("description")

        if not isinstance(name, str) or not name.strip():
            logger.warning("Skill at %s: missing or invalid 'name' field", skill_dir)
            continue
        if not isinstance(description, str) or not description.strip():
            logger.warning(
                "Skill at %s: missing or invalid 'description' field", skill_dir
            )
            continue

        # Extract optional metadata fields (string values only)
        metadata: dict[str, str] = {}
        raw_metadata = frontmatter.get("metadata")
        if isinstance(raw_metadata, dict):
            for k, v in raw_metadata.items():
                if isinstance(v, str):
                    metadata[k] = v

        # SEP constraint: final segment of skill_path MUST equal frontmatter name
        final_segment = skill_path.split("/")[-1]
        if final_segment != name.strip():
            logger.warning(
                "Skill at %s: frontmatter name %r does not match final path "
                "segment %r. Per SEP-2640, the final segment of the skill "
                "path must equal the frontmatter name.",
                skill_dir,
                name.strip(),
                final_segment,
            )
            continue

        # SEP §Index line 163 / Agent Skills naming rules: lowercase
        # letters, digits, hyphens. Required for the index.json URI
        # reservation to hold.
        if not _is_valid_skill_name(name.strip()):
            logger.warning(
                "Skill at %s: frontmatter name %r does not satisfy Agent "
                "Skills naming rules (lowercase letters, digits, hyphens; "
                "no leading/trailing hyphen).",
                skill_dir,
                name.strip(),
            )
            continue

        if skill_path in skill_map:
            logger.warning(
                "Duplicate skill path %r at %s — keeping first",
                skill_path,
                skill_md_path,
            )
            continue

        documents = scan_documents(skill_dir, resolved_dir)
        last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

        skill_map[skill_path] = SkillMetadata(
            name=name.strip(),
            skill_path=skill_path,
            description=description.strip(),
            absolute_path=str(skill_md_path),
            skill_dir=str(skill_dir),
            metadata=metadata or None,
            documents=documents,
            size=stat.st_size,
            last_modified=last_modified,
        )

    return skill_map


# ---------------------------------------------------------------------------
# Content loading
# ---------------------------------------------------------------------------


def load_skill_content(skill_path: str | Path, skills_dir: str | Path) -> str:
    """Load the full content of a SKILL.md file.

    Validates that the path is within the skills directory, only reads
    .md files, and enforces a file size limit.
    """
    skill_path_p = Path(skill_path)
    skills_dir_p = Path(skills_dir)

    if not str(skill_path_p).endswith(".md"):
        raise ValueError("Only .md files can be read")

    if not is_path_within_base(skill_path_p, skills_dir_p):
        raise ValueError("Path escapes the skills directory")

    stat = skill_path_p.stat()
    if stat.st_size > MAX_FILE_SIZE:
        raise ValueError(
            f"File size {stat.st_size / 1024 / 1024:.2f}MB exceeds "
            f"{MAX_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )

    return skill_path_p.read_text(encoding="utf-8")


def load_document(
    skill: SkillMetadata,
    document_path: str,
    skills_dir: str | Path,
    is_text: bool,
) -> dict[str, str]:
    """Load a supplementary document from a skill directory.

    Returns ``{"text": ...}`` for text MIME types and ``{"blob": ...}``
    (base64-encoded) for binary.
    """
    if ".." in document_path.split("/"):
        raise ValueError("Path traversal not allowed")

    if Path(document_path).is_absolute():
        raise ValueError("Absolute paths not allowed")

    full_path = Path(skill.skill_dir) / document_path

    if not is_path_within_base(full_path, skills_dir):
        raise ValueError("Path escapes the skills directory")

    stat = full_path.stat()
    if stat.st_size > MAX_FILE_SIZE:
        raise ValueError(
            f"File size {stat.st_size / 1024 / 1024:.2f}MB exceeds "
            f"{MAX_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )

    if is_text:
        return {"text": full_path.read_text(encoding="utf-8")}
    import base64

    return {"blob": base64.b64encode(full_path.read_bytes()).decode("ascii")}


# ---------------------------------------------------------------------------
# Index generation
# ---------------------------------------------------------------------------


def _resolve_archive_format(decl: SkillArchiveDeclaration) -> ArchiveFormat:
    """Resolve an archive declaration's format from the path suffix when
    not explicitly set.
    """
    if decl.format is not None:
        return decl.format
    lower = decl.archive_path.lower()
    if lower.endswith(".tar.gz") or lower.endswith(".tgz"):
        return "tar.gz"
    if lower.endswith(".zip"):
        return "zip"
    raise ValueError(
        f"Cannot infer archive format from path {decl.archive_path!r}. "
        "Set format='tar.gz' or 'zip' explicitly."
    )


def _archive_resource_uri(decl: SkillArchiveDeclaration) -> str:
    """Build the resource URI an archive is served under, per SEP-2640
    (``skill://<skill_path>.<format>``).
    """
    fmt = _resolve_archive_format(decl)
    return f"{SKILL_URI_SCHEME}{decl.skill_path}{archive_suffix(fmt)}"


def generate_skill_index(
    skill_map: dict[str, SkillMetadata],
    *,
    archives: list[SkillArchiveDeclaration] | None = None,
    templates: list[SkillTemplateDeclaration] | None = None,
) -> SkillIndex:
    """Generate the ``skill://index.json`` discovery index.

    Follows the Agent Skills well-known URI discovery index format
    (``$schema = SKILL_INDEX_SCHEMA``). Includes one entry per skill in
    ``skill_map`` (``type="skill-md"``), one per archive declaration
    (``type="archive"``), and one per template declaration
    (``type="mcp-resource-template"``).

    Per SEP-2640 §Index, this binding omits the ``digest`` field. We do
    not emit it.
    """
    archives = archives or []
    templates = templates or []

    skill_entries: list[Any] = [
        SkillMdIndexEntry(
            name=skill.name,
            type="skill-md",
            description=skill.description,
            url=build_skill_uri(skill_path),
        )
        for skill_path, skill in skill_map.items()
    ]

    archive_entries: list[Any] = []
    for a in archives:
        # SEP constraint: final segment of skill_path MUST equal name
        final_segment = a.skill_path.split("/")[-1]
        if final_segment != a.name:
            raise ValueError(
                f"Archive declaration: skill_path {a.skill_path!r} final "
                f"segment {final_segment!r} does not match name {a.name!r}. "
                "Per SEP-2640, the final segment of the skill path MUST "
                "equal the frontmatter name."
            )
        if not _is_valid_skill_name(a.name):
            raise ValueError(
                f"Archive declaration: name {a.name!r} does not satisfy the "
                "Agent Skills naming rules (lowercase letters, digits, "
                "hyphens; no leading/trailing hyphen)."
            )
        archive_entries.append(
            _ArchiveEntry(
                name=a.name,
                type="archive",
                description=a.description,
                url=_archive_resource_uri(a),
            )
        )

    template_entries: list[Any] = [
        _TemplateEntry(
            type="mcp-resource-template",
            description=t.description,
            url=t.uri_template,
        )
        for t in templates
    ]

    # Use model_validate so the alias_generator + explicit alias="$schema"
    # field is satisfied at construction. Direct kwargs construction
    # confuses mypy when alias_generator is set.
    return SkillIndex.model_validate(
        {
            "$schema": _SKILL_INDEX_SCHEMA,
            "skills": [*skill_entries, *archive_entries, *template_entries],
        }
    )


# ---------------------------------------------------------------------------
# Resource registration
# ---------------------------------------------------------------------------


#: Reverse-domain prefix for skill-specific keys in MCP resource ``_meta``,
#: per SEP-2640 §Resource Metadata: "implementations SHOULD use the
#: ``io.modelcontextprotocol.skills/`` reverse-domain prefix".
_META_PREFIX = "io.modelcontextprotocol.skills/"


def _import_function_resource() -> Any:
    """Import FunctionResource lazily so the SDK can be imported without
    the ``mcp`` package present (e.g., for type-only consumers).
    """
    from mcp.server.fastmcp.resources import FunctionResource

    return FunctionResource


def _import_annotations() -> Any:
    """Import the MCP ``Annotations`` type lazily."""
    from mcp.types import Annotations

    return Annotations


def _build_skill_meta(
    *,
    last_modified: str | None,
    extra_frontmatter: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build the ``_meta`` dict for a skill resource.

    Per SEP-2640 §Resource Metadata, skill-specific ``_meta`` keys use
    the ``io.modelcontextprotocol.skills/`` reverse-domain prefix. We
    surface:

    * ``io.modelcontextprotocol.skills/lastModified`` — ISO 8601 timestamp.
    * ``io.modelcontextprotocol.skills/<key>`` — for each user-supplied
      frontmatter ``metadata`` field, so server authors can pass
      additional fields through to clients per SEP-2640 line 93.
    """
    meta: dict[str, Any] = {}
    if last_modified:
        meta[f"{_META_PREFIX}lastModified"] = last_modified
    if extra_frontmatter:
        for key, value in extra_frontmatter.items():
            meta[f"{_META_PREFIX}{key}"] = value
    return meta


def _register_template(
    resource_manager: Any,
    decl: SkillTemplateDeclaration,
    _inspect: Any,
    _re: Any,
) -> None:
    """Register one user-declared template on the resource manager.

    Each call gets its own closure scope so that ``decl`` and its
    callbacks bind correctly even when invoked in a loop.
    """
    if decl.read is None:
        return

    decl_read = decl.read
    uri_template = decl.uri_template

    async def template_fn(**variables: str) -> Any:
        uri = uri_template
        for k, v in variables.items():
            uri = uri.replace("{" + k + "}", v)
        result = decl_read(uri, dict(variables))
        if hasattr(result, "__await__"):
            result = await result
        if result.text is not None:
            return result.text
        if result.blob is not None:
            import base64

            return base64.b64decode(result.blob)
        return ""

    # Inject URI variables into the function signature so FastMCP can
    # introspect them.
    var_names = _re.findall(r"\{(\+?[a-zA-Z_][a-zA-Z0-9_]*)\}", uri_template)
    var_names = [v.lstrip("+") for v in var_names]
    params = [
        _inspect.Parameter(v, _inspect.Parameter.KEYWORD_ONLY, annotation=str)
        for v in var_names
    ]
    template_fn.__signature__ = _inspect.Signature(  # type: ignore[attr-defined]
        parameters=params, return_annotation=str
    )

    resource_manager.add_template(
        fn=template_fn,
        uri_template=uri_template,
        name=f"template:{decl.name}",
        description=decl.description,
        mime_type="text/markdown",
    )

    # Per-variable completion handlers (decl.complete) are wired in
    # bulk by _install_completion_handler() once all templates have
    # been registered — see register_skill_resources().


def register_skill_resources(
    server: Any,
    skill_map: dict[str, SkillMetadata],
    skills_dir: str | Path,
    options: RegisterSkillResourcesOptions | None = None,
) -> None:
    """Register MCP resources for all discovered skills on a FastMCP server.

    Registers, per skill:
      * ``skill://<skill_path>/SKILL.md`` — skill content (one per skill).
      * ``skill://<skill_path>/<file-path>`` — one static resource per
        supporting file (instead of TS's catch-all template; see module
        docstring).

    Always registers:
      * ``skill://index.json`` — well-known discovery index.

    Optionally registers archives and user-declared templates.

    Per SEP-2640, user-declared templates with a ``read`` callback are
    registered before any catch-all-style template would be (the Python
    SDK doesn't use a catch-all, so order is moot, but we preserve the
    invariant for parity).
    """
    opts = options if options is not None else RegisterSkillResourcesOptions()
    skills_dir_p = Path(skills_dir)
    audience = opts.audience

    function_resource_cls = _import_function_resource()
    annotations_cls = _import_annotations()

    def _annotations(audience_list: list[str], priority: float) -> Any:
        return annotations_cls(audience=list(audience_list), priority=priority)

    # Latest mtime across skills, used as the lastModified for synthetic
    # resources (index, templates) that aggregate over the skill set.
    latest_modified: str | None = None
    if skill_map:
        latest_modified = max(skill.last_modified for skill in skill_map.values())

    # ---- Archive resources (registered before the index so the index
    # ---- entries reference valid resources).
    for archive in opts.archives:
        fmt = _resolve_archive_format(archive)
        uri = _archive_resource_uri(archive)
        mime = archive_mime_type(fmt)
        archive_path = Path(archive.archive_path)

        try:
            archive_bytes = archive_path.read_bytes()
        except OSError as err:
            raise ValueError(
                f"Failed to read archive {archive.archive_path!r} for skill "
                f"{archive.name!r}: {err}"
            ) from err

        try:
            archive_modified = datetime.fromtimestamp(
                archive_path.stat().st_mtime, tz=timezone.utc
            ).isoformat()
        except OSError:
            archive_modified = datetime.now(tz=timezone.utc).isoformat()

        bound_bytes = archive_bytes

        def make_archive_fn(payload: bytes) -> Any:
            def read_archive() -> bytes:
                return payload

            return read_archive

        server.add_resource(
            function_resource_cls(
                uri=cast(Any, uri),
                name=f"{archive.name}-archive",
                description=f"{archive.description} (archive distribution)",
                mime_type=mime,
                fn=make_archive_fn(bound_bytes),
                annotations=_annotations(audience, 0.9),
                meta=_build_skill_meta(last_modified=archive_modified),
            )
        )

    # ---- Per-skill SKILL.md
    for skill_path, skill in skill_map.items():
        skill_audience = skill.audience or audience
        absolute_path = skill.absolute_path
        bound_skills_dir = str(skills_dir_p)

        def make_skill_fn(path: str, base: str) -> Any:
            def read_skill() -> str:
                return load_skill_content(path, base)

            return read_skill

        server.add_resource(
            function_resource_cls(
                uri=cast(Any, build_skill_uri(skill_path)),
                name=skill.name,
                description=skill.description,
                mime_type="text/markdown",
                fn=make_skill_fn(absolute_path, bound_skills_dir),
                annotations=_annotations(skill_audience, 1.0),
                meta=_build_skill_meta(
                    last_modified=skill.last_modified,
                    extra_frontmatter=skill.metadata,
                ),
            )
        )

        # ---- Per-document supporting files (replaces TS catch-all
        # template; FastMCP's template matcher doesn't support RFC 6570
        # reserved expansion).
        for doc in skill.documents:
            doc_uri = f"{SKILL_URI_SCHEME}{skill_path}/{doc.path}"
            doc_full_path = str(Path(skill.skill_dir) / doc.path)
            is_text = is_text_mime_type(doc.mime_type)

            def make_doc_fn(full: str, base: str, text: bool) -> Any:
                def read_doc() -> str | bytes:
                    if text:
                        return Path(full).read_text(encoding="utf-8")
                    return Path(full).read_bytes()

                return read_doc

            server.add_resource(
                function_resource_cls(
                    uri=cast(Any, doc_uri),
                    name=f"{skill.name}/{doc.path}",
                    description=f"Supporting file for skill {skill.name!r}",
                    mime_type=doc.mime_type,
                    fn=make_doc_fn(doc_full_path, str(skills_dir_p), is_text),
                    annotations=_annotations(skill_audience, 0.2),
                    meta=_build_skill_meta(last_modified=skill.last_modified),
                )
            )

    # ---- skill://index.json
    index = generate_skill_index(
        skill_map,
        archives=opts.archives,
        templates=opts.templates,
    )
    index_json_str = json.dumps(
        index.model_dump(by_alias=True, exclude_none=True),
        indent=2,
    )

    def index_fn() -> str:
        return index_json_str

    server.add_resource(
        function_resource_cls(
            uri=cast(Any, INDEX_JSON_URI),
            name="skills-index",
            description=(
                "Discovery index of available skills, following the Agent "
                "Skills well-known URI format"
            ),
            mime_type="application/json",
            fn=index_fn,
            annotations=_annotations(["assistant"], 0.8),
            meta=_build_skill_meta(last_modified=latest_modified),
        )
    )

    # ---- User-declared resource templates (parameterized skill namespaces).
    # Registered after per-skill resources so static resources are matched
    # first (FastMCP checks concrete resources before templates).
    resource_manager = getattr(server, "_resource_manager", None)
    if resource_manager is None:
        return

    import inspect as _inspect
    import re as _re

    for decl in opts.templates:
        if decl.read is None:
            continue
        _register_template(resource_manager, decl, _inspect, _re)

    # ---- Per SEP-2640 §Discovery: a server SHOULD register the same
    # ---- url value as an MCP resource template "so hosts can wire
    # ---- template variables to the completion API." Wire each
    # ---- decl.complete callback into FastMCP's single completion
    # ---- handler.
    completion_dispatch: dict[str, dict[str, Any]] = {}
    for decl in opts.templates:
        if decl.complete:
            completion_dispatch[decl.uri_template] = dict(decl.complete)
    if completion_dispatch:
        _install_completion_handler(server, completion_dispatch)


def _install_completion_handler(
    server: Any, dispatch: dict[str, dict[str, Any]]
) -> None:
    """Install a single completion handler on ``server`` that routes to
    the right per-variable callback based on the resource template URI.

    No-op if the server already has a completion handler registered (we
    don't override caller-installed handlers).
    """
    completion_decorator = getattr(server, "completion", None)
    if not callable(completion_decorator):
        logger.debug(
            "Server does not expose a completion() decorator; skipping "
            "template completion wiring."
        )
        return

    inner = getattr(server, "_mcp_server", None)
    if inner is not None:
        try:
            from mcp.types import CompleteRequest

            if CompleteRequest in getattr(inner, "request_handlers", {}):
                logger.warning(
                    "A completion handler is already registered on the "
                    "server; skipping skills template completion wiring "
                    "to avoid clobbering the caller's handler."
                )
                return
        except ImportError:
            pass

    from mcp.types import (
        Completion,
        CompletionArgument,
        CompletionContext,
        PromptReference,
        ResourceTemplateReference,
    )

    async def skills_completion_handler(
        ref: PromptReference | ResourceTemplateReference,
        argument: CompletionArgument,
        context: CompletionContext | None,
    ) -> Completion | None:
        if not isinstance(ref, ResourceTemplateReference):
            return None
        callbacks = dispatch.get(ref.uri)
        if callbacks is None:
            return None
        cb = callbacks.get(argument.name)
        if cb is None:
            return None
        bound = context.arguments if context and context.arguments else None
        result = cb(argument.value, bound)
        if hasattr(result, "__await__"):
            result = await result
        return Completion(values=list(result))

    completion_decorator()(skills_completion_handler)


__all__ = [
    "MAX_FILE_SIZE",
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
