"""XML generation for the client-side system-prompt skills catalog."""

from __future__ import annotations

from ._types import SkillSummary


def _escape_xml(text: str) -> str:
    """Escape XML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def generate_skills_xml_from_summaries(
    skills: list[SkillSummary],
    server_name: str | None = None,
) -> str:
    """Generate ``<available_skills>`` XML from a SkillSummary list.

    When ``server_name`` is provided, each entry includes a ``<server>``
    tag so the model has the server name in context next to the URI it
    would pass to a ``(server, uri)`` reader tool.
    """
    lines: list[str] = ["<available_skills>"]
    for skill in skills:
        lines.append("  <skill>")
        lines.append(f"    <name>{_escape_xml(skill.name)}</name>")
        lines.append(f"    <path>{_escape_xml(skill.skill_path)}</path>")
        if server_name:
            lines.append(f"    <server>{_escape_xml(server_name)}</server>")
        if skill.description:
            lines.append(
                f"    <description>{_escape_xml(skill.description)}</description>"
            )
        lines.append(f"    <uri>{_escape_xml(skill.uri)}</uri>")
        lines.append("  </skill>")
    lines.append("</available_skills>")
    return "\n".join(lines)


__all__ = ["generate_skills_xml_from_summaries"]
