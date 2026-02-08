"""
Resource helper utilities for the Skills as Resources implementation.

Provides XML generation for system prompt injection and MIME type mapping
for skill documents.

Inspired by:
- skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
"""

from __future__ import annotations

import os
from xml.sax.saxutils import escape

from .skill_discovery import SkillMetadata

# Map file extensions to MIME types
MIME_TYPES: dict[str, str] = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".sh": "text/x-shellscript",
    ".bash": "text/x-shellscript",
    ".json": "application/json",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".xml": "application/xml",
    ".html": "text/html",
    ".css": "text/css",
    ".sql": "text/x-sql",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
}


def get_mime_type(filepath: str) -> str:
    """Get the MIME type for a file based on its extension."""
    _, ext = os.path.splitext(filepath)
    return MIME_TYPES.get(ext.lower(), "application/octet-stream")


def generate_skills_xml(skill_map: dict[str, SkillMetadata]) -> str:
    """Generate <available_skills> XML for injecting into system prompts.

    Format:
        <available_skills>
          <skill>
            <name>code-review</name>
            <description>Perform structured code reviews...</description>
            <uri>skill://code-review</uri>
          </skill>
        </available_skills>
    """
    lines: list[str] = ["<available_skills>"]

    for skill in skill_map.values():
        lines.append("  <skill>")
        lines.append(f"    <name>{escape(skill.name)}</name>")
        lines.append(f"    <description>{escape(skill.description)}</description>")
        lines.append(f"    <uri>skill://{escape(skill.name)}</uri>")
        lines.append("  </skill>")

    lines.append("</available_skills>")
    return "\n".join(lines)
