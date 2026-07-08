---
name: search-agentskills-github
description: Search Agent Skills PRs, issues, discussions, and code across the agentskills GitHub org. Use when researching prior decisions, finding related work, or checking how a topic was previously discussed before proposing a change.
license: Apache-2.0
compatibility: Requires internet access and either an authenticated `gh` CLI or a connected GitHub MCP server.
user_invocable: true
arguments:
  - name: topic
    description: The topic or keyword to search for
    required: true
---

# Searching Agent Skills PRs, issues, discussions, and code

## Where to search

- **Spec & docs (authoritative)**: For "what does the spec say" / format questions, prefer the project's own documentation first — https://agentskills.io, or the spec sources in the repo (`docs/specification.mdx`, `docs/skill-creation/*` on `agentskills/agentskills`). Use GitHub history (below) to understand *why* a decision was made, not just *what* the current rule is.
- **PRs & Issues**: `gh search prs` / `gh search issues` in `repo:agentskills/agentskills` (searches open and closed by default).
- **Code**: `gh search code` in `repo:agentskills/agentskills`.
- **Repo Discussions**: https://github.com/agentskills/agentskills/discussions (requires GraphQL — see below)
- **Org Discussions**: https://github.com/orgs/agentskills/discussions (requires GraphQL — see below)

For historical decisions, prioritize merged PRs and closed issues over open items.

## Search backend: `gh` CLI or GitHub MCP

**Prefer the `gh` CLI** when it is available and authenticated — the examples below assume it. If `gh` is not available, fall back to a connected GitHub MCP server:

- PRs → `search_pull_requests`, issues → `search_issues`, code → `search_code`, repos → `search_repositories`.
- For discussions, use the MCP server's GraphQL passthrough if it has one; otherwise note that discussions could not be searched.

## Searching PRs, issues, and code

```bash
# PRs (open + closed)
gh search prs --repo agentskills/agentskills "<topic>"

# Issues (open + closed)
gh search issues --repo agentskills/agentskills "<topic>"

# Code
gh search code --repo agentskills/agentskills "<topic>"
```

## Searching discussions

There is no `gh search discussions` command. Use the GraphQL API:

```bash
# Repo discussions
gh api graphql -f query="query { search(query: \"repo:agentskills/agentskills <topic>\", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }"

# Org-wide discussions
gh api graphql -f query="query { search(query: \"org:agentskills <topic>\", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }"
```

## Search term variants

GitHub search does **not** split camelCase tokens. `allowedTools` and `allowed tools` return almost entirely different results — search both.

- **camelCase** (`allowedTools`, `inputSchema`): matches identifiers in code and frontmatter
- **Space-separated** (`allowed tools`, `input schema`): matches natural-language discussion text

Skip kebab-case variants (`allowed-tools`) — GitHub tokenizes on hyphens, so they behave like the space-separated form but tend to return noisier results.

## Deep diving into a PR

**When to deep dive:** a search result PR looks highly relevant to the topic, and you need to understand _why_ a change was made, not just _what_ changed.

During a deep dive, look through:

- general conversation on the PR not tied to specific lines of code (`repos/agentskills/agentskills/issues/{pr_number}/comments`)
- comments left on specific lines of code during review (`repos/agentskills/agentskills/pulls/{pr_number}/comments`)
- top-level review bodies submitted with an approve/request-changes/comment verdict (`repos/agentskills/agentskills/pulls/{pr_number}/reviews`)

Each comment returned by these endpoints includes an `author_association` field — use it to identify maintainers (see [Notable maintainer quotes](#notable-maintainer-quotes)).

## Output format

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

**Identifying maintainers:** The GitHub API includes an `author_association` field (REST) or `authorAssociation` (GraphQL) on every comment. Treat users with association `MEMBER` or `OWNER` as maintainers.

When maintainers make comments that reveal design intent, set direction, or explain rationale, **quote them directly** with attribution and a footnote:

> "We maintain a high bar for additions to the spec — it is much easier to add things than to remove them." [^1]
> — @maintainer

Look for quotes that:

- Explain **why** a decision was made
- Set **direction** for future work
- **Reject** or **redirect** an approach
- Clarify the **intended semantics** of a feature

### Key insights

Summarize the most important findings and any decisions or consensus reached.

### Footnotes

Collect all sources as footnotes at the end. Every quote and claim presented in the output should have a corresponding footnote. For example:

```markdown
[^1]: [#123 review comment by @maintainer](https://github.com/agentskills/agentskills/pull/123#discussion_r...)

[^2]: [#456 allowed-tools field](https://github.com/agentskills/agentskills/issues/456)

[^3]: [Spec: Specification](https://agentskills.io/specification)
```

## General strategy

1. Generate search terms and variants (camelCase, space-separated, etc.)
2. Check https://agentskills.io (or the `docs/` sources on `agentskills/agentskills`) for authoritative spec content and concepts
3. Expand search terms and variants based on new information
4. Search GitHub locations (use the `gh` CLI if available, otherwise the GitHub MCP server)
5. Aggregate search results
6. Display output with summarized results, key insights, and direct attributions
