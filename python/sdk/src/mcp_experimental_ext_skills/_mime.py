"""MIME type utilities for skill documents."""

from __future__ import annotations

import os

_MIME_TYPES: dict[str, str] = {
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
    ext = os.path.splitext(filepath)[1].lower()
    return _MIME_TYPES.get(ext, "application/octet-stream")


def is_text_mime_type(mime_type: str) -> bool:
    """Check if a MIME type represents text content (as opposed to binary).

    Matches the TS SDK: ``text/*`` types, plus ``application/json``,
    ``application/xml``, ``application/javascript``, and ``+json``/``+xml``
    suffixes.
    """
    if mime_type.startswith("text/"):
        return True
    if mime_type in ("application/json", "application/xml", "application/javascript"):
        return True
    if mime_type.endswith("+json") or mime_type.endswith("+xml"):
        return True
    return False


__all__ = ["get_mime_type", "is_text_mime_type"]
