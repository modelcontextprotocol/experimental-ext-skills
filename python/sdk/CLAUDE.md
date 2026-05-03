# Python Skills Extension SDK

Language-agnostic design notes (three-layer architecture, scheme agnosticism, subpath exports, cross-SDK consistency) live in the **repo-root `CLAUDE.md`**. This file documents Python-specific decisions only.

## Async/sync split

Server-side filesystem operations are **synchronous** — `discover_skills`, `register_skill_resources`, `generate_skill_index`, `load_skill_content`, `load_document`, `scan_documents`. They use `pathlib.Path`, `os.walk`, stdlib `tarfile`/`zipfile`, and `yaml.safe_load`. Wrapping these in async would only push the work to a thread executor for no benefit.

Client-side operations that hit `mcp.ClientSession` are **async** — `list_skills`, `list_skills_from_index`, `read_skill_uri`, `read_skill_content`, `read_skill_archive`, `read_skill_document`, `discover_skills`, `discover_and_build_catalog`. The `discover_skills` name appears in both `.client` (async) and `.server` (sync) submodules; the import path disambiguates them, mirroring the TypeScript SDK's subpath export split.

`extract_skill_archive` (the in-memory archive unpacker) is sync. `read_skill_archive` (the client-side wrapper) is async — it awaits `client.read_resource(uri)`, decodes the blob, then calls the sync extractor.

## Pydantic v2 conventions

- Wire types (`SkillIndex`, `SkillIndexEntry` variants, `SkillSummary`, `SkillMetadata`, `SkillDocument`) are `pydantic.BaseModel` subclasses.
- Per SEP-2640 §Index "Clients SHOULD ignore unrecognized fields" — every wire model uses `model_config = ConfigDict(extra="ignore", populate_by_name=True, alias_generator=to_camel)`.
- Python attributes are `snake_case`; JSON wire format is `camelCase` (via the alias generator). Roundtrip with `model_dump(by_alias=True, exclude_none=True)`.
- Per SEP-2640 §Index `$schema` is the only field with a non-camelCase JSON name — set `Field(alias="$schema")` on `SkillIndex.schema_uri`.
- Per SEP-2640 §Index "Clients SHOULD skip entries with an unrecognized `type`" — discriminated-union parsing must skip unknown variants instead of failing the whole index. Implement in `list_skills_from_index` with per-entry try/except.
- Per SEP-2640 §Index `digest` field is **omitted** in this binding. `generate_skill_index` MUST NOT emit `digest`. The model accepts `digest` if present (forward-compat) but never writes it.
- Server-side declarations with callbacks (`SkillTemplateDeclaration`, `SkillArchiveDeclaration`, options classes) are `dataclasses.dataclass`, not Pydantic — they don't cross the wire and Pydantic doesn't handle bare callables well.

## URI parsing

Per SEP-2640 §Resource Mapping, the first segment of `<skill-path>` "occupies the authority component" of the URI but "carries no special semantics under this convention and clients MUST NOT attempt DNS or network resolution of it." This means a multi-segment URI like `skill://acme/billing/refunds/SKILL.md` is **not** parseable with `urllib.parse.urlparse` — that would treat `acme` as the host and `/billing/refunds/SKILL.md` as the path, dropping a segment.

The Python SDK uses raw string slicing in `_uri.py`, mirroring the TypeScript `parseSkillUri` implementation. Do not introduce `urlparse` here.

## FastMCP integration

The SDK targets the `mcp` Python package's high-level `FastMCP` server. The `server` argument to `register_skill_resources` is typed as the structural `SkillsServer` Protocol (defined in `_resource_extensions.py`) — it requires only the methods the SDK calls. This sidesteps version-skew issues if a consumer has a different `mcp` install than the SDK was tested against.

Capability declaration: FastMCP composes capabilities at server construction. Two paths are exposed:

1. `SKILLS_EXTENSION_CAPABILITY = {"io.modelcontextprotocol/skills": {}}` — a constant the user passes into `FastMCP(experimental_capabilities=SKILLS_EXTENSION_CAPABILITY)` at construction.
2. `declare_skills_extension(server)` — a runtime helper that mutates the FastMCP instance's experimental capabilities dict where the server exposes one. Use form (1) when possible.

## Resource template registration order

Per the protocol design: user-declared `mcp-resource-template` entries with a `read` callback must register **before** the catch-all `skill://{+skillFilePath}` template. Otherwise the catch-all swallows specific patterns. The TypeScript SDK relies on `McpServer`'s registration-order matching. FastMCP's matching may differ — if it does longest-prefix match, the registration order doesn't matter. Either way, `register_skill_resources` registers user templates first, then the catch-all.

## Testing

- `pytest` + `pytest-asyncio` with `asyncio_mode = "auto"` (set in `pyproject.toml`).
- Test modules mirror the TS test layout 1:1 (`test_uri.py`, `test_archive.py`, `test_client.py`, `test_index_json.py`, `test_register.py`).
- Archive fixtures are **built at test-collection time** by `conftest.py` from on-disk skill directories — no checked-in binary archives.
- The `fake_skills_client` fixture is a Protocol-conforming dummy with settable `resources` and `read_resource` payloads, used to test client-side functions without spawning a real MCP server.
