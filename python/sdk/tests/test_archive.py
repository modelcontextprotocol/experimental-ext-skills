"""Archive extraction tests — mirror typescript/sdk/src/archive.test.ts.

Covers SEP-2640 archive safety requirements: reject path traversal,
absolute paths, drive letters, symlinks resolving outside, decompression
bombs, missing root SKILL.md.
"""

from __future__ import annotations

import io
import tarfile
from collections.abc import Callable

import pytest

from mcp_experimental_ext_skills import (
    ExtractArchiveOptions,
    archive_mime_type,
    archive_suffix,
    detect_archive_format,
    extract_skill_archive,
    strip_archive_suffix,
)


class TestDetectArchiveFormat:
    def test_mime_type_takes_precedence(self) -> None:
        assert detect_archive_format("application/gzip", "irrelevant") == "tar.gz"
        assert detect_archive_format("application/zip", "irrelevant") == "zip"

    def test_url_fallback(self) -> None:
        assert detect_archive_format(None, "skill://x.tar.gz") == "tar.gz"
        assert detect_archive_format(None, "skill://x.tgz") == "tar.gz"
        assert detect_archive_format(None, "skill://x.zip") == "zip"

    def test_neither_returns_none(self) -> None:
        assert detect_archive_format(None, None) is None
        assert detect_archive_format("text/plain", "skill://x.unknown") is None


class TestArchiveSuffixHelpers:
    def test_strip_suffix(self) -> None:
        assert strip_archive_suffix("skill://x.tar.gz") == "skill://x"
        assert strip_archive_suffix("skill://x.tgz") == "skill://x"
        assert strip_archive_suffix("skill://x.zip") == "skill://x"
        assert strip_archive_suffix("skill://x") == "skill://x"

    def test_mime_type(self) -> None:
        assert archive_mime_type("tar.gz") == "application/gzip"
        assert archive_mime_type("zip") == "application/zip"

    def test_suffix(self) -> None:
        assert archive_suffix("tar.gz") == ".tar.gz"
        assert archive_suffix("zip") == ".zip"


