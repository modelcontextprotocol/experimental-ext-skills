"""Archive extraction for skill distribution per SEP-2640.

The SEP defines ``type: "archive"`` as a normative entry type in
``skill://index.json``: a single resource (``.tar.gz`` or ``.zip``) that
unpacks to a skill directory. This module provides in-memory extraction
with the Agent Skills archive safety requirements:

* reject path-traversal sequences (``..``)
* reject absolute paths
* reject drive letters (Windows)
* reject symlinks/hardlinks resolving outside the skill directory
* bound total uncompressed size (decompression-bomb defense)
* bound per-file size and entry count

Hosts MUST support both formats. SDK consumers normally call
:func:`mcp_experimental_ext_skills.client.read_skill_archive`, which
fetches the archive via ``resources/read`` and dispatches here based on
``mimeType``.

We deliberately do NOT use :data:`tarfile.data_filter` (added in Python
3.12). Its rules are close to but not identical to SEP-2640's archive
safety requirements — in particular it does not validate symlink targets
against the SEP's "resolve outside the skill directory" rule. Implementing
checks manually keeps the SDK aligned with the SEP and consistent with the
TS SDK.
"""

from __future__ import annotations

import io
import re
import tarfile
import zipfile

from ._types import (
    ArchiveFormat,
    ExtractArchiveOptions,
    UnpackedSkillArchive,
)

_TAR_GZ_MIME = "application/gzip"
_ZIP_MIME = "application/zip"

_DRIVE_LETTER_RE = re.compile(r"^[a-zA-Z]:")


def detect_archive_format(
    mime_type: str | None,
    url: str | None,
) -> ArchiveFormat | None:
    """Detect archive format from MIME type, falling back to URL suffix.

    Per SEP-2640: "Hosts SHOULD determine the format from the resource's
    mimeType, falling back to the URL suffix."

    Returns ``None`` if neither signal identifies a supported format.
    """
    if mime_type == _TAR_GZ_MIME:
        return "tar.gz"
    if mime_type == _ZIP_MIME:
        return "zip"
    if url:
        if url.endswith(".tar.gz") or url.endswith(".tgz"):
            return "tar.gz"
        if url.endswith(".zip"):
            return "zip"
    return None


def strip_archive_suffix(url: str) -> str:
    """Strip the archive suffix from a URL to get the post-unpack skill base.

    Per SEP-2640: ``skill://pdf-processing.tar.gz`` unpacks to
    ``skill://pdf-processing/``.
    """
    if url.endswith(".tar.gz"):
        return url[: -len(".tar.gz")]
    if url.endswith(".tgz"):
        return url[: -len(".tgz")]
    if url.endswith(".zip"):
        return url[: -len(".zip")]
    return url


def archive_mime_type(format: ArchiveFormat) -> str:
    """MIME type for an archive format."""
    return _TAR_GZ_MIME if format == "tar.gz" else _ZIP_MIME


def archive_suffix(format: ArchiveFormat) -> str:
    """URL suffix for an archive format."""
    return ".tar.gz" if format == "tar.gz" else ".zip"


def _validate_entry_path(entry_path: str) -> str | None:
    """Validate a relative path from an archive entry.

    Returns the normalized (forward-slash) path, or ``None`` if the entry
    violates archive safety: absolute paths, drive letters, ``..``
    segments, or empty paths are all rejected.
    """
    if not entry_path:
        return None
    normalized = entry_path.replace("\\", "/").rstrip("/")
    if not normalized:
        return None
    if normalized.startswith("/"):
        return None
    if _DRIVE_LETTER_RE.match(normalized):
        return None
    if any(segment == ".." for segment in normalized.split("/")):
        return None
    return normalized


