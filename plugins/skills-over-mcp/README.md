# skills-over-mcp

Placeholder Claude Code plugin that packages guidance for implementing the experimental **Skills-over-MCP** SEP on either side of the protocol.

SEP draft: [modelcontextprotocol/experimental-ext-skills#69](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)

## Skills

| Skill | Triggers when the user asks about… |
| --- | --- |
| [`implement-skills-server`](skills/implement-skills-server/SKILL.md) | exposing Agent Skills from an MCP server — `skill://` URIs, `skill://index.json`, resource exposure, `instructions` pointers, update patterns |
| [`implement-skills-host`](skills/implement-skills-host/SKILL.md) | consuming Agent Skills in an MCP client / agent harness — discovery, eager vs lazy loading, the `read_resource` signature pitfall, security model |

## Status

**Placeholder.** Frontmatter triggers are locked in; bodies reproduce the WG's implementation guidelines verbatim. Content will evolve as the SEP stabilizes.

## Install (local)

Until published to a marketplace, install from a local checkout — see the Claude Code plugin docs for the current syntax. On Windows you can also junction this plugin directory into `.claude/plugins/` per the repo's contributor notes.

## Authoritative sources

Working-group docs on `modelcontextprotocol/experimental-ext-skills@main`:

- [Skill URI Scheme Proposal](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-uri-scheme.md)
- [Using `_meta` for Skill Resources](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.md)
- [Related Work](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/related-work.md) — incl. complementary Cloudflare `/.well-known/agent-skills/` RFC
- [Open Questions](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/open-questions.md)
- [Experimental Findings](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/experimental-findings.md)
- [Approaches](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/approaches.md)
- [Problem Statement](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/problem-statement.md)
- [Use Cases](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/use-cases.md)
- [Why & When](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/why-and-when.md)
- [Decisions](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/decisions.md)
- [Repo README](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/README.md)

Agent Skills specification (external, canonical):

- [agentskills.io/specification](https://agentskills.io/specification)
- [agentskills.io/well-known-uri](https://agentskills.io/well-known-uri)
