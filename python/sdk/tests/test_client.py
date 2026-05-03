"""Client-side tests — mirror typescript/sdk/src/client.test.ts."""

from __future__ import annotations

from typing import Any

import pytest

from mcp_experimental_ext_skills import (
    SKILL_INDEX_SCHEMA,
    SkillSummary,
)
from mcp_experimental_ext_skills.client import (
    READ_RESOURCE_TOOL,
    SkillsCatalogOptions,
    build_skills_catalog,
    build_skills_summary,
    discover_skills,
    list_skills,
    list_skills_from_index,
    parse_skill_frontmatter,
    read_skill_content,
    read_skill_uri,
)
from tests.conftest import FakeSkillsClient


class TestParseSkillFrontmatter:
    def test_basic(self) -> None:
        content = "---\nname: foo\ndescription: A skill\n---\n\nbody"
        out = parse_skill_frontmatter(content)
        assert out == {"name": "foo", "description": "A skill"}

    def test_quoted_values(self) -> None:
        content = '---\nname: "quoted"\ndescription: \'single-quoted\'\n---\nbody'
        out = parse_skill_frontmatter(content)
        assert out == {"name": "quoted", "description": "single-quoted"}

    def test_no_frontmatter(self) -> None:
        assert parse_skill_frontmatter("# Just a heading\n") is None

    def test_unclosed_frontmatter(self) -> None:
        assert parse_skill_frontmatter("---\nname: foo\nno close") is None


class TestBuildSkillsSummary:
    def test_empty(self) -> None:
        assert build_skills_summary([]) == "No skills available."

    def test_single_segment(self) -> None:
        skills = [
            SkillSummary(
                name="x",
                skill_path="x",
                uri="skill://x/SKILL.md",
                description="d",
            )
        ]
        out = build_skills_summary(skills)
        assert "x" in out
        assert "skill://x/SKILL.md" in out
        assert ": d" in out
        assert "[path:" not in out

    def test_multi_segment_shows_path(self) -> None:
        skills = [
            SkillSummary(
                name="refunds",
                skill_path="acme/billing/refunds",
                uri="skill://acme/billing/refunds/SKILL.md",
            )
        ]
        out = build_skills_summary(skills)
        assert "[path: acme/billing/refunds]" in out


class TestBuildSkillsCatalog:
    def test_empty_returns_empty_string(self) -> None:
        assert build_skills_catalog([], SkillsCatalogOptions(tool_name="x")) == ""

    def test_with_server_name(self) -> None:
        skills = [
            SkillSummary(
                name="git",
                skill_path="git",
                uri="skill://git/SKILL.md",
                description="git workflow",
            )
        ]
        out = build_skills_catalog(
            skills,
            SkillsCatalogOptions(tool_name="read_resource", server_name="my-server"),
        )
        assert "<available_skills>" in out
        assert "<name>git</name>" in out
        assert "with server `my-server`" in out
        assert "`read_resource`" in out

    def test_without_server_name(self) -> None:
        skills = [
            SkillSummary(name="git", skill_path="git", uri="skill://git/SKILL.md")
        ]
        out = build_skills_catalog(skills, SkillsCatalogOptions(tool_name="read"))
        assert "with server" not in out
        assert "with the skill's URI" in out


def test_read_resource_tool_shape() -> None:
    # Per SEP §Hosts End-to-End Integration recommendation
    assert READ_RESOURCE_TOOL.name == "read_resource"
    assert "server" in READ_RESOURCE_TOOL.input_schema["properties"]
    assert "uri" in READ_RESOURCE_TOOL.input_schema["properties"]
    assert READ_RESOURCE_TOOL.input_schema["required"] == ["server", "uri"]
    assert READ_RESOURCE_TOOL.annotations is not None
    assert READ_RESOURCE_TOOL.annotations["readOnlyHint"] is True


# ---------------------------------------------------------------------------
# Async tests against the FakeSkillsClient
# ---------------------------------------------------------------------------


class TestListSkills:
    async def test_filters_skill_md_uris(self, fake_client: FakeSkillsClient) -> None:
        fake_client.resources = [
            {
                "uri": "skill://a/SKILL.md",
                "name": "a",
                "description": "A skill",
            },
            {"uri": "skill://b/c/SKILL.md", "name": "c", "description": "C skill"},
            {"uri": "skill://a/references/REF.md", "name": "ref"},
            {"uri": "https://example.com/foo", "name": "not a skill"},
        ]
        skills = await list_skills(fake_client)
        assert len(skills) == 2
        paths = {s.skill_path for s in skills}
        assert paths == {"a", "b/c"}

    async def test_handles_pagination(self) -> None:
        class PaginatedClient(FakeSkillsClient):
            def __init__(self) -> None:
                super().__init__()
                self.page = 0

            async def list_resources(self, cursor: Any = None, /) -> Any:
                if self.page == 0:
                    self.page = 1
                    return {
                        "resources": [{"uri": "skill://a/SKILL.md", "name": "a"}],
                        "nextCursor": "page2",
                    }
                return {
                    "resources": [{"uri": "skill://b/SKILL.md", "name": "b"}],
                    "nextCursor": None,
                }

        client = PaginatedClient()
        skills = await list_skills(client)
        assert {s.skill_path for s in skills} == {"a", "b"}