def _resolve_symlink_in_archive(link_dir: str, target: str) -> str | None:
    """Resolve a symlink target relative to ``link_dir`` (forward-slash
    posix path) and verify it stays within the archive root.

    Returns the resolved in-archive path on success, or ``None`` if the
    target is absolute, contains a drive letter, or escapes the archive
    root after ``..`` reduction. Unlike :func:`_validate_entry_path`,
    this allows ``..`` segments in ``target`` so long as they don't pop
    above the archive root — symlinks like ``references/alias.md`` →
    ``../SKILL.md`` are valid because the resolved path
    (``SKILL.md``) is still in the archive.
    """
    if not target:
        return None
    target = target.replace("\\", "/")
    if target.startswith("/"):
        return None
    if _DRIVE_LETTER_RE.match(target):
        return None

    base_segments = link_dir.split("/") if link_dir else []
    segments = base_segments + target.split("/")

    resolved: list[str] = []
    for seg in segments:
        if seg in ("", "."):
            continue
        if seg == "..":
            if not resolved:
                return None  # escapes archive root
            resolved.pop()
            continue
        resolved.append(seg)

    if not resolved:
        return None
    return "/".join(resolved)


def _extract_tar_gz(
    data: bytes,
    options: ExtractArchiveOptions,
) -> UnpackedSkillArchive:
    """Extract a ``.tar.gz`` archive from an in-memory buffer.

    Symlinks (``SYMTYPE``) are preserved in the result's ``symlinks``
    dict when their resolved target stays within the archive root, per
    SEP-2640's "robustly for .tar.gz" metadata-fidelity rationale.
    Hard links (``LNKTYPE``) are validated and skipped — the SDK does
    not currently materialize hard links in the in-memory result.
    """
    files: dict[str, bytes] = {}
    symlinks: dict[str, str] = {}
    total_size = 0
    entry_count = 0

    try:
        tar = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
    except (tarfile.TarError, OSError) as err:
        raise ValueError(f"Failed to open tar.gz archive: {err}") from err

    with tar:
        for member in tar:
            if member.isdir():
                continue

            if member.issym() or member.islnk():
                # Per SEP archive safety: reject links resolving outside
                # the skill directory. Symlink targets are *relative to
                # the link's directory* — we resolve and verify the
                # result stays inside the archive root before
                # preserving the link. Hard link targets are paths
                # relative to the archive root.
                link_path = _validate_entry_path(member.name)
                if link_path is None:
                    raise ValueError(
                        f"Invalid archive entry path: {member.name!r}"
                    )
                target_str = member.linkname or ""
                if member.issym():
                    link_dir = "/".join(link_path.split("/")[:-1])
                    resolved = _resolve_symlink_in_archive(link_dir, target_str)
                else:
                    # Hard link: target is archive-root-relative, no
                    # ``..`` allowed.
                    resolved = _validate_entry_path(target_str)
                if resolved is None:
                    raise ValueError(
                        f"Archive link target {target_str!r} resolves "
                        "outside skill directory"
                    )
                if member.issym():
                    entry_count += 1
                    if entry_count > options.max_entries:
                        raise ValueError(
                            f"Archive entry count exceeds max_entries "
                            f"({options.max_entries})"
                        )
                    symlinks[link_path] = target_str
                continue

            if not member.isfile():
                continue

            entry_path = _validate_entry_path(member.name)
            if entry_path is None:
                raise ValueError(f"Invalid archive entry path: {member.name!r}")

            entry_count += 1
            if entry_count > options.max_entries:
                raise ValueError(
                    f"Archive entry count exceeds max_entries ({options.max_entries})"
                )

            if member.size > options.max_file_size:
                raise ValueError(
                    f"Archive entry {entry_path!r} declares size "
                    f"{member.size}, exceeds max_file_size ({options.max_file_size})"
                )

            if total_size + member.size > options.max_total_size:
                raise ValueError(
                    f"Archive total size exceeds max_total_size "
                    f"({options.max_total_size})"
                )

            extracted = tar.extractfile(member)
            if extracted is None:
                continue

            content = extracted.read()
            # Catch decompression bombs that lie about size in the header.
            if len(content) > options.max_file_size:
                raise ValueError(
                    f"Archive entry {entry_path!r} actual size "
                    f"{len(content)} exceeds max_file_size "
                    f"({options.max_file_size})"
                )
            if total_size + len(content) > options.max_total_size:
                raise ValueError(
                    f"Archive total size exceeds max_total_size "
                    f"({options.max_total_size})"
                )

            files[entry_path] = content
            total_size += len(content)

    return UnpackedSkillArchive(
        files=files, total_size=total_size, symlinks=symlinks
    )


