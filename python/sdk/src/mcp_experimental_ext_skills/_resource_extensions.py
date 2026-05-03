"""Extension declaration for the Skills Extension SEP.

Per SEP-2133 extension negotiation, servers declare support in their
``initialize`` response::

    {
      "capabilities": {
        "extensions": {
          "io.modelcontextprotocol/skills": {}
        }
      }
    }

The empty object indicates support; SEP-2640 defines no extension-specific
settings.

.. warning::
   **Wire-level gap pending upstream MCP SDK support for SEP-2133.**

   The ``mcp`` Python SDK currently only exposes
   ``experimental_capabilities`` on ``FastMCP``, which serializes under
   ``capabilities.experimental`` rather than ``capabilities.extensions``.
   Passing :data:`SKILLS_EXTENSION_CAPABILITY` into ``FastMCP`` therefore
   places ``io.modelcontextprotocol/skills`` under ``experimental`` on
   the wire — interoperable with hosts that look in either location, but
   not literally what SEP-2133/SEP-2640 prescribe. Once the upstream
   ``mcp`` package surfaces a first-class ``extensions`` capability
   field, this SDK will switch to it; until then the capability ID and
   shape are correct and only the parent field name differs. The
   identical limitation applies to the TypeScript SDK.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

#: The skills extension identifier as defined in SEP-2640.
SKILLS_EXTENSION_ID = "io.modelcontextprotocol/skills"

#: Capability dict ready to merge into a FastMCP construction's
#: ``experimental_capabilities`` argument.
SKILLS_EXTENSION_CAPABILITY: dict[str, dict[str, Any]] = {SKILLS_EXTENSION_ID: {}}


@runtime_checkable
class SkillsServer(Protocol):
    """Minimal structural interface for a server that exposes a way to
    register experimental capabilities at runtime.

    Using a Protocol avoids version-skew issues with the underlying ``mcp``
    package — a consumer can pass any object exposing the expected method
    name without inheritance.

    Implementations may expose this as ``register_capabilities`` (a snake
    case Python convention) or via direct mutation of an
    ``experimental_capabilities`` dict on the server. The
    :func:`declare_skills_extension` helper handles both.
    """

    def add_resource(self, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover
        """Register a resource on the server."""
        ...


def declare_skills_extension(server: Any) -> None:
    """Declare the skills extension capability on the given server.

    .. note::
       The supported path is to pass :data:`SKILLS_EXTENSION_CAPABILITY`
       into your server's constructor — for FastMCP that is
       ``FastMCP(..., experimental_capabilities=SKILLS_EXTENSION_CAPABILITY)``.
       This function is a runtime fallback for cases where the server has
       already been constructed; it inspects internal attributes that are
       not part of FastMCP's stable API and may break across ``mcp``
       releases.

    Tries several common shapes:

    1. ``server.register_capabilities(...)`` if present.
    2. ``server.registerCapabilities(...)`` (camelCase, for SDKs that
       expose a TS-style method name).
    3. Mutating an existing
       ``server._mcp_server.notification_options.experimental_capabilities``
       dict if FastMCP exposes one.

    If none of these are available, raises :class:`AttributeError` with a
    message pointing the caller at :data:`SKILLS_EXTENSION_CAPABILITY` —
    they can pass the constant into their server's construction directly.

    Must be called BEFORE the server connects (capabilities are sent during
    the initialize handshake).
    """
    capabilities = {"extensions": dict(SKILLS_EXTENSION_CAPABILITY)}

    register = getattr(server, "register_capabilities", None) or getattr(
        server, "registerCapabilities", None
    )
    if callable(register):
        register(capabilities)
        return

    inner = getattr(server, "_mcp_server", None)
    if inner is not None:
        notification_options = getattr(inner, "notification_options", None)
        if notification_options is not None:
            existing = getattr(notification_options, "experimental_capabilities", None)
            if isinstance(existing, dict):
                existing.update(SKILLS_EXTENSION_CAPABILITY)
                return

    raise AttributeError(
        "Could not declare skills extension on this server: no "
        "register_capabilities method and no _mcp_server.notification_options "
        "found. Pass SKILLS_EXTENSION_CAPABILITY into your server's "
        "construction (e.g., FastMCP(experimental_capabilities=...)) instead."
    )


__all__ = [
    "SKILLS_EXTENSION_CAPABILITY",
    "SKILLS_EXTENSION_ID",
    "SkillsServer",
    "declare_skills_extension",
]
