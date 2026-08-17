# Agent Plugins x Skills Over MCP

## Summary

Agent Plugins 1.0 is a portable *packaging* format — a directory with a `plugin.json` manifest whose two component types are Agent Skills (a `skills/` directory) and MCP server configurations (`mcp.json`). It deliberately layers on top of the Agent Skills spec and MCP rather than redefining either, so it is overwhelmingly a **complement** to SEP-2640: the SEP moves skills over the wire at runtime; Agent Plugins moves them onto disk at install time. The two even compose — a plugin's `mcp.json` can point at a server that itself serves skills under the extension.

Where they may end up competing is not the format but the early adoption pattern OpenAI just demonstrated. OpenAI's plugins implement a subset of SEP-2640 as the ingestion pipeline for plugin submission: the submission portal's Scan Tools step has been [observed in practice](https://community.openai.com/t/scan-tools-fetches-mcp-served-skills-sep-2640-but-mcp-inspect-returns-skills-null-skills-never-imported-into-draft/1389064) calling `skills/list` + `skills/get` + `resources/read` and verifying SHA-256 digests, producing a static snapshot. If that pattern becomes the norm, skills-over-MCP serves as a publishing protocol feeding static packages rather than a runtime capability, which is a narrower pitch than the SEP makes as a whole.

## Does Agent Plugins make SEP-2640 unnecessary?

No, because they are solving different problems. 

Agent Plugins defines what an installed plugin package looks like; distribution, integrity, provenance, and trust are all out of scope for the current spec.

Skills over MCP defines how skill bytes move, how a host verifies they arrived intact, and how user approval binds to specific content. As one early example, OpenAI's plugin ingestion consumes SEP-2640 methods to build its snapshots. In theory, anything a plugin delivers could be delivered over MCP.

One use case a snapshot can't serve is enterprise-internal distribution and management: delivering the current version of a skill to the people currently entitled to it. Per-user or per-role catalogs, skills behind auth, and revocation when access changes all require a live channel.

## What Agent Plugins 1.0 is

- An open spec at [agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec), published as version 1.0.0.
- §7.1 defers entirely to the [Agent Skills specification](https://agentskills.io/specification) for the skill format — the same source of truth SEP-2640 delegates to. Agent Plugins defines only *discovery within a package*, not the format or how clients expose skills.
- Notably absent from v1, all punted to [FUTURE_CONSIDERATIONS.md](https://github.com/agentplugins/agent-plugins-spec/blob/main/FUTURE_CONSIDERATIONS.md): trust/permission model, sandboxing, provenance/signatures, content integrity, secrets handling, enterprise controls, dependencies. Distribution and installation mechanics are also out of scope — v1 defines the directory format only.

## The layer map

| Layer | Spec | Concern |
| :--- | :--- | :--- |
| Format | [Agent Skills](https://agentskills.io/specification) | What a skill *is* — SKILL.md, frontmatter, progressive disclosure |
| Wire | [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) | Skills served over the wire — discovery (`skills/list`/`skills/get`), retrieval, integrity, consent binding. Hosts consume this either read-through at runtime or by materializing to disk |
| Disk | [Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) | Skills + MCP configs packaged for client-side install — a static snapshot; how the package is distributed is out of scope |

## Where they complement

1. **Different layers, literal composition.** A plugin's `mcp.json` can configure a server that advertises skills via `io.modelcontextprotocol/skills`. And skills-over-MCP is the natural *supply chain* into the package format: OpenAI's docs pitch importing skills from MCP precisely so developers can "version and deploy their instructions and supporting files with the server." The SEP's final-segment-equals-`name` rule makes the mapping from a `skill://` catalog to a plugin `skills/` directory mechanical.
2. **Shared format foundation.** Both defer to the Agent Skills spec, so a skill authored once is valid in both channels without translation.
3. **Complementary gaps.** Agent Plugins v1 has no integrity, provenance, or distribution story; SEP-2640 already has the content-integrity and identity machinery.

## Where they may compete

1. **The static skills case.** A vendor with a fixed skill set can ship a plugin directory and skip implementing the extension entirely — provided a distribution channel for the package already exists  and staleness between releases is acceptable.
2. **The static-subset precedent could become the default by adoption.** The first major implementer (OpenAI plugins) treats live skill delivery as out of scope. Later implementers may follow this route as the default. The SEP's distinctive value — skills that stay in sync with a live server, dynamic per-tenant catalogs, skills behind auth, remote-only servers with no filesystem install channel — needs implementers to actually exercise it.