class TestTarGzExtraction:
    def test_basic_extraction(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz(
            {"SKILL.md": b"---\nname: x\n---\nbody", "ref.md": b"reference"}
        )
        archive = extract_skill_archive(data, mime_type="application/gzip")
        assert "SKILL.md" in archive.files
        assert archive.files["SKILL.md"] == b"---\nname: x\n---\nbody"
        assert archive.files["ref.md"] == b"reference"

    def test_missing_skill_md_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"other.md": b"no skill"})
        with pytest.raises(ValueError, match=r"SKILL\.md"):
            extract_skill_archive(data, mime_type="application/gzip")

    def test_path_traversal_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"SKILL.md": b"x", "../escape.md": b"bad"})
        with pytest.raises(ValueError, match="Invalid archive entry path"):
            extract_skill_archive(data, mime_type="application/gzip")

    def test_absolute_path_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"SKILL.md": b"x", "/tmp/abs.md": b"bad"})
        with pytest.raises(ValueError, match="Invalid archive entry path"):
            extract_skill_archive(data, mime_type="application/gzip")

    def test_drive_letter_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"SKILL.md": b"x", "C:/abs.md": b"bad"})
        with pytest.raises(ValueError, match="Invalid archive entry path"):
            extract_skill_archive(data, mime_type="application/gzip")

    def test_symlink_with_traversal_rejected(self) -> None:
        # Build a tar.gz manually with a symlink whose target escapes.
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            content = b"x"
            info = tarfile.TarInfo(name="SKILL.md")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))

            link = tarfile.TarInfo(name="link.md")
            link.type = tarfile.SYMTYPE
            link.linkname = "../outside.md"
            tar.addfile(link)

        with pytest.raises(ValueError, match="link target"):
            extract_skill_archive(buf.getvalue(), mime_type="application/gzip")

    def test_in_scope_symlink_preserved(self) -> None:
        # SEP-2640 §Archive entries: archives carry UNIX file metadata
        # "robustly for .tar.gz". An in-scope symlink (target stays
        # within the skill root after resolution) must be preserved.
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            content = b"x"
            info = tarfile.TarInfo(name="SKILL.md")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))

            # references/alias.md → ../SKILL.md resolves to SKILL.md,
            # which is in scope.
            link = tarfile.TarInfo(name="references/alias.md")
            link.type = tarfile.SYMTYPE
            link.linkname = "../SKILL.md"
            tar.addfile(link)

        archive = extract_skill_archive(
            buf.getvalue(), mime_type="application/gzip"
        )
        assert "references/alias.md" in archive.symlinks
        assert archive.symlinks["references/alias.md"] == "../SKILL.md"
        # The link itself is not materialized as a file
        assert "references/alias.md" not in archive.files

    def test_symlink_absolute_target_rejected(self) -> None:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            content = b"x"
            info = tarfile.TarInfo(name="SKILL.md")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))

            link = tarfile.TarInfo(name="link.md")
            link.type = tarfile.SYMTYPE
            link.linkname = "/etc/passwd"
            tar.addfile(link)

        with pytest.raises(ValueError, match="link target"):
            extract_skill_archive(buf.getvalue(), mime_type="application/gzip")

    def test_oversize_file_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"SKILL.md": b"x", "big.bin": b"a" * 200})
        with pytest.raises(ValueError, match="max_file_size"):
            extract_skill_archive(
                data,
                mime_type="application/gzip",
                options=ExtractArchiveOptions(max_file_size=100),
            )

    def test_oversize_total_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz(
            {"SKILL.md": b"a" * 60, "ref.md": b"a" * 60, "more.md": b"a" * 60}
        )
        with pytest.raises(ValueError, match="max_total_size"):
            extract_skill_archive(
                data,
                mime_type="application/gzip",
                options=ExtractArchiveOptions(max_total_size=100),
            )

    def test_too_many_entries_rejected(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        files = {f"file{i}.md": b"x" for i in range(10)}
        files["SKILL.md"] = b"x"
        data = make_tar_gz(files)
        with pytest.raises(ValueError, match="max_entries"):
            extract_skill_archive(
                data,
                mime_type="application/gzip",
                options=ExtractArchiveOptions(max_entries=5),
            )


class TestZipExtraction:
    def test_basic_extraction(
        self, make_zip: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_zip({"SKILL.md": b"---\nname: x\n---", "ref.md": b"r"})
        archive = extract_skill_archive(data, mime_type="application/zip")
        assert "SKILL.md" in archive.files
        assert archive.files["ref.md"] == b"r"

    def test_path_traversal_rejected(
        self, make_zip: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_zip({"SKILL.md": b"x", "../escape.md": b"bad"})
        with pytest.raises(ValueError, match="Invalid archive entry path"):
            extract_skill_archive(data, mime_type="application/zip")

    def test_oversize_total_rejected(
        self, make_zip: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_zip(
            {"SKILL.md": b"a" * 60, "ref.md": b"a" * 60, "more.md": b"a" * 60}
        )
        with pytest.raises(ValueError, match="max_total_size"):
            extract_skill_archive(
                data,
                mime_type="application/zip",
                options=ExtractArchiveOptions(max_total_size=100),
            )


class TestFormatDispatch:
    def test_unknown_format_raises(self) -> None:
        with pytest.raises(ValueError, match="Cannot determine archive format"):
            extract_skill_archive(b"", mime_type=None, url=None)

    def test_url_fallback_when_mime_missing(
        self, make_tar_gz: Callable[[dict[str, bytes]], bytes]
    ) -> None:
        data = make_tar_gz({"SKILL.md": b"x"})
        archive = extract_skill_archive(data, url="skill://x.tar.gz")
        assert "SKILL.md" in archive.files
