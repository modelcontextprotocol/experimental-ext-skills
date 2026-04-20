---
name: implement-skills-host
description: This skill should be used when the user asks to "add skills support to my MCP client", "implement the skills SEP on the host side", "consume agent skills from MCP servers", "load SKILL.md from skill:// URIs", "wire up skill discovery in my agent harness", "handle skill://index.json in a client", or needs guidance on consuming Agent Skills from MCP servers per the experimental Skills-over-MCP SEP. Covers discovery via index.json or well-known HTTP, eager vs lazy loading, the (server, uri) vs uri-only read_resource tool-signature pitfall, relative-path resolution, and treating skill content as untrusted input.
---

# Implementing Skills-over-MCP on the Host / Client Side

> Source: *Skills SEP host implementation guidelines* (WG notes, 2026-04-19) — reproduced verbatim below. SEP draft: [modelcontextprotocol/experimental-ext-skills#69](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69).

---

Two concerns determine how a host integrates skills over MCP: how it discovers what's available, and how it loads content when the model needs it.

## Discovering agent skills

How does the host + model find out which skills are available for a knowledge domain?


```mermaid
flowchart LR
    subgraph HTTP
        A["Well-known URI<br/>for agent skills"] --> B["index.json"]
    end
    subgraph MCP
        C["MCP Server"] --> D["skill://<br/>index.json"]
    end
    B -. "Both use the<br/>same schema" .- D
    B --> E["Host builds<br/>catalog of skills"]
    D --> E
    E --> F["MCP Host /<br/>Client"]
    F --> G["Host loads index entries<br/>(name + description)<br/>into model context"]
```

Note: there is no dependency between the http-based skill discovery path and the mcp-based discovery path - this diagram is to illustrate that they share the same schema.

The model sees skill names and descriptions in its context via the Discovery flow above. How the skill body reaches the model depends on the host's loading strategy. Hosts that load eagerly (either to memory or to disk) place skill content so it's available before the model needs it — the model interacts with it the same way it interacts with any other skill. Hosts that load lazily expose a `read_resource` tool the model invokes with the skill's URI when the task calls for it. In both cases, the model-facing behavior (i.e. frontmatter visible in context, relative paths resolving to supporting files) is identical.

## Loading agent skills

How does the host + model load the skill content when it's needed by the model?

|       | In-memory                                   | Materialized to FS                                             |
| :---- | :------------------------------------------ | :------------------------------------------------------------- |
| Lazy  | Lazy in-memory (e.g. using `read_resource`) | Lazy to filesystem (e.g. large archive unpacked on first request) |
| Eager | Eager in-memory (prefetch all on startup)   | Eager to filesystem (writes full catalog to disk at startup)   |

Note: Relative-path resolution within a skill MUST be consistent across all options.

## Implementation pitfalls

A short list of traps that have bitten host implementers in practice. None are subtle once stated — but each one has shipped at least once.

**Schemes other than `skill://`.** The SEP makes `skill://` a SHOULD, not a MUST. Servers MAY publish skills under any URI scheme (`github://`, `repo://`, etc.) provided each is listed in `skill://index.json`. Hosts that gate their MCP read path on a literal `skill://` prefix (`if uri.startswith("skill://")`) will silently misroute domain-native URIs to the local filesystem reader, where they're typically `Path()`-resolved into a meaningless relative path under cwd. The host's read tool MUST dispatch any URI shape (`<scheme>://...`) through the MCP aggregator if the URI descends from a discovered manifest's root. Detect URIs by the `<scheme>://` shape, not by literal scheme prefix.

**Server name in the model's context.** If the host's read tool takes `(server, uri)` (matching the SEP's illustrative `read_resource` signature), the model has to write the server name on each call. The TS SDK's e2e demo found that without the server name visibly placed in the skill catalog block, model first-call activation fell from ~90% to ~33% — the model either hallucinated the wrong server name or skipped the call entirely. Two ways out: (1) inject the server name into each catalog entry (e.g. `<server>{name}</server>`) so the model has it in context to copy, or (2) drop the `server` argument from the tool entirely and resolve the server host-side from the URI's known origin at discovery time. (2) avoids the failure mode by construction but assumes URIs are unique across connected servers.

## Reuse your existing resource-read tool

If the host already exposes a URI-only resource-read tool (pitfall-2 option 2 shape), it typically needs **zero** changes to support skills — the SEP is a transport binding and skills are just resources. Keep skill-specific guidance in the activated-skill output, not in the tool description. In the Gemini CLI integration the stock `read_mcp_resource` (signature `{ uri }`) was reused unchanged; 2/2 live runs activated the `pull-requests` skill on the first try and produced the SKILL.md tool sequence verbatim.

---

## References

- [SEP draft — experimental-ext-skills#69](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)
- [Skill URI Scheme Proposal](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-uri-scheme.md)
- [Related Work](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/related-work.md) — incl. Cloudflare `/.well-known/agent-skills/` RFC (complementary domain-level discovery)
- [Experimental Findings](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/experimental-findings.md) — source of the ~90% → ~33% activation-rate measurement
- [Open Questions](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/open-questions.md)
- [Approaches](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/approaches.md)
- [Decisions log](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/decisions.md)
- [Agent Skills specification](https://agentskills.io/specification)
- [Well-known URI discovery index](https://agentskills.io/well-known-uri)
