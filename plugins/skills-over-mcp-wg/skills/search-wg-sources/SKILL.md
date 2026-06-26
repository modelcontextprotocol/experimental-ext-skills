---
name: search-wg-sources
description: Search Skills Over MCP WG sources — decision log, meeting notes, active SEP threads, Discord, issues & PRs
license: Apache-2.0
compatibility: Run from a local clone of the experimental-ext-skills repo (reads docs/decisions.md and sibling docs). Needs network access and the guildbridge, github, and mcp-docs MCP servers, or the gh CLI as a fallback.
user_invocable: true
arguments:
  - name: topic
    description: The topic or keyword to search for
    required: true
---

# Searching Skills Over MCP Working Group sources

This skill answers "what does the WG think / what has been decided / what's in flight about `<topic>`?" by sweeping the group's active coordination surfaces and aggregating them into one attributed answer.

## Where to search — active parts first

Work top-down. The first three sources are where live coordination happens; weight them most heavily.

1. **Decision log (in-repo, authoritative for settled questions)** — `docs/decisions.md`, relative to this repo. ADR-lite entries, each with a `Status` field (`Accepted` / `Proposed` / `Rejected` / `Superseded`). Grep here first to separate what's *decided* from what's still open. Then check the sibling living docs in `docs/`:
   - `open-questions.md` — unresolved questions actively seeking input
   - `approaches.md` — approaches under exploration and their status
   - `sep-draft-skills-extension.md` — the working draft behind SEP-2640
   - `related-work.md` — member implementations and external prior art

   These ship in the same repo as this skill, so read them locally (Grep/Read). Everything below is external — link by URL.

2. **Active SEP threads** — the live design debate lives on GitHub PRs in `modelcontextprotocol/modelcontextprotocol`:
   - **SEP-2640 — Skills Extension** (primary): https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640 — serve skills over MCP via the Resources primitive.
   - **PR #2527** — recommend clients expose `resources/read` to models (prerequisite).
   - Historical/closed, useful for *why direction changed*: **SEP-2076** (skills as a first-class primitive, closed) and **SEP-2093** (resource contents metadata, rejected upstream).

   When a thread is relevant, deep-dive it (see [Deep diving](#deep-diving-into-a-pr-or-discussion)).

3. **Meeting notes** — GitHub Discussions, category `meeting-notes-skills-over-mcp-wg` on `modelcontextprotocol/modelcontextprotocol`: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg

   There is no `gh search discussions`. Use the GraphQL API and scope to the category:

   ```bash
   gh api graphql -f query='query { search(query: "repo:modelcontextprotocol/modelcontextprotocol category:meeting-notes-skills-over-mcp-wg <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body createdAt author { login } authorAssociation category { name } comments(first: 20) { nodes { body author { login } authorAssociation } } } } } }'
   ```

4. **Discord — `#skills-over-mcp-wg`** — fast async signal and current sentiment. Use the `guildbridge` MCP server: `search_messages` to find mentions of the topic, `read_messages` to pull surrounding context.
   - Guild (server): `1358869848138059966`
   - Channel: `1464745826629976084`
   - Web link: https://discord.com/channels/1358869848138059966/1464745826629976084

5. **Issues & PRs** — `modelcontextprotocol/experimental-ext-skills` (the WG repo), open **and** closed/merged for historical context. Use the `github` MCP server's search tools (`search_issues`, `search_pull_requests`) or `gh search prs` / `gh search issues`.

6. **Spec content (background)** — the `mcp-docs` server (`search_model_context_protocol` tool) is authoritative for current protocol concepts and API references. Use it to ground terminology, not for WG opinion.

For historical decisions, prioritize the decision log, merged PRs, and closed issues over open items.

## Search term variants

GitHub search does **not** split camelCase tokens. `ResourceContents` and `Resource Contents` return almost entirely different results — search both.

- **camelCase** (`skillUri`, `resourceContents`): matches identifiers in code and schema
- **Space-separated** (`skill uri`, `resource contents`): matches natural-language discussion text

Skip kebab-case variants (`skill-uri`) — GitHub tokenizes on hyphens, so they behave like the space-separated form but tend to return noisier results. The same applies to Discord search.

## Deep diving into a PR or discussion

**When to deep dive:** a result looks highly relevant and you need to understand *why* a change was made or which direction a maintainer set, not just *what* changed.

For a PR, look through:

- general conversation not tied to specific lines: `repos/modelcontextprotocol/modelcontextprotocol/issues/{number}/comments`
- review comments on specific lines: `repos/modelcontextprotocol/modelcontextprotocol/pulls/{number}/comments`
- top-level review bodies with an approve/request-changes/comment verdict: `repos/modelcontextprotocol/modelcontextprotocol/pulls/{number}/reviews`

Every comment includes an `author_association` (REST) / `authorAssociation` (GraphQL) field. Treat `MEMBER` or `OWNER` as maintainers when deciding whose statements carry design weight.

## Output format

### Decisions (from the decision log)

```markdown
- **<Title>** (**Accepted/Proposed/Rejected** <date>)
  One-line summary of the decision and its rationale.
```

### PRs / Issues

```markdown
- [#123](url) - Title (**Merged/Closed/Open** <date>)
  Brief summary.
```

### Discussions (meeting notes)

```markdown
- [<Title>](url) (<date>)
  Brief summary of what was discussed / decided.
```

### Discord

```markdown
- **@author** in #skills-over-mcp-wg (<date>) — paraphrase or short quote, with a link to the message.
```

### Notable maintainer quotes

When maintainers reveal design intent, set direction, or reject/redirect an approach, **quote them directly** with attribution and a footnote:

> "These would require a SEP. I think the general question here is about the taxonomy of hints." [^1]
> — @dsp-ant

Prefer quotes that explain **why** a decision was made, set **direction**, **reject/redirect** an approach, or clarify **intended semantics**.

### Key insights

Summarize the most important findings and any decisions or consensus reached. Lead with what's **settled** (decision log / merged), then what's **in flight** (open SEP threads / open questions), then **sentiment** (Discord).

### Footnotes

Collect all sources as footnotes at the end. Every quote and claim should have a corresponding footnote, e.g.:

```markdown
[^1]: [#2640 inline review comment by @dsp-ant](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640#discussion_r...)
[^2]: [decisions.md — "Skills served over MCP use instructor format"](docs/decisions.md)
```

## General strategy

1. Generate search terms and variants (camelCase, space-separated).
2. Grep the in-repo decision log and `docs/` first — separate settled from open.
3. Pull the active SEP threads (SEP-2640, #2527; closed SEP-2076/2093 for history) and deep-dive the relevant ones.
4. Search meeting-notes discussions (GraphQL) and the `#skills-over-mcp-wg` Discord (guildbridge).
5. Search `experimental-ext-skills` issues/PRs (open and closed).
6. Aggregate into the output format above — settled → in-flight → sentiment — with maintainer quotes and footnotes for every claim.
