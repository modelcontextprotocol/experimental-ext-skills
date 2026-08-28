---
name: search-ai-catalog-github
description: Search AI Catalog (AI Card) PRs, issues, discussions, ADRs, and code across the Agent-Card GitHub org. Use when researching prior decisions, finding related work, or checking how a topic was previously discussed before proposing a change.
license: Apache-2.0
compatibility: Requires internet access and either an authenticated `gh` CLI or a connected GitHub MCP server.
user_invocable: true
arguments:
  - name: topic
    description: The topic or keyword to search for
    required: true
---

# Searching AI Catalog PRs, issues, discussions, ADRs, and code

The AI Catalog project defines a common standard for describing and discovering AI capabilities. The GitHub org is `Agent-Card`; the working repository is `Agent-Card/ai-catalog`, with SDKs in Rust, Go, and a CLI alongside it.

## Naming: three names for one project

This project is unusually easy to search badly, because the org, the repos, and the spec term all differ:

- **AI Card** — the project and working-group name. Per [ADR-0010](https://github.com/Agent-Card/ai-catalog/blob/main/adr/0010-ai-card-terminology.md), it is the high-level concept and deliberately does *not* appear as the formal spec term.
- **Catalog Entry** — the term the specification actually uses.
- **AI Catalog** — the repo and docs naming.

Search all three when a topic could be phrased any of these ways. A search for "AI Card" against spec text will under-return; a search for "Catalog Entry" against discussion threads will too.

Also keep protocol-specific cards distinct: an A2A Agent Card and an MCP server card are *not* the same thing as this project's Catalog Entry, and results mentioning them may be about a different spec entirely.

## Where to search

- **ADRs (start here for "why")**: `adr/` on `Agent-Card/ai-catalog` holds numbered decision records (`0001-…` onward) in Status / Context / Decision / Rationale form, naming the participants in each discussion. This is the highest-signal source for rationale — check it before reconstructing a decision from PR threads. Note that an ADR may carry `**Status:** Proposed` rather than accepted; read the status line before quoting it as settled.
- **Spec (authoritative)**: `specification/ai-catalog.md`, with examples under `specification/examples/` and a `specification/trust-manifest-threat-model.md` for trust, signing, and verification questions.
- **Docs site**: https://agent-card.github.io/ai-catalog/ — the rendered `docs/` tree, including `getting-started.md`, `guides/`, `mappings/` (how the format maps onto other specs), and `implementations.md`.
- **Process**: `GOVERNANCE.md` and `CONTRIBUTING.md`.
- **PRs & Issues**: `gh search prs` / `gh search issues` across `Agent-Card` (searches open and closed by default).
- **Code & SDKs**: `gh search code` across `Agent-Card` — covers `ai-catalog-rust`, `ai-catalog-go`, and `ai-catalog-cli`. SDK issues often surface where the spec is ambiguous in practice.
- **Repo Discussions**: https://github.com/Agent-Card/ai-catalog/discussions (requires GraphQL — see below)
- **Org Discussions**: https://github.com/orgs/Agent-Card/discussions (requires GraphQL — see below)

For historical decisions, prioritize ADRs, then merged PRs and closed issues, over open items.

## Search backend: `gh` CLI or GitHub MCP

**Prefer the `gh` CLI** when it is available and authenticated — the examples below assume it. If `gh` is not available, fall back to a connected GitHub MCP server:

- PRs → `search_pull_requests`, issues → `search_issues`, code → `search_code`, repos → `search_repositories`.
- For discussions, use the MCP server's GraphQL passthrough if it has one; otherwise note that discussions could not be searched.

## Searching PRs, issues, and code

```bash
# PRs (open + closed), org-wide
gh search prs --owner Agent-Card "<topic>"

# Issues (open + closed), org-wide
gh search issues --owner Agent-Card "<topic>"

# Code
gh search code --owner Agent-Card "<topic>"

# Narrow to the working repo when org-wide is too noisy
gh search prs --repo Agent-Card/ai-catalog "<topic>"
```

## Reading the ADRs

The ADR set is small enough to list and scan directly, which is usually faster than searching it:

```bash
# List all decision records
gh api repos/Agent-Card/ai-catalog/contents/adr --jq '.[].name'

# Grep across ADR titles and bodies for a topic
gh search code --repo Agent-Card/ai-catalog --filename "*.md" "<topic>"
```

When an ADR answers the question, quote its Decision and Rationale and link the file directly. Prefer it over a PR thread saying the same thing less precisely.

## Searching discussions

There is no `gh search discussions` command. Use the GraphQL API:

```bash
# Repo discussions
gh api graphql -f query='query { search(query: "repo:Agent-Card/ai-catalog <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }'

# Org-wide discussions
gh api graphql -f query='query { search(query: "org:Agent-Card <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }'
```

## Search term variants

GitHub search does **not** split camelCase tokens. `displayName` and `display name` return almost entirely different results — search both.

- **camelCase** (`displayName`, `mediaType`, `trustManifest`): matches identifiers in schemas, SDK code, and spec field names
- **Space-separated** (`display name`, `media type`, `trust manifest`): matches natural-language discussion and ADR text

Skip kebab-case variants — GitHub tokenizes on hyphens, so they behave like the space-separated form but tend to return noisier results.

Several ADRs record renamed fields (for example media type to type, and URL field naming). A term that returns nothing may simply be the old or the new name — when a search comes up empty, scan the ADR list for a rename before concluding the concept is absent.

## Deep diving into a PR

**When to deep dive:** a search result PR looks highly relevant to the topic, and you need to understand _why_ a change was made, not just _what_ changed.

During a deep dive, look through:

- general conversation on the PR not tied to specific lines of code (`repos/Agent-Card/<repo>/issues/{pr_number}/comments`)
- comments left on specific lines of code during review (`repos/Agent-Card/<repo>/pulls/{pr_number}/comments`)
- top-level review bodies submitted with an approve/request-changes/comment verdict (`repos/Agent-Card/<repo>/pulls/{pr_number}/reviews`)

Each comment returned by these endpoints includes an `author_association` field — use it to identify maintainers (see [Notable maintainer quotes](#notable-maintainer-quotes)).

## Output format

### ADRs

```markdown
- [ADR-0010](url) - Title (**Proposed/Accepted/Superseded** <date>)
  The decision, in one line.
```

### PRs

```markdown
- [#123](url) - PR Title (**Merged/Closed/Open** <date>)
  Brief summary of PR
```

### Issues

```markdown
- [#456](url) - Issue Title (**Open/Closed** <date>)
  Brief summary of issue
```

### Discussions

```markdown
- [#789](url) - Discussion Title (<date>)
  Brief summary of discussion content
```

### Notable maintainer quotes

**Identifying maintainers:** The GitHub API includes an `author_association` field (REST) or `authorAssociation` (GraphQL) on every comment. Treat users with association `MEMBER` or `OWNER` as maintainers. ADRs additionally name their participants and affiliations in a `**Participants:**` line, which is often the better attribution for a design decision — an ADR frequently records a view argued in a meeting rather than in a comment thread.

Contributors come from several vendors. Note affiliation when a quote reflects a particular implementation's constraints.

When maintainers make comments that reveal design intent, set direction, or explain rationale, **quote them directly** with attribution and a footnote:

> "All this stuff is called the AI card, and the AI card is nowhere." [^1]
> — Luca Muscariello (Cisco), ADR-0010

Look for quotes that:

- Explain **why** a decision was made
- Set **direction** for future work
- **Reject** or **redirect** an approach
- Clarify the **intended semantics** of a feature

### Key insights

Summarize the most important findings and any decisions or consensus reached. Distinguish accepted decisions from ADRs still marked Proposed.

### Footnotes

Collect all sources as footnotes at the end. Every quote and claim presented in the output should have a corresponding footnote. For example:

```markdown
[^1]: [ADR-0010: "AI Card" terminology](https://github.com/Agent-Card/ai-catalog/blob/main/adr/0010-ai-card-terminology.md)

[^2]: [#123 review comment by @maintainer](https://github.com/Agent-Card/ai-catalog/pull/123#discussion_r...)

[^3]: [Specification: Catalog Entry](https://github.com/Agent-Card/ai-catalog/blob/main/specification/ai-catalog.md)
```

## General strategy

1. Generate search terms and variants — including the AI Card / Catalog Entry / AI Catalog naming split, plus camelCase and space-separated forms
2. Scan the `adr/` list first for a decision record covering the topic
3. Check `specification/ai-catalog.md` and https://agent-card.github.io/ai-catalog/ for authoritative content
4. Expand search terms and variants based on new information, including any renames the ADRs reveal
5. Search GitHub org-wide (use the `gh` CLI if available, otherwise the GitHub MCP server)
6. Aggregate search results
7. Display output with summarized results, key insights, and direct attributions
