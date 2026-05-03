"""URI parsing and building utilities for ``skill://`` URIs.

Supports multi-segment skill paths per SEP-2640::

    skill://code-review/SKILL.md                       (single-segment)
    skill://acme/billing/refunds/SKILL.md              (multi-segment)
    skill://acme/billing/refunds/templates/email.md    (supporting file)

Per SEP-2640: the final segment of ``<skill-path>`` MUST equal the skill's
frontmatter name. Preceding segments are a server-chosen organizational
prefix.

**Important**: per SEP-2640 §Resource Mapping, "the first segment of
``<skill-path>`` occupies the authority component" but "carries no special
semantics under this convention and clients MUST NOT attempt DNS or
network resolution of it." This means we **cannot** use
:func:`urllib.parse.urlparse` here — it would treat the first segment as a
host and split the URI incorrectly. We use raw string slicing, mirroring
the TS SDK's ``parseSkillUri`` implementation exactly.
"""

from __future__ import annotations

from dataclasses import dataclass

#: The ``skill://`` URI scheme prefix.
SKILL_URI_SCHEME = "skill://"

#: Default skill content filename.
SKILL_FILENAME = "SKILL.md"

#: Well-known URI for the skill index (SEP discovery mechanism).
INDEX_JSON_URI = "skill://index.json"


@dataclass(frozen=True)
class ParsedSkillUri:
    """Parsed components of a ``skill://`` URI."""

    skill_path: str
    """Multi-segment skill path (e.g., "acme/billing/refunds")."""

    file_path: str
    """File path within the skill (e.g., "SKILL.md", "templates/email.md")."""


def parse_skill_uri(uri: str) -> ParsedSkillUri | None:
    """Parse a ``skill://`` URI into skill path and file path components.

    For SKILL.md URIs, the split is unambiguous because the last segment is
    a known sentinel. For supporting file URIs, the caller must use
    :func:`resolve_skill_file_uri` with known skill paths.

    Returns ``None`` if the URI doesn't match the ``skill://`` scheme or is
    the special index.json URI.

    Examples::

        parse_skill_uri("skill://code-review/SKILL.md")
        # -> ParsedSkillUri(skill_path="code-review", file_path="SKILL.md")

        parse_skill_uri("skill://acme/billing/refunds/SKILL.md")
        # -> ParsedSkillUri(skill_path="acme/billing/refunds", file_path="SKILL.md")
    """
    if not uri.startswith(SKILL_URI_SCHEME):
        return None

    rest = uri[len(SKILL_URI_SCHEME) :]
    if not rest or rest == "index.json":
        return None

    slash_index = rest.rfind("/")
    if slash_index == -1:
        return None

    before_last = rest[:slash_index]
    after_last = rest[slash_index + 1 :]

    # Per SEP-2640 §Skill Format, the file is spelled ``SKILL.md``
    # (uppercase). We match exactly to keep URI generation and parsing
    # symmetric across implementations.
    if after_last == SKILL_FILENAME:
        return ParsedSkillUri(skill_path=before_last, file_path=after_last)

    # For arbitrary file paths, we can't determine the split from the URI
    # alone. Return with empty skill_path — caller should use
    # resolve_skill_file_uri().
    return ParsedSkillUri(skill_path="", file_path=rest)


def resolve_skill_file_uri(
    uri: str,
    known_skill_paths: list[str],
) -> ParsedSkillUri | None:
    """Resolve a ``skill://`` URI for a supporting file by matching against
    known skill paths.

    Uses longest-prefix matching to handle nested hierarchies.

    Example::

        resolve_skill_file_uri(
            "skill://acme/billing/refunds/templates/email.md",
            ["code-review", "acme/billing/refunds", "acme/onboarding"],
        )
        # -> ParsedSkillUri(skill_path="acme/billing/refunds",
        #                   file_path="templates/email.md")
    """
    if not uri.startswith(SKILL_URI_SCHEME):
        return None

    rest = uri[len(SKILL_URI_SCHEME) :]

    # Sort by length descending for longest-prefix match
    sorted_paths = sorted(known_skill_paths, key=len, reverse=True)
    for sp in sorted_paths:
        if rest.startswith(sp + "/"):
            return ParsedSkillUri(skill_path=sp, file_path=rest[len(sp) + 1 :])

    return None


def build_skill_uri(skill_path: str, file_path: str | None = None) -> str:
    """Build a ``skill://`` URI from a multi-segment skill path and optional
    file path.

    Defaults to SKILL.md if no file path is provided.

    Examples::

        build_skill_uri("acme/billing/refunds")
        # -> "skill://acme/billing/refunds/SKILL.md"

        build_skill_uri("code-review", "references/REFERENCE.md")
        # -> "skill://code-review/references/REFERENCE.md"
    """
    return f"{SKILL_URI_SCHEME}{skill_path}/{file_path or SKILL_FILENAME}"


def is_skill_content_uri(uri: str) -> bool:
    """Check if a URI points to a skill's SKILL.md content.

    Per SEP-2640 §Skill Format, the file is spelled ``SKILL.md`` (uppercase).
    """
    parsed = parse_skill_uri(uri)
    if parsed is None:
        return False
    return parsed.file_path == SKILL_FILENAME


def is_index_json_uri(uri: str) -> bool:
    """Check if a URI is the well-known skill index resource."""
    return uri == INDEX_JSON_URI


__all__ = [
    "INDEX_JSON_URI",
    "SKILL_FILENAME",
    "SKILL_URI_SCHEME",
    "ParsedSkillUri",
    "build_skill_uri",
    "is_index_json_uri",
    "is_skill_content_uri",
    "parse_skill_uri",
    "resolve_skill_file_uri",
]