class TestListSkillsFromIndex:
    async def test_returns_none_when_no_index(
        self, fake_client: FakeSkillsClient
    ) -> None:
        fake_client.index = None
        out = await list_skills_from_index(fake_client)
        assert out is None

    async def test_parses_skill_md_and_archive(
        self, fake_client: FakeSkillsClient
    ) -> None:
        fake_client.index = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "git",
                    "type": "skill-md",
                    "description": "g",
                    "url": "skill://git/SKILL.md",
                },
                {
                    "name": "pdf",
                    "type": "archive",
                    "description": "p",
                    "url": "skill://pdf.tar.gz",
                },
            ],
        }
        out = await list_skills_from_index(fake_client)
        assert out is not None
        assert len(out) == 2
        assert out[0].type == "skill-md"
        assert out[1].type == "archive"
        assert out[1].mime_type == "application/gzip"

    async def test_scheme_agnostic(self, fake_client: FakeSkillsClient) -> None:
        # SEP §Resource Mapping allows alternate schemes when listed in index
        fake_client.index = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "github-skill",
                    "type": "skill-md",
                    "description": "from github",
                    "url": "github://owner/repo/skills/foo/SKILL.md",
                }
            ],
        }
        out = await list_skills_from_index(fake_client)
        assert out is not None
        assert len(out) == 1
        # skill_path falls back to entry.name for non-skill:// schemes
        assert out[0].skill_path == "github-skill"
        assert out[0].uri == "github://owner/repo/skills/foo/SKILL.md"


class TestReadSkillUri:
    async def test_reads_text(self, fake_client: FakeSkillsClient) -> None:
        fake_client.read_overrides["skill://x/SKILL.md"] = {
            "contents": [{"uri": "skill://x/SKILL.md", "text": "hello"}]
        }
        text = await read_skill_uri(fake_client, "skill://x/SKILL.md")
        assert text == "hello"

    async def test_raises_on_missing_text(
        self, fake_client: FakeSkillsClient
    ) -> None:
        fake_client.read_overrides["skill://x/SKILL.md"] = {
            "contents": [{"uri": "skill://x/SKILL.md", "blob": "deadbeef"}]
        }
        with pytest.raises(ValueError, match="text content"):
            await read_skill_uri(fake_client, "skill://x/SKILL.md")


class TestReadSkillContent:
    async def test_builds_uri_from_path(self, fake_client: FakeSkillsClient) -> None:
        fake_client.read_overrides["skill://acme/billing/refunds/SKILL.md"] = {
            "contents": [{"text": "refunds"}]
        }
        text = await read_skill_content(fake_client, "acme/billing/refunds")
        assert text == "refunds"


class TestDiscoverSkills:
    async def test_index_first(self, fake_client: FakeSkillsClient) -> None:
        fake_client.index = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "indexed",
                    "type": "skill-md",
                    "description": "from index",
                    "url": "skill://indexed/SKILL.md",
                }
            ],
        }
        # resources/list also has skills, but index should win
        fake_client.resources = [
            {"uri": "skill://fallback/SKILL.md", "name": "fallback"}
        ]
        skills = await discover_skills(fake_client)
        assert {s.skill_path for s in skills} == {"indexed"}

    async def test_falls_back_when_no_index(
        self, fake_client: FakeSkillsClient
    ) -> None:
        fake_client.index = None
        fake_client.resources = [
            {"uri": "skill://fallback/SKILL.md", "name": "fallback"}
        ]
        skills = await discover_skills(fake_client)
        assert {s.skill_path for s in skills} == {"fallback"}

    async def test_falls_back_when_index_empty(
        self, fake_client: FakeSkillsClient
    ) -> None:
        # SEP §Discovery: 'Hosts MUST NOT treat absent or empty index as
        # proof a server has no skills.'
        fake_client.index = {"$schema": SKILL_INDEX_SCHEMA, "skills": []}
        fake_client.resources = [{"uri": "skill://x/SKILL.md", "name": "x"}]
        skills = await discover_skills(fake_client)
        assert {s.skill_path for s in skills} == {"x"}
