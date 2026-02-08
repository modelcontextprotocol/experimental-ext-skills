"""
Skill discovery and content loading module.

Discovers Agent Skills by scanning a directory for subdirectories
containing SKILL.md files, parses YAML frontmatter for metadata,
and provides secure content loading.

Inspired by:
- skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
- skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# Maximum file size for skill files (1MB)
MAX_FILE_SIZE = 1 * 1024 * 1024


@dataclass
class SkillMetadata:
    """Metadata extracted from a skill's SKILL.md YAML frontmatter."""

    name: str
    description: str
    path: str  # Absolute path to the SKILL.md file
    metadata: dict[str, str] = field(default_factory=dict)


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from SKILL.md content.

    Returns (frontmatter_dict, body_text).
    """
    if not content.startswith("---"):
        raise ValueError("SKILL.md must start with YAML frontmatter (---)")

    parts = content.split("---")
    if len(parts) < 3:
        raise ValueError("SKILL.md frontmatter not properly closed with ---")

    # Use safe_load to prevent arbitrary code execution
    frontmatter = yaml.safe_load(parts[1])
    if not isinstance(frontmatter, dict):
        raise ValueError("SKILL.md frontmatter must be a YAML mapping")

    body = "---".join(parts[2:]).strip()
    return frontmatter, body


def _is_path_within_base(target: Path, base: Path) -> bool:
    """Check if a resolved path is within the allowed base directory."""
    try:
        resolved_base = base.resolve(strict=True)
        resolved_target = target.resolve(strict=True)
        return resolved_target == resolved_base or str(resolved_target).startswith(
            str(resolved_base) + "/"
        ) or str(resolved_target).startswith(str(resolved_base) + "\\")
    except OSError:
        # Fall back to non-strict resolve
        resolved_base = base.resolve()
        resolved_target = target.resolve()
        return str(resolved_target).startswith(str(resolved_base) + "/") or str(
            resolved_target
        ).startswith(str(resolved_base) + "\\")


def discover_skills(skills_dir: str) -> dict[str, SkillMetadata]:
    """Discover all skills in a directory.

    Scans for immediate subdirectories containing SKILL.md files.
    Security: skips files larger than MAX_FILE_SIZE, validates frontmatter.
    """
    skill_map: dict[str, SkillMetadata] = {}
    resolved_dir = Path(skills_dir).resolve()

    if not resolved_dir.is_dir():
        logger.error("Skills directory not found: %s", resolved_dir)
        return skill_map

    for entry in resolved_dir.iterdir():
        if not entry.is_dir():
            continue

        # Find SKILL.md (prefer uppercase, accept lowercase)
        skill_md_path = None
        for name in ("SKILL.md", "skill.md"):
            candidate = entry / name
            if candidate.exists():
                skill_md_path = candidate
                break

        if skill_md_path is None:
            continue

        # Security: check file size before reading
        stat = skill_md_path.stat()
        if stat.st_size > MAX_FILE_SIZE:
            logger.error(
                "Skipping %s: file size %.2fMB exceeds limit",
                skill_md_path,
                stat.st_size / 1024 / 1024,
            )
            continue

        # Security: verify path is within skills directory
        if not _is_path_within_base(skill_md_path, resolved_dir):
            logger.error(
                "Skipping %s: path escapes skills directory", skill_md_path
            )
            continue

        try:
            content = skill_md_path.read_text(encoding="utf-8")
            frontmatter, _body = _parse_frontmatter(content)

            name = frontmatter.get("name")
            description = frontmatter.get("description")

            if not isinstance(name, str) or not name.strip():
                logger.error(
                    "Skill at %s: missing or invalid 'name' field", entry
                )
                continue
            if not isinstance(description, str) or not description.strip():
                logger.error(
                    "Skill at %s: missing or invalid 'description' field", entry
                )
                continue

            # Extract optional metadata
            extra_metadata: dict[str, str] = {}
            raw_meta = frontmatter.get("metadata")
            if isinstance(raw_meta, dict):
                for k, v in raw_meta.items():
                    if isinstance(v, str):
                        extra_metadata[k] = v

            skill_name = name.strip()
            if skill_name in skill_map:
                logger.warning(
                    "Duplicate skill name '%s' at %s — keeping first",
                    skill_name,
                    skill_md_path,
                )
                continue

            skill_map[skill_name] = SkillMetadata(
                name=skill_name,
                description=description.strip(),
                path=str(skill_md_path),
                metadata=extra_metadata if extra_metadata else {},
            )
        except (OSError, ValueError) as exc:
            logger.error("Failed to parse skill at %s: %s", entry, exc)

    return skill_map


def load_skill_content(skill_path: str, skills_dir: str) -> str:
    """Load the full content of a SKILL.md file.

    Security: validates path is within skills directory, only reads .md files,
    and enforces a file size limit.
    """
    target = Path(skill_path)
    base = Path(skills_dir)

    # Security: only allow .md files
    if target.suffix.lower() != ".md":
        raise ValueError("Only .md files can be read")

    # Security: verify path is within skills directory
    if not _is_path_within_base(target, base):
        raise ValueError("Path escapes the skills directory")

    # Security: check file size
    stat = target.stat()
    if stat.st_size > MAX_FILE_SIZE:
        raise ValueError(
            f"File size {stat.st_size / 1024 / 1024:.2f}MB exceeds "
            f"{MAX_FILE_SIZE / 1024 / 1024:.0f}MB limit"
        )

    return target.read_text(encoding="utf-8")
