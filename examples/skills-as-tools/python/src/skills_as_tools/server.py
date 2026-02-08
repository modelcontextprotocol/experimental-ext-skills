"""
Skills as Tools — MCP Server (Python)

A minimal reference implementation demonstrating Approach 3 from the
Skills Over MCP Interest Group: exposing agent skills via MCP tools.

Exposes two tools:
  - list_skills: Returns skill names and descriptions (progressive disclosure)
  - read_skill:  Returns the full SKILL.md content for a named skill

Inspired by:
- skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
- skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)

License: Apache-2.0
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from .skill_discovery import discover_skills, load_skill_content

# Resolve skills directory from CLI arg or default to ../sample-skills
if len(sys.argv) > 1:
    skills_dir = str(Path(sys.argv[1]).resolve())
else:
    skills_dir = str(Path(__file__).resolve().parent.parent.parent.parent / "sample-skills")

# Discover skills at startup
skill_map = discover_skills(skills_dir)
skill_names = list(skill_map.keys())

print(
    f"[skills-as-tools] Discovered {len(skill_map)} skill(s): "
    f"{', '.join(skill_names) or 'none'}",
    file=sys.stderr,
)

# Create MCP server
mcp = FastMCP(
    name="skills-as-tools-example",
)


@mcp.tool(
    description=(
        "List all available skills with their names and descriptions. "
        f"Currently available: {', '.join(skill_names) or 'none'}"
    ),
)
def list_skills() -> str:
    """List all available skills (progressive disclosure — summaries only)."""
    summaries = [
        {"name": s.name, "description": s.description}
        for s in skill_map.values()
    ]
    return json.dumps(summaries, indent=2)


@mcp.tool(
    description=(
        "Read the full instructions for a specific skill by name. "
        "Returns the complete SKILL.md content with step-by-step guidance."
    ),
)
def read_skill(name: str) -> str:
    """Read a skill's full SKILL.md content by name."""
    # Security: lookup by key only — never construct paths from user input
    skill = skill_map.get(name)

    if not skill:
        available = ", ".join(skill_names) or "none"
        return f'Skill "{name}" not found. Available skills: {available}'

    try:
        return load_skill_content(skill.path, skills_dir)
    except (OSError, ValueError) as exc:
        return f'Failed to load skill "{name}": {exc}'


def main() -> None:
    """Entry point: run the MCP server via stdio transport."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
