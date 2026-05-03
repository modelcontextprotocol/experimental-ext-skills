"""Resource registration tests — mirror typescript/sdk/src/register.test.ts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from mcp_experimental_ext_skills import INDEX_JSON_URI, SKILL_INDEX_SCHEMA
from mcp_experimental_ext_skills.server import (
    RegisterSkillResourcesOptions,
    SkillArchiveDeclaration,
    SkillTemplateDeclaration,
    TemplateReadResult,
    discover_skills,
    is_path_within_base,
    load_skill_metadata,
    register_skill,
    register_skill_resources,
    skill,
)
from tests.conftest import FakeSkillsServer


class TestDiscoverSkills:
    def test_finds_single_and_multi_segment_skills(
        self, temp_skills_dir: Path
    ) -> None:
        skills = discover_skills(temp_skills_dir)
        assert "code-review" in skills
        assert "acme/billing/refunds" in skills

    def test_final_segment_must_match_name(
        self, temp_skills_dir: Path
    ) -> None:
        skills = discover_skills(temp_skills_dir)
        for skill_path, meta in skills.items():
            assert meta.name == skill_path.split("/")[-1]

    def test_no_nesting_constraint(self, tmp_path: Path) -> None:
        # SEP §Resource Mapping: 'A SKILL.md MUST NOT appear in any
        # descendant directory of a skill.'
        outer = tmp_path / "skills" / "outer"
        outer.mkdir(parents=True)
        (outer / "SKILL.md").write_text(
            "---\nname: outer\ndescription: outer skill\n---\nbody",
            encoding="utf-8",
        )
        inner = outer / "inner"
        inner.mkdir()
        (inner / "SKILL.md").write_text(
            "---\nname: inner\ndescription: nested\n---\nbody",
            encoding="utf-8",
        )
        skills = discover_skills(tmp_path / "skills")
        # Only the outer skill should be discovered; inner is logged-and-skipped.
        assert "outer" in skills
        assert not any(p.endswith("inner") for p in skills)

    def test_name_path_mismatch_rejected(self, tmp_path: Path) -> None:
        d = tmp_path / "skills" / "wrong-dir"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            "---\nname: different-name\ndescription: x\n---\nbody",
            encoding="utf-8",
        )
        skills = discover_skills(tmp_path / "skills")
        assert skills == {}

    def test_documents_scanned(self, temp_skills_dir: Path) -> None:
        skills = discover_skills(temp_skills_dir)
        cr = skills["code-review"]
        assert any(d.path == "references/REFERENCE.md" for d in cr.documents)
        refunds = skills["acme/billing/refunds"]
        assert any(d.path == "templates/email.md" for d in refunds.documents)


class TestRegisterSkillResources:
    def test_registers_per_skill_resources(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        skills = discover_skills(temp_skills_dir)
        register_skill_resources(fake_server, skills, temp_skills_dir)
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://code-review/SKILL.md" in uris
        assert "skill://acme/billing/refunds/SKILL.md" in uris
        assert INDEX_JSON_URI in uris

    def test_registers_supporting_files(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        skills = discover_skills(temp_skills_dir)
        register_skill_resources(fake_server, skills, temp_skills_dir)
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://code-review/references/REFERENCE.md" in uris
        assert "skill://acme/billing/refunds/templates/email.md" in uris

    def test_registers_index_with_correct_schema(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        import asyncio
        import json

        skills = discover_skills(temp_skills_dir)
        register_skill_resources(fake_server, skills, temp_skills_dir)
        index_resource = next(
            r for r in fake_server.resources if str(r.uri) == INDEX_JSON_URI
        )
        body = asyncio.run(index_resource.read())
        parsed = json.loads(body)
        assert parsed["$schema"] == SKILL_INDEX_SCHEMA
        # 'digest' must NOT be present in any entry per SEP-2640
        for entry in parsed["skills"]:
            assert "digest" not in entry

    def test_archive_registration(
        self,
        temp_skills_dir: Path,
        fake_server: FakeSkillsServer,
        tmp_path: Path,
        make_tar_gz: Any,
    ) -> None:
        archive_path = tmp_path / "pdf-processing.tar.gz"
        archive_path.write_bytes(
            make_tar_gz({"SKILL.md": b"---\nname: pdf-processing\n---"})
        )

        register_skill_resources(
            fake_server,
            {},
            temp_skills_dir,
            RegisterSkillResourcesOptions(
                archives=[
                    SkillArchiveDeclaration(
                        name="pdf-processing",
                        description="PDF",
                        skill_path="pdf-processing",
                        archive_path=str(archive_path),
                    )
                ]
            ),
        )
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://pdf-processing.tar.gz" in uris

    def test_template_registration(
        self,
        temp_skills_dir: Path,
        fake_server: FakeSkillsServer,
    ) -> None:
        def read_handler(uri: str, variables: dict[str, str]) -> TemplateReadResult:
            return TemplateReadResult(text=f"product={variables.get('product')}")

        register_skill_resources(
            fake_server,
            {},
            temp_skills_dir,
            RegisterSkillResourcesOptions(
                templates=[
                    SkillTemplateDeclaration(
                        name="docs",
                        description="Per-product docs",
                        uri_template="skill://docs/{product}/SKILL.md",
                        read=read_handler,
                    )
                ]
            ),
        )
        # Template registered on the resource manager
        assert len(fake_server.templates) == 1
        assert (
            fake_server.templates[0]["uri_template"]
            == "skill://docs/{product}/SKILL.md"
        )

    def test_skill_meta_uses_sep_reverse_domain_prefix(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        # SEP §Resource Metadata line 93: "implementations SHOULD use the
        # io.modelcontextprotocol.skills/ reverse-domain prefix" for
        # skill-resource _meta keys. Frontmatter `metadata` fields and
        # lastModified must surface under that prefix.
        skills = discover_skills(temp_skills_dir)
        register_skill_resources(fake_server, skills, temp_skills_dir)
        refunds = next(
            r for r in fake_server.resources
            if str(r.uri) == "skill://acme/billing/refunds/SKILL.md"
        )
        assert refunds.meta is not None
        assert "io.modelcontextprotocol.skills/lastModified" in refunds.meta
        # The conftest fixture defines `metadata.author` and `metadata.version`
        assert refunds.meta["io.modelcontextprotocol.skills/author"] == "acme-billing-team"
        assert refunds.meta["io.modelcontextprotocol.skills/version"] == "1.0"
        # No unprefixed leakage
        assert "audience" not in refunds.meta
        assert "priority" not in refunds.meta
        # audience/priority belong on annotations, not _meta
        assert refunds.annotations is not None
        assert refunds.annotations.audience == ["assistant"]
        assert refunds.annotations.priority == 1.0

    async def test_template_completion_wired(
        self,
        temp_skills_dir: Path,
        fake_server: FakeSkillsServer,
    ) -> None:
        # Per SEP-2640 §Discovery: a server SHOULD wire template
        # variables to the completion API. The SDK should install one
        # completion handler that dispatches to per-variable callbacks.
        from mcp.types import (
            CompletionArgument,
            CompletionContext,
            ResourceTemplateReference,
        )

        seen_calls: list[tuple[str, dict[str, str] | None]] = []

        def product_complete(
            partial: str, bound: dict[str, str] | None
        ) -> list[str]:
            seen_calls.append((partial, bound))
            return ["alpha", "beta", "gamma"]

        register_skill_resources(
            fake_server,
            {},
            temp_skills_dir,
            RegisterSkillResourcesOptions(
                templates=[
                    SkillTemplateDeclaration(
                        name="docs",
                        description="Per-product docs",
                        uri_template="skill://docs/{product}/SKILL.md",
                        read=lambda uri, vs: TemplateReadResult(text="x"),
                        complete={"product": product_complete},
                    )
                ]
            ),
        )
        assert fake_server.completion_handler is not None

        ref = ResourceTemplateReference(
            type="ref/resource", uri="skill://docs/{product}/SKILL.md"
        )
        arg = CompletionArgument(name="product", value="al")
        result = await fake_server.completion_handler(ref, arg, None)
        assert result is not None
        assert result.values == ["alpha", "beta", "gamma"]
        assert seen_calls == [("al", None)]

        # Wrong template URI → handler returns None
        wrong_ref = ResourceTemplateReference(
            type="ref/resource", uri="skill://other/{x}/SKILL.md"
        )
        assert (
            await fake_server.completion_handler(wrong_ref, arg, None) is None
        )

        # Bound context arguments are forwarded
        ctx = CompletionContext(arguments={"product": "alpha"})
        await fake_server.completion_handler(ref, arg, ctx)
        assert seen_calls[-1] == ("al", {"product": "alpha"})

    def test_template_without_complete_no_handler(
        self,
        temp_skills_dir: Path,
        fake_server: FakeSkillsServer,
    ) -> None:
        # No completion handler should be installed when no template
        # declares one.
        register_skill_resources(
            fake_server,
            {},
            temp_skills_dir,
            RegisterSkillResourcesOptions(
                templates=[
                    SkillTemplateDeclaration(
                        name="docs",
                        description="Per-product docs",
                        uri_template="skill://docs/{product}/SKILL.md",
                        read=lambda uri, vs: TemplateReadResult(text="x"),
                    )
                ]
            ),
        )
        assert fake_server.completion_handler is None

    def test_template_without_read_not_registered(
        self,
        temp_skills_dir: Path,
        fake_server: FakeSkillsServer,
    ) -> None:
        # Template with no read handler is enumerated in index but not
        # registered as an MCP template.
        register_skill_resources(
            fake_server,
            {},
            temp_skills_dir,
            RegisterSkillResourcesOptions(
                templates=[
                    SkillTemplateDeclaration(
                        name="docs",
                        description="Per-product docs",
                        uri_template="skill://docs/{product}/SKILL.md",
                    )
                ]
            ),
        )
        assert len(fake_server.templates) == 0


class TestRegisterSkill:
    def test_registers_single_skill_at_chosen_path(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        # The TS-style decorator pattern from SEP §SDKs maps to
        # register_skill(server, skill_path, source_dir).
        source_dir = temp_skills_dir / "code-review"
        meta = register_skill(fake_server, "code-review", source_dir)
        assert meta.name == "code-review"
        assert meta.skill_path == "code-review"
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://code-review/SKILL.md" in uris
        assert "skill://code-review/references/REFERENCE.md" in uris

    def test_registers_at_multi_segment_path(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        # The on-disk dir is `temp_skills_dir/acme/billing/refunds/`,
        # but register_skill lets the caller choose any URI path whose
        # final segment matches the frontmatter name.
        source_dir = temp_skills_dir / "acme" / "billing" / "refunds"
        meta = register_skill(fake_server, "shop/refunds", source_dir)
        assert meta.skill_path == "shop/refunds"
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://shop/refunds/SKILL.md" in uris

    def test_name_mismatch_raises(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        source_dir = temp_skills_dir / "code-review"
        with pytest.raises(ValueError, match="final segment"):
            register_skill(fake_server, "wrong-name", source_dir)

    def test_load_skill_metadata_parses_frontmatter(
        self, temp_skills_dir: Path
    ) -> None:
        source_dir = temp_skills_dir / "acme" / "billing" / "refunds"
        meta = load_skill_metadata(source_dir, "acme/billing/refunds")
        assert meta.name == "refunds"
        assert meta.metadata == {"author": "acme-billing-team", "version": "1.0"}


class TestSkillDecorator:
    def test_decorator_registers_skill(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        # Mirrors SEP-2640 §SDKs example: a decorator-style declaration
        # whose function body returns the source directory for the skill.
        source_dir = temp_skills_dir / "code-review"

        @skill(fake_server, "code-review")
        def code_review() -> Path:
            return source_dir

        # Decorator returns the original function unchanged.
        assert code_review() == source_dir
        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://code-review/SKILL.md" in uris

    def test_decorator_at_multi_segment_path(
        self, temp_skills_dir: Path, fake_server: FakeSkillsServer
    ) -> None:
        source_dir = temp_skills_dir / "acme" / "billing" / "refunds"

        @skill(fake_server, "acme/billing/refunds")
        def refunds() -> Path:
            return source_dir

        uris = [str(r.uri) for r in fake_server.resources]
        assert "skill://acme/billing/refunds/SKILL.md" in uris


class TestPathSafety:
    def test_within_base(self, tmp_path: Path) -> None:
        sub = tmp_path / "sub"
        sub.mkdir()
        assert is_path_within_base(sub, tmp_path) is True
        assert is_path_within_base(tmp_path, tmp_path) is True

    def test_outside_base(self, tmp_path: Path) -> None:
        other = tmp_path.parent / "other"
        assert is_path_within_base(other, tmp_path) is False
