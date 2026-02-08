"""
Skills as Resources — MCP Server (Python)

A minimal reference implementation demonstrating the Resources approach
from the Skills Over MCP Interest Group: exposing agent skills via
MCP resources using the skill:// URI scheme.

Exposes resources:
  - skill://index              — JSON index of all available skills
  - skill://prompt-xml         — XML for system prompt injection
  - skill://{name}             — Individual skill SKILL.md content
  - skill://{name}/documents   — List of supplementary files
  - skill://{name}/document/{document_path} — Individual document (template)

Note: The Python MCP SDK does not support RFC 6570 {+path} expansion,
so document paths containing "/" are URL-encoded (e.g., references%2FREFERENCE.md).
The SDK automatically URL-decodes them after template matching.

Inspired by:
- skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
- skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)

License: Apache-2.0
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

from mcp.server.fastmcp import FastMCP

from .resource_helpers import generate_skills_xml
from .skill_discovery import discover_skills, load_document, load_skill_content

# Resolve skills directory from CLI arg or default to ../sample-skills
if len(sys.argv) > 1:
    skills_dir = str(Path(sys.argv[1]).resolve())
else:
    skills_dir = str(
        Path(__file__).resolve().parent.parent.parent.parent / "sample-skills"
    )

# Discover skills at startup
skill_map = discover_skills(skills_dir)
skill_names = list(skill_map.keys())

print(
    f"[skills-as-resources] Discovered {len(skill_map)} skill(s): "
    f"{', '.join(skill_names) or 'none'}",
    file=sys.stderr,
)
for name, skill in skill_map.items():
    if skill.documents:
        print(
            f"  - {name}: {len(skill.documents)} document(s)",
            file=sys.stderr,
        )

# Create MCP server
mcp = FastMCP(
    name="skills-as-resources-example",
)


def _encode_document_path(path: str) -> str:
    """URL-encode a document path for use in skill:// URIs.

    The Python MCP SDK uses [^/]+ regex for template parameters,
    so forward slashes in paths must be percent-encoded.
    """
    return quote(path, safe="")


def _build_index() -> list[dict]:
    """Build the JSON index of all skills."""
    index = []
    for s in skill_map.values():
        entry: dict = {
            "name": s.name,
            "description": s.description,
            "uri": f"skill://{s.name}",
            "documentCount": len(s.documents),
        }
        if s.documents:
            entry["documentsUri"] = f"skill://{s.name}/documents"
        if s.metadata:
            entry["metadata"] = s.metadata
        index.append(entry)
    return index


def _build_document_list(skill_name: str) -> dict:
    """Build the document list for a skill."""
    skill = skill_map[skill_name]
    return {
        "skill": skill_name,
        "documents": [
            {
                "path": doc.path,
                "mimeType": doc.mime_type,
                "size": doc.size,
                "uri": f"skill://{skill_name}/document/{_encode_document_path(doc.path)}",
            }
            for doc in skill.documents
        ],
    }


# --- Static resources ---

@mcp.resource(
    "skill://index",
    name="skills-index",
    description=(
        "Index of all available skills with their descriptions, URIs, and document counts. "
        f"Currently available: {', '.join(skill_names) or 'none'}"
    ),
    mime_type="application/json",
)
def get_index() -> str:
    """Return JSON index of all available skills."""
    return json.dumps(_build_index(), indent=2)


@mcp.resource(
    "skill://prompt-xml",
    name="skills-prompt-xml",
    description="XML representation of available skills for injecting into system prompts",
    mime_type="application/xml",
)
def get_prompt_xml() -> str:
    """Return XML representation for system prompt injection."""
    return generate_skills_xml(skill_map)


# Per-skill static resources registered in a loop.
# Uses closure binding to avoid Python's late-binding issue.
for _skill_name, _skill_meta in skill_map.items():

    def _register_skill(s_name: str, s_meta):  # noqa: ANN001
        @mcp.resource(
            f"skill://{s_name}",
            name=f"skill-{s_name}",
            description=s_meta.description,
            mime_type="text/markdown",
        )
        def _get_skill() -> str:
            try:
                return load_skill_content(s_meta.path, skills_dir)
            except (OSError, ValueError) as exc:
                return f'# Error\n\nFailed to load skill "{s_name}": {exc}'

        if s_meta.documents:
            @mcp.resource(
                f"skill://{s_name}/documents",
                name=f"skill-{s_name}-documents",
                description=f"List of supplementary documents for the {s_name} skill",
                mime_type="application/json",
            )
            def _get_documents() -> str:
                return json.dumps(_build_document_list(s_name), indent=2)

    _register_skill(_skill_name, _skill_meta)


# --- Dynamic resource template ---

@mcp.resource(
    "skill://{skill_name}/document/{document_path}",
    name="skill-document",
    description="Fetch a specific supplementary document from a skill",
    mime_type="text/plain",
)
def get_document(skill_name: str, document_path: str) -> str:
    """Fetch a supplementary document from a skill.

    The document_path is automatically URL-decoded by the SDK,
    so encoded paths like "references%2FREFERENCE.md" arrive as
    "references/REFERENCE.md".
    """
    skill = skill_map.get(skill_name)
    if not skill:
        available = ", ".join(skill_names) or "none"
        return f'# Error\n\nSkill "{skill_name}" not found. Available: {available}'

    doc = next((d for d in skill.documents if d.path == document_path), None)
    if not doc:
        available = "\n".join(f"- {d.path}" for d in skill.documents)
        return (
            f'# Error\n\nDocument "{document_path}" not found in skill "{skill_name}".\n\n'
            f"## Available Documents\n\n{available or 'No documents available.'}"
        )

    try:
        return load_document(skill, document_path, skills_dir)
    except (OSError, ValueError) as exc:
        return f"# Error\n\nFailed to read document: {exc}"


def main() -> None:
    """Entry point: run the MCP server via stdio transport."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
