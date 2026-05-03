"""URI parsing tests — mirror typescript/sdk/src/uri.test.ts."""

from __future__ import annotations

import pytest

from mcp_experimental_ext_skills import (
    INDEX_JSON_URI,
    SKILL_FILENAME,
    SKILL_URI_SCHEME,
    build_skill_uri,
    is_index_json_uri,
    is_skill_content_uri,
    parse_skill_uri,
    resolve_skill_file_uri,
)


class TestParseSkillUri:
    def test_single_segment_skill_md(self) -> None:
        parsed = parse_skill_uri("skill://code-review/SKILL.md")
        assert parsed is not None
        assert parsed.skill_path == "code-review"
        assert parsed.file_path == "SKILL.md"

    def test_multi_segment_skill_md(self) -> None:
        # Critical regression test per SEP §Resource Mapping: the first
        # segment of <skill-path> occupies the authority component but
        # carries no special semantics. urllib.parse.urlparse would split
        # this incorrectly.
        parsed = parse_skill_uri("skill://acme/billing/refunds/SKILL.md")
        assert parsed is not None
        assert parsed.skill_path == "acme/billing/refunds"
        assert parsed.file_path == "SKILL.md"

    def test_lowercase_skill_md_not_recognized_as_content(self) -> None:
        # Per SEP-2640 §Skill Format the file is spelled ``SKILL.md``
        # (uppercase). A lowercase ``skill.md`` is treated as a
        # supporting file path, not the skill content sentinel — so
        # the parse falls through to the empty-skill_path branch.
        parsed = parse_skill_uri("skill://my-skill/skill.md")
        assert parsed is not None
        assert parsed.skill_path == ""
        assert parsed.file_path == "my-skill/skill.md"

    def test_returns_none_for_non_skill_scheme(self) -> None:
        assert parse_skill_uri("https://example.com/foo") is None
        assert parse_skill_uri("file:///tmp/foo") is None

    def test_returns_none_for_index_json(self) -> None:
        assert parse_skill_uri("skill://index.json") is None

    def test_returns_none_for_empty_after_scheme(self) -> None:
        assert parse_skill_uri("skill://") is None


class TestResolveSkillFileUri:
    def test_supporting_file_in_multi_segment_skill(self) -> None:
        parsed = resolve_skill_file_uri(
            "skill://acme/billing/refunds/templates/email.md",
            ["code-review", "acme/billing/refunds", "acme/onboarding"],
        )
        assert parsed is not None
        assert parsed.skill_path == "acme/billing/refunds"
        assert parsed.file_path == "templates/email.md"

    def test_longest_prefix_match(self) -> None:
        # When two known paths could match, the longer one wins.
        parsed = resolve_skill_file_uri(
            "skill://acme/billing/refunds/templates/email.md",
            ["acme", "acme/billing", "acme/billing/refunds"],
        )
        assert parsed is not None
        assert parsed.skill_path == "acme/billing/refunds"

    def test_no_match(self) -> None:
        assert resolve_skill_file_uri("skill://other/file.md", ["acme"]) is None

    def test_non_skill_scheme(self) -> None:
        assert resolve_skill_file_uri("https://example.com/foo", ["acme"]) is None


class TestBuildSkillUri:
    def test_default_skill_md(self) -> None:
        assert build_skill_uri("code-review") == "skill://code-review/SKILL.md"

    def test_multi_segment(self) -> None:
        assert (
            build_skill_uri("acme/billing/refunds")
            == "skill://acme/billing/refunds/SKILL.md"
        )

    def test_explicit_file_path(self) -> None:
        assert (
            build_skill_uri("code-review", "references/REFERENCE.md")
            == "skill://code-review/references/REFERENCE.md"
        )


class TestPredicates:
    @pytest.mark.parametrize(
        "uri,expected",
        [
            ("skill://x/SKILL.md", True),
            ("skill://x/y/z/SKILL.md", True),
            # Per SEP-2640 §Skill Format the spelling is uppercase.
            ("skill://x/skill.md", False),
            ("skill://x/foo.md", False),
            ("skill://index.json", False),
            ("https://example.com/SKILL.md", False),
        ],
    )
    def test_is_skill_content_uri(self, uri: str, expected: bool) -> None:
        assert is_skill_content_uri(uri) is expected

    def test_is_index_json_uri(self) -> None:
        assert is_index_json_uri(INDEX_JSON_URI) is True
        assert is_index_json_uri("skill://something.json") is False
        assert is_index_json_uri("skill://x/SKILL.md") is False


def test_constants_exact_values() -> None:
    # SEP §Index conformance: scheme and well-known URI literal values.
    assert SKILL_URI_SCHEME == "skill://"
    assert SKILL_FILENAME == "SKILL.md"
    assert INDEX_JSON_URI == "skill://index.json"
