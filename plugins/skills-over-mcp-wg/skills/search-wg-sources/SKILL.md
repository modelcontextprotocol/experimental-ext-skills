---
name: search-wg-sources
description: Search Skills Over MCP WG sources — decision log, meeting notes, active SEP threads, Discord, issues & PRs
license: Apache-2.0
compatibility: Run from a local clone of the experimental-ext-skills repo (reads docs/decisions.md and docs/threat-model.md). Needs network access and the guildbridge, github, and mcp-docs MCP servers, or the gh CLI as a fallback.
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

1. **Decision log (in-repo, authoritative for settled questions)** — `docs/decisions.md`, relative to this repo. ADR-lite entries, each with a `Status` field (`Accepted` / `Proposed` / `Rejected` / `Superseded`). Grep here first to separate what's *decided* from what's still open.

   **Always read the `Status` line before quoting an entry.** The SEP was scoped down to a v1 in July 2026, and several earlier entries are now `Superseded` — a `Superseded` status names the entry that replaced it, so follow that pointer. Grepping for a term will happily surface detailed, confident-sounding prose describing a shape that no longer exists (`skill://index.json`, a single per-skill `digest`, archive distribution). Read the newest matching entry last-to-first and report the current shape, noting the superseded one only as history.

   Also in-repo and worth reading directly:
   - `docs/threat-model.md` — threat model for skills served over MCP (adversary model, threat catalog T1–T9, delivery-model recommendations, deferred-archive appendix). A WG reference, not normative SEP text; where it recommends behavior beyond what the SEP mandates it says so. Read this first for anything touching security, trust boundaries, verification, digests, injection, or consent.
   - `docs/related-work.md` — member implementations and external prior art.

   These ship in the same repo as this skill, so read them locally (Grep/Read). Don't lean on the other `docs/*.md` files (e.g. `open-questions.md`, `approaches.md`, `experimental-findings.md`, `sep-draft-skills-extension.md`) — they carry ℹ️ banners marking them as unmaintained snapshots; the live design discussion is on the SEP threads and Discord below. Trust the banner over the content. Everything below is external — link by URL.

2. **Active SEP threads** — the live design debate lives on GitHub PRs in `modelcontextprotocol/modelcontextprotocol`:
   - **SEP-2640 — Skills Extension** (primary): https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640 — skills served as MCP resources, discovered through a `skills/list` / `skills/get` method pair, with optional `resources/directory/read` behind a capability flag. The PR branch (`sep/skills-extension`) is canonical; the repo-local `docs/sep-draft-skills-extension.md` copy predates the v1 rework and is explicitly stale — read the PR, not the local file.
   - **PR #2527** — recommend clients expose `resources/read` to models (prerequisite).
   - Historical/closed, useful for *why direction changed*: **SEP-2076** (skills as a first-class primitive, closed) and **SEP-2093** (resource contents metadata, rejected upstream).

   When a thread is relevant, deep-dive it (see [Deep diving](#deep-diving-into-a-pr-or-discussion)).

3. **Meeting notes** — GitHub Discussions on `modelcontextprotocol/modelcontextprotocol`. Sweep two categories:
   - `meeting-notes-skills-over-mcp-wg` (the WG's own notes): https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg
   - `meeting-notes-core-maintainers` (core maintainer notes — they periodically touch on direction relevant to this WG): https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-core-maintainers

   There is no `gh search discussions`. Use the GraphQL API and scope to a category — run it once per category, swapping the `category:` filter:

   ```bash
   gh api graphql -f query='query { search(query: "repo:modelcontextprotocol/modelcontextprotocol category:meeting-notes-skills-over-mcp-wg <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body createdAt author { login } authorAssociation category { name } comments(first: 20) { nodes { body author { login } authorAssociation } } } } } }'
   ```

4. **Discord — `#skills-over-mcp-wg`** — fast async signal and current sentiment. Use the `guildbridge` MCP server: `search_messages` to find mentions of the topic, `read_messages` to pull surrounding context.
   - Guild (server): `1358869848138059966`
   - Channel: `1464745826629976084`
   - Web link: https://discord.com/channels/1358869848138059966/1464745826629976084

   Focused design debates sometimes spin off into their own threads rather than staying in the main channel, and those threads are where the detail lives. The decision log's **References** sections link them by URL — when an entry you're citing links a Discord thread, read that thread rather than assuming the main channel search covered it.

5. **Issues & PRs** — `modelcontextprotocol/experimental-ext-skills` (the WG repo), open **and** closed/merged for historical context. Use the `github` MCP server's search tools (`search_issues`, `search_pull_requests`) or `gh search prs` / `gh search issues`.

6. **Spec content (background)** — the `mcp-docs` server (`search_model_context_protocol` tool) is authoritative for current protocol concepts and API references. Use it to ground terminology, not for WG opinion.

7. **Agent Skills spec (related work)** — this WG builds directly on the Agent Skills spec, so prior decisions and in-flight discussion there frequently inform WG questions (format, frontmatter fields, progressive disclosure, etc.). When a topic touches the skill format itself, invoke the **`search-agentskills-github`** skill (bundled in this plugin) to sweep the `agentskills/agentskills` GitHub org (PRs, issues, discussions, code). Treat what it finds as external prior art — link by URL and keep Agent Skills decisions distinct from this WG's decisions.

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
- **<Title>** (**Accepted/Proposed/Rejected/Superseded** <date>)
  One-line summary of the decision and its rationale.
```

Never present a `Superseded` entry as current. Either omit it, or list it under the entry that replaced it as history — "…superseded 2026-07-16 by the v1 scope-down, which replaced X with Y."

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
2. Grep the in-repo decision log (`docs/decisions.md`) first — separate settled from open, and check every hit's `Status` for `Superseded`. If the topic touches security or trust, grep `docs/threat-model.md` too.
3. Pull the active SEP threads (SEP-2640, #2527; closed SEP-2076/2093 for history) and deep-dive the relevant ones.
4. Search meeting-notes discussions — both the `meeting-notes-skills-over-mcp-wg` and `meeting-notes-core-maintainers` categories (GraphQL) — and the `#skills-over-mcp-wg` Discord (guildbridge).
5. Search `experimental-ext-skills` issues/PRs (open and closed).
6. If the topic touches the skill format itself, run the `search-agentskills-github` skill for Agent Skills prior art.
7. Aggregate into the output format above — settled → in-flight → sentiment — with maintainer quotes and footnotes for every claim.
