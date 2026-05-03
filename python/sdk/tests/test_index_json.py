"""Index JSON tests — mirror typescript/sdk/src/index-json.test.ts.

Includes SEP-2640 conformance fixtures (the exact JSON example from the
SEP), forward-compat fixtures (unknown fields, unknown types, ``digest``
field), and roundtrip tests.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from mcp_experimental_ext_skills import (
    SKILL_INDEX_SCHEMA,
    SkillIndex,
    SkillMdIndexEntry,
)
from mcp_experimental_ext_skills._client import _fetch_and_parse_index
from mcp_experimental_ext_skills.server import (
    SkillArchiveDeclaration,
    SkillTemplateDeclaration,
    discover_skills,
    generate_skill_index,
)
from tests.conftest import FakeSkillsClient

# Verbatim fixture from SEP-2640 §Index, lines 105-134 of
# seps/2640-skills-extension.md.
SEP_FIXTURE: dict[str, Any] = {
    "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    "skills": [
        {
            "name": "git-workflow",
            "type": "skill-md",
            "description": "Follow this team's Git conventions for branching and commits",
            "url": "skill://git-workflow/SKILL.md",
        },
        {
            "name": "refunds",
            "type": "skill-md",
            "description": "Process customer refund requests per company policy",
            "url": "skill://acme/billing/refunds/SKILL.md",
        },
        {
            "name": "pdf-processing",
            "type": "archive",
            "description": "Extract, fill, and assemble PDF documents",
            "url": "skill://pdf-processing.tar.gz",
        },
        {
            "type": "mcp-resource-template",
            "description": "Per-product documentation skill",
            "url": "skill://docs/{product}/SKILL.md",
        },
    ],
}


class TestSepFixtureRoundtrip:
    """Per-SEP-2640 conformance tests on the canonical fixture."""

    def test_schema_url_exact(self) -> None:
        assert (
            SKILL_INDEX_SCHEMA
            == "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
        )
        assert SEP_FIXTURE["$schema"] == SKILL_INDEX_SCHEMA

    def test_parse_succeeds(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        assert len(index.skills) == 4

    def test_entry_types(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        types = [e.type for e in index.skills]
        assert types == ["skill-md", "skill-md", "archive", "mcp-resource-template"]

    def test_template_entry_has_no_name(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        template = index.skills[3]
        assert template.type == "mcp-resource-template"
        assert template.name is None

    def test_roundtrip_preserves_dollar_schema(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        out = index.model_dump(by_alias=True, exclude_none=True)
        assert "$schema" in out
        assert out["$schema"] == SKILL_INDEX_SCHEMA

    def test_no_digest_in_output(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        out = index.model_dump(by_alias=True, exclude_none=True)
        for entry in out["skills"]:
            assert "digest" not in entry

    def test_byte_identical_roundtrip(self) -> None:
        index = SkillIndex.model_validate(SEP_FIXTURE)
        out = index.model_dump(by_alias=True, exclude_none=True)
        assert out == SEP_FIXTURE


class TestForwardCompat:
    """SEP-2640 §Index: 'Clients SHOULD ignore unrecognized fields' and
    'SHOULD skip entries with an unrecognized type'.
    """

    def test_unknown_field_on_entry_ignored(self) -> None:
        fixture = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "x",
                    "type": "skill-md",
                    "description": "d",
                    "url": "skill://x/SKILL.md",
                    "futureField": "ignored",
                }
            ],
        }
        index = SkillIndex.model_validate(fixture)
        assert len(index.skills) == 1

    def test_digest_field_accepted_but_not_emitted(self) -> None:
        fixture = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "x",
                    "type": "skill-md",
                    "description": "d",
                    "url": "skill://x/SKILL.md",
                    "digest": "sha256:abc",
                }
            ],
        }
        index = SkillIndex.model_validate(fixture)
        out = index.model_dump(by_alias=True, exclude_none=True)
        assert "digest" not in out["skills"][0]


class TestUnknownTypeSkipped:
    async def test_unknown_type_dropped_at_client(
        self, fake_client: FakeSkillsClient
    ) -> None:
        # SEP §Index: clients SHOULD skip entries with unrecognized type
        fake_client.index = {
            "$schema": SKILL_INDEX_SCHEMA,
            "skills": [
                {
                    "name": "good",
                    "type": "skill-md",
                    "description": "d",
                    "url": "skill://good/SKILL.md",
                },
                {
                    "name": "future",
                    "type": "future-type-not-yet-defined",
                    "description": "d",
                    "url": "skill://future/SKILL.md",
                },
            ],
        }
        index = await _fetch_and_parse_index(fake_client)
        assert index is not None
        assert len(index.skills) == 1
        assert index.skills[0].type == "skill-md"


class TestGenerateSkillIndex:
    def test_skills_only(self, temp_skills_dir: Any) -> None:
        skills = discover_skills(temp_skills_dir)
        index = generate_skill_index(skills)
        urls = {e.url for e in index.skills}
        assert "skill://code-review/SKILL.md" in urls
        assert "skill://acme/billing/refunds/SKILL.md" in urls
        assert all(e.type == "skill-md" for e in index.skills)

    def test_with_archive(self, temp_skills_dir: Any, tmp_path: Any) -> None:
        # Build a fake archive on disk so the resolver finds it.
        archive_path = tmp_path / "pdf-processing.tar.gz"
        archive_path.write_bytes(b"\x1f\x8b\x08\x00")  # gzip magic; content ignored

        skills: dict[str, Any] = {}
        index = generate_skill_index(
            skills,
            archives=[
                SkillArchiveDeclaration(
                    name="pdf-processing",
                    description="PDF processing",
                    skill_path="pdf-processing",
                    archive_path=str(archive_path),
                )
            ],
        )
        archive_entries = [e for e in index.skills if e.type == "archive"]
        assert len(archive_entries) == 1
        assert archive_entries[0].url == "skill://pdf-processing.tar.gz"

    def test_archive_name_mismatch_rejected(self, tmp_path: Any) -> None:
        archive_path = tmp_path / "x.tar.gz"
        archive_path.write_bytes(b"")
        with pytest.raises(ValueError, match="final segment"):
            generate_skill_index(
                {},
                archives=[
                    SkillArchiveDeclaration(
                        name="wrong-name",
                        description="d",
                        skill_path="acme/refunds",
                        archive_path=str(archive_path),
                    )
                ],
            )

    def test_with_template(self) -> None:
        index = generate_skill_index(
            {},
            templates=[
                SkillTemplateDeclaration(
                    name="docs",
                    description="Per-product docs",
                    uri_template="skill://docs/{product}/SKILL.md",
                )
            ],
        )
        templates = [e for e in index.skills if e.type == "mcp-resource-template"]
        assert len(templates) == 1
        assert templates[0].url == "skill://docs/{product}/SKILL.md"

    def test_no_digest_emitted_from_generator(self, temp_skills_dir: Any) -> None:
        skills = discover_skills(temp_skills_dir)
        index = generate_skill_index(skills)
        out = index.model_dump(by_alias=True, exclude_none=True)
        for entry in out["skills"]:
            assert "digest" not in entry


def test_skill_md_index_entry_minimal() -> None:
    e = SkillMdIndexEntry(
        name="x", type="skill-md", description="d", url="skill://x/SKILL.md"
    )
    out = e.model_dump(by_alias=True, exclude_none=True)
    assert out == {
        "name": "x",
        "type": "skill-md",
        "description": "d",
        "url": "skill://x/SKILL.md",
    }


def test_full_json_roundtrip() -> None:
    serialized = json.dumps(SEP_FIXTURE, sort_keys=True)
    parsed = SkillIndex.model_validate(json.loads(serialized))
    reserialized = json.dumps(
        parsed.model_dump(by_alias=True, exclude_none=True), sort_keys=True
    )
    assert serialized == reserialized
