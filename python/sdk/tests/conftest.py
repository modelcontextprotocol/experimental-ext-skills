"""Shared pytest fixtures."""

from __future__ import annotations

import io
import tarfile
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

SAMPLE_SKILL = """---
name: code-review
description: Perform structured code reviews
---

# Code review

Body content.
"""

SAMPLE_NESTED_SKILL = """---
name: refunds
description: Process refund requests per company policy
metadata:
  author: acme-billing-team
  version: "1.0"
---

# Refunds

Body content.
"""


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.fixture
def temp_skills_dir(tmp_path: Path) -> Path:
    """Build a sample skills directory tree with single- and multi-segment
    skills.
    """
    base = tmp_path / "skills"
    _write(base / "code-review" / "SKILL.md", SAMPLE_SKILL)
    _write(base / "code-review" / "references" / "REFERENCE.md", "ref content")
    _write(base / "acme" / "billing" / "refunds" / "SKILL.md", SAMPLE_NESTED_SKILL)
    _write(
        base / "acme" / "billing" / "refunds" / "templates" / "email.md",
        "Hello, customer.",
    )
    return base


class FakeSkillsClient:
    """Protocol-conforming fake :class:`SkillsClient` for tests.

    Set ``resources`` (list of dicts with ``uri``, ``name``, ``description``,
    ``mimeType`` keys) and ``index`` (a JSON-serializable dict for the
    ``skill://index.json`` body) before invoking client functions.
    Individual reads can be mocked via ``read_overrides`` keyed by URI.
    """

    def __init__(self) -> None:
        self.resources: list[dict[str, Any]] = []
        self.index: dict[str, Any] | None = None
        self.read_overrides: dict[str, dict[str, Any]] = {}
        self.read_log: list[str] = []
        self.list_log: list[str | None] = []

    async def list_resources(self, cursor: str | None = None, /) -> Any:
        self.list_log.append(cursor)
        return {"resources": self.resources, "nextCursor": None}

    async def read_resource(self, uri: Any, /) -> Any:
        uri_str = str(uri)
        self.read_log.append(uri_str)
        if uri_str in self.read_overrides:
            return self.read_overrides[uri_str]
        if uri_str == "skill://index.json":
            if self.index is None:
                raise RuntimeError("no index configured")
            import json

            return {
                "contents": [
                    {
                        "uri": uri_str,
                        "mimeType": "application/json",
                        "text": json.dumps(self.index),
                    }
                ]
            }
        raise RuntimeError(f"unexpected read: {uri_str}")


@pytest.fixture
def fake_client() -> FakeSkillsClient:
    return FakeSkillsClient()


class FakeSkillsServer:
    """Records every ``add_resource`` and ``add_template`` call in order."""

    def __init__(self) -> None:
        self.resources: list[Any] = []
        self.templates: list[dict[str, Any]] = []
        self.completion_handler: Any = None

        # Mimic FastMCP's _resource_manager attribute so
        # register_skill_resources can find it.
        outer = self

        class _Manager:
            def add_template(self, **kwargs: Any) -> Any:
                outer.templates.append(kwargs)

        self._resource_manager = _Manager()

        # Mimic FastMCP's _mcp_server.request_handlers so the SDK can
        # detect a pre-existing completion handler.
        class _InnerServer:
            def __init__(self) -> None:
                self.request_handlers: dict[Any, Any] = {}

        self._mcp_server = _InnerServer()

    def add_resource(self, resource: Any) -> None:
        self.resources.append(resource)

    def completion(self) -> Any:
        outer = self

        def decorator(fn: Any) -> Any:
            outer.completion_handler = fn
            return fn

        return decorator


@pytest.fixture
def fake_server() -> FakeSkillsServer:
    return FakeSkillsServer()


@pytest.fixture
def make_tar_gz() -> Callable[[dict[str, bytes]], bytes]:
    """Build a tar.gz archive from an in-memory dict of {path: content}."""

    def builder(files: dict[str, bytes]) -> bytes:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for path, content in files.items():
                info = tarfile.TarInfo(name=path)
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
        return buf.getvalue()

    return builder


@pytest.fixture
def make_zip() -> Callable[[dict[str, bytes]], bytes]:
    """Build a zip archive from an in-memory dict of {path: content}."""

    def builder(files: dict[str, bytes]) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path, content in files.items():
                zf.writestr(path, content)
        return buf.getvalue()

    return builder
