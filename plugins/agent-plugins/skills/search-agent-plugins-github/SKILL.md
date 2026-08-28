---
name: search-agent-plugins-github
description: Search Agent Plugins PRs, issues, discussions, and code across the agentplugins GitHub org. Use when researching prior decisions, finding related work, or checking how a topic was previously discussed before proposing a change.
license: Apache-2.0
compatibility: Requires internet access and either an authenticated `gh` CLI or a connected GitHub MCP server.
user_invocable: true
arguments:
  - name: topic
    description: The topic or keyword to search for
    required: true
---

# Searching Agent Plugins PRs, issues, discussions, and code

[Agent Plugins](https://agent-plugins.org) is a vendor-neutral specification for packaging reusable agent extensions into distributable plugins. Governance sits with a Technical Steering Committee.

## Where to search

- **Spec & docs (authoritative)**: For "what does the spec say" / format questions, prefer the project's own sources first — https://agent-plugins.org, or the versioned spec text under `spec/` on `agentplugins/agent-plugins-spec` (one file per release, e.g. `spec/1.0.0.md`, `spec/1.1.0.md`) with matching JSON Schemas under `schemas/<version>/`. Use GitHub history (below) to understand *why* a decision was made, not just *what* the current rule is.
- **Deliberately deferred work**: `FUTURE_CONSIDERATIONS.md` records what was considered and left out of the current version. Check it before concluding something was never discussed — "absent from the spec" and "rejected" are different answers.
- **Process**: `GOVERNANCE.md` and `MAINTAINERS.md` for how decisions get made and who makes them.
- **PRs & Issues**: `gh search prs` / `gh search issues` across `agentplugins` (searches open and closed by default).
- **Code & examples**: `gh search code` across `agentplugins`. Canonical examples and the migration guide live in `agentplugins/agent-plugins-example`.
- **Repo Discussions**: https://github.com/agentplugins/agent-plugins-spec/discussions (requires GraphQL — see below)
- **Org Discussions**: https://github.com/orgs/agentplugins/discussions (requires GraphQL — see below)

Search the whole org rather than a single repo. The spec, site, and example repos are separate, and a question about spec wording often has its rationale in a site or example PR. Narrow to `agentplugins/agent-plugins-spec` only when org-wide results are too noisy.

For historical decisions, prioritize merged PRs and closed issues over open items.

## Search backend: `gh` CLI or GitHub MCP

**Prefer the `gh` CLI** when it is available and authenticated — the examples below assume it. If `gh` is not available, fall back to a connected GitHub MCP server:

- PRs → `search_pull_requests`, issues → `search_issues`, code → `search_code`, repos → `search_repositories`.
- For discussions, use the MCP server's GraphQL passthrough if it has one; otherwise note that discussions could not be searched.

## Searching PRs, issues, and code

```bash
# PRs (open + closed), org-wide
gh search prs --owner agentplugins "<topic>"

# Issues (open + closed), org-wide
gh search issues --owner agentplugins "<topic>"

# Code
gh search code --owner agentplugins "<topic>"

# Narrow to the spec repo when org-wide is too noisy
gh search prs --repo agentplugins/agent-plugins-spec "<topic>"
```

## Searching discussions

There is no `gh search discussions` command. Use the GraphQL API:

```bash
# Repo discussions
gh api graphql -f query='query { search(query: "repo:agentplugins/agent-plugins-spec <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }'

# Org-wide discussions
gh api graphql -f query='query { search(query: "org:agentplugins <topic>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url body author { login } authorAssociation category { name } answer { author { login } authorAssociation body } } } } }'
```

## Search term variants

GitHub search does **not** split camelCase tokens. `entryPoint` and `entry point` return almost entirely different results — search both.

- **camelCase** (`entryPoint`, `mediaType`): matches identifiers in code, schemas, and manifest fields
- **Space-separated** (`entry point`, `media type`): matches natural-language discussion text

Skip kebab-case variants — GitHub tokenizes on hyphens, so they behave like the space-separated form but tend to return noisier results.

The spec is versioned as whole files, so a term may exist in `1.1.0.md` but not `1.0.0.md`. When a search hits spec text, check which version file it came from before describing it as current.

## Deep diving into a PR

**When to deep dive:** a search result PR looks highly relevant to the topic, and you need to understand _why_ a change was made, not just _what_ changed.

During a deep dive, look through:

- general conversation on the PR not tied to specific lines of code (`repos/agentplugins/<repo>/issues/{pr_number}/comments`)
- comments left on specific lines of code during review (`repos/agentplugins/<repo>/pulls/{pr_number}/comments`)
- top-level review bodies submitted with an approve/request-changes/comment verdict (`repos/agentplugins/<repo>/pulls/{pr_number}/reviews`)

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

**Identifying maintainers:** The GitHub API includes an `author_association` field (REST) or `authorAssociation` (GraphQL) on every comment. Treat users with association `MEMBER` or `OWNER` as maintainers. `MAINTAINERS.md` on `agentplugins/agent-plugins-spec` lists the Technical Steering Committee by name and affiliation, which is useful for attribution — it does not list GitHub handles, so `author_association` remains the reliable programmatic signal.

Maintainers are drawn from several vendors. Note affiliation when a quote reflects a particular runtime's implementation constraints.

When maintainers make comments that reveal design intent, set direction, or explain rationale, **quote them directly** with attribution and a footnote:

> "The bar for v1 is what every runtime can implement, not what any one runtime already ships." [^1]
> — @maintainer

Look for quotes that:

- Explain **why** a decision was made
- Set **direction** for future work
- **Reject** or **redirect** an approach
- Clarify the **intended semantics** of a feature

### Key insights

Summarize the most important findings and any decisions or consensus reached. Where the answer is "considered and deferred", say so and cite `FUTURE_CONSIDERATIONS.md`.

### Footnotes

Collect all sources as footnotes at the end. Every quote and claim presented in the output should have a corresponding footnote. For example:

```markdown
[^1]: [#123 review comment by @maintainer](https://github.com/agentplugins/agent-plugins-spec/pull/123#discussion_r...)

[^2]: [Spec 1.1.0: manifest fields](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.1.0.md)

[^3]: [Agent Plugins site](https://agent-plugins.org)
```

## General strategy

1. Generate search terms and variants (camelCase, space-separated, etc.)
2. Check https://agent-plugins.org and the `spec/` sources for authoritative content, and `FUTURE_CONSIDERATIONS.md` for deliberately deferred items
3. Expand search terms and variants based on new information
4. Search GitHub org-wide (use the `gh` CLI if available, otherwise the GitHub MCP server)
5. Aggregate search results
6. Display output with summarized results, key insights, and direct attributions