def _extract_zip(
    data: bytes,
    options: ExtractArchiveOptions,
) -> UnpackedSkillArchive:
    """Extract a ``.zip`` archive from an in-memory buffer."""
    files: dict[str, bytes] = {}
    total_size = 0
    entry_count = 0

    try:
        zf = zipfile.ZipFile(io.BytesIO(data), mode="r")
    except (zipfile.BadZipFile, OSError) as err:
        raise ValueError(f"Failed to open zip archive: {err}") from err

    with zf:
        for info in zf.infolist():
            # Directory entry — skip but continue
            if info.is_dir() or info.filename.endswith("/"):
                continue

            entry_path = _validate_entry_path(info.filename)
            if entry_path is None:
                raise ValueError(f"Invalid archive entry path: {info.filename!r}")

            entry_count += 1
            if entry_count > options.max_entries:
                raise ValueError(
                    f"Archive entry count exceeds max_entries ({options.max_entries})"
                )

            # Pre-flight: reject entries that claim oversize before opening
            # the read stream.
            if info.file_size > options.max_file_size:
                raise ValueError(
                    f"Archive entry {entry_path!r} declares size "
                    f"{info.file_size}, exceeds max_file_size "
                    f"({options.max_file_size})"
                )
            if total_size + info.file_size > options.max_total_size:
                raise ValueError(
                    f"Archive total size exceeds max_total_size "
                    f"({options.max_total_size})"
                )

            with zf.open(info, "r") as fh:
                content = fh.read()

            # Catch decompression bombs that lie about uncompressed size.
            if len(content) > options.max_file_size:
                raise ValueError(
                    f"Archive entry {entry_path!r} actual size "
                    f"{len(content)} exceeds max_file_size "
                    f"({options.max_file_size})"
                )
            if total_size + len(content) > options.max_total_size:
                raise ValueError(
                    f"Archive total size exceeds max_total_size "
                    f"({options.max_total_size})"
                )

            files[entry_path] = content
            total_size += len(content)

    return UnpackedSkillArchive(files=files, total_size=total_size)


def extract_skill_archive(
    data: bytes,
    *,
    mime_type: str | None = None,
    url: str | None = None,
    options: ExtractArchiveOptions | None = None,
) -> UnpackedSkillArchive:
    """Extract a skill archive from an in-memory buffer.

    Format is determined from ``mime_type`` first, then falls back to URL
    suffix per SEP-2640. Raises :class:`ValueError` if the format cannot
    be determined.

    Applies archive safety: rejects path traversal, absolute paths,
    drive letters, symlinks resolving outside the skill directory, and
    decompression bombs (via per-file, total-size, and entry-count bounds).

    Per SEP-2640: "SKILL.md MUST be at the archive root, not nested inside
    a wrapper directory." This is enforced after extraction.
    """
    fmt = detect_archive_format(mime_type, url)
    if fmt is None:
        raise ValueError(
            f"Cannot determine archive format from "
            f"mime_type={mime_type!r} and url={url!r}. "
            "Per SEP-2640, archives must be application/gzip (.tar.gz) "
            "or application/zip (.zip)."
        )

    opts = options if options is not None else ExtractArchiveOptions()
    archive = _extract_tar_gz(data, opts) if fmt == "tar.gz" else _extract_zip(data, opts)

    if "SKILL.md" not in archive.files:
        raise ValueError(
            "Archive does not contain SKILL.md at its root. "
            "Per SEP-2640, archives MUST place SKILL.md at the archive "
            "root, not inside a wrapper directory."
        )

    return archive


__all__ = [
    "archive_mime_type",
    "archive_suffix",
    "detect_archive_format",
    "extract_skill_archive",
    "strip_archive_suffix",
]
