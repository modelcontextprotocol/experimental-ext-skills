---
name: agent-plugins-briefing
description: Produce a short briefing of recent Agent Plugins activity (daily by default, or any window — past week, past 2 weeks, etc.) across the spec, schemas, PRs, issues, and discussions in the agentplugins GitHub org
license: Apache-2.0
compatibility: Requires internet access and either an authenticated `gh` CLI or a connected GitHub MCP server. No local clone needed — everything is read through the GitHub API.
user_invocable: true
arguments:
  - name: since
    description: How far back to look — any date span (e.g. "1 day", "3 days", "1 week", "2 weeks", "1 month", or an absolute date like "2026-06-01"). Defaults to the last ~24 hours.
    required: false
---

# Agent Plugins — briefing

A quick "what's happened lately" read across the [Agent Plugins](https://agent-plugins.org) org. Defaults to a daily scan but works for any window by passing `since`. Keep it short and link-heavy — this is a scan, not an analysis.

Unlike the WG briefing this is modelled on, there is no local clone and no Discord channel. Everything below comes from the GitHub API.

## Recipe

1. **Set the window.** Use the `since` argument if given, otherwise default to the last ~24 hours. Convert it once to an ISO cutoff date (e.g. "2 weeks" → the date 14 days ago) and reuse that value for every source below. Absolute dates work too.

2. **Gather only what's new or changed in the window**, in this order:

   - **Spec & schema changes** — commits touching the normative sources on `agentplugins/agent-plugins-spec`:

     ```bash
     gh api "repos/agentplugins/agent-plugins-spec/commits?since=<ISO>&path=spec" --jq '.[] | "\(.sha[0:7]) \(.commit.author.date[0:10]) \(.commit.message | split("\n")[0])"'
     gh api "repos/agentplugins/agent-plugins-spec/commits?since=<ISO>&path=schemas" --jq '.[] | "\(.sha[0:7]) \(.commit.author.date[0:10]) \(.commit.message | split("\n")[0])"'
     ```

     A **new version file** appearing under `spec/` (a `1.2.0.md` alongside `1.1.0.md`) is the highest-signal event this briefing can surface — lead with it. Say which version, and whether a matching `schemas/<version>/` directory landed with it.

   - **Deferred-work changes** — commits to `FUTURE_CONSIDERATIONS.md`, same call with `&path=FUTURE_CONSIDERATIONS.md`. Items moving *out* of this file usually mean something got adopted into the spec; items moving *in* mean something was considered and shelved. Both are newsworthy — say which direction it went.

   - **Governance changes** — commits to `GOVERNANCE.md` or `MAINTAINERS.md`. Rare, but a TSC membership change is worth a line.

   - **PRs** — opened, merged, or closed org-wide in the window:

     ```bash
     gh search prs --owner agentplugins --created ">=<ISO>" --json number,title,url,state,repository,createdAt
     gh search prs --owner agentplugins --merged-at ">=<ISO>" --json number,title,url,repository,closedAt
     ```

     For any PR that looks substantive, check its review surfaces — a PR has three, and the conversation tab alone misses the engineering discussion:
     - `gh api repos/agentplugins/<repo>/issues/<n>/comments` — top-level conversation.
     - `gh api repos/agentplugins/<repo>/pulls/<n>/reviews` — review submissions. Note `CHANGES_REQUESTED` / `APPROVED` and **who**; a TSC member requesting changes is often the single most important item in the window.
     - `gh api repos/agentplugins/<repo>/pulls/<n>/comments` — inline review threads, where spec critique lands.

     Filter each surface by `created_at`/`updated_at` within the window and attribute comments to their author.

   - **Issues** — opened or closed org-wide:

     ```bash
     gh search issues --owner agentplugins --created ">=<ISO>" --json number,title,url,state,repository
     gh search issues --owner agentplugins --closed ">=<ISO>" --json number,title,url,repository
     ```

   - **Discussions** — new or updated on the spec repo and org-wide, via GraphQL (there is no `gh search discussions`):

     ```bash
     gh api graphql -f query='query { search(query: "org:agentplugins updated:>=<ISO>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url createdAt updatedAt author { login } authorAssociation category { name } } } } }'
     ```

   - **Site & examples** — activity on `agentplugins/agent-plugins-site` and `agentplugins/agent-plugins-example` is already covered by the org-wide PR and issue searches. Call it out separately only when a spec change landed without the example being updated to match — that gap is worth flagging.

3. **If a source has no activity in the window, say so in one line** — don't error, don't pad.

Falling back to the GitHub MCP server instead of `gh`: PRs → `search_pull_requests`, issues → `search_issues`, PR surfaces → `pull_request_read` with `get_comments` / `get_reviews` / `get_review_comments`, and the GraphQL passthrough for discussions if it has one.

## Output format

```markdown
# Agent Plugins briefing — <date> (since <window>)

## TL;DR
- 3–5 bullets, most important first.

## Spec & schemas
- New version files, normative edits, schema changes. Or "No changes." Links throughout.

## Future considerations
- Items adopted out of, or shelved into, `FUTURE_CONSIDERATIONS.md` (or "No changes.").

## PRs
- Opened / merged / closed, with review verdicts — flag any `CHANGES_REQUESTED` by a maintainer (or "No activity.").

## Issues
- Opened / closed (or "No activity.").

## Discussions
- New or updated threads (or "Quiet.").

## Suggested follow-ups
- Anything that looks like it needs a response, review, or a decision.
```

Links over prose. No deep dives — that's what `/search-agent-plugins-github <topic>` is for.
