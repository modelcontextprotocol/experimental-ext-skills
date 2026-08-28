---
name: ai-catalog-briefing
description: Produce a short briefing of recent AI Catalog (AI Card) activity (daily by default, or any window — past week, past 2 weeks, etc.) across ADRs, the specification, docs, PRs, issues, and discussions in the Agent-Card GitHub org
license: Apache-2.0
compatibility: Requires internet access and either an authenticated `gh` CLI or a connected GitHub MCP server. No local clone needed — everything is read through the GitHub API.
user_invocable: true
arguments:
  - name: since
    description: How far back to look — any date span (e.g. "1 day", "3 days", "1 week", "2 weeks", "1 month", or an absolute date like "2026-06-01"). Defaults to the last ~24 hours.
    required: false
---

# AI Catalog — briefing

A quick "what's happened lately" read across the AI Catalog (AI Card) org, `Agent-Card`. Defaults to a daily scan but works for any window by passing `since`. Keep it short and link-heavy — this is a scan, not an analysis.

Unlike the WG briefing this is modelled on, there is no local clone and no Discord channel. Everything below comes from the GitHub API.

## Recipe

1. **Set the window.** Use the `since` argument if given, otherwise default to the last ~24 hours. Convert it once to an ISO cutoff date (e.g. "2 weeks" → the date 14 days ago) and reuse that value for every source below. Absolute dates work too.

2. **Gather only what's new or changed in the window**, in this order:

   - **ADRs — lead with these.** The `adr/` directory on `Agent-Card/ai-catalog` is where this project records its decisions, so a new or changed decision record is the most newsworthy thing the briefing can carry:

     ```bash
     gh api "repos/Agent-Card/ai-catalog/commits?since=<ISO>&path=adr" --jq '.[] | "\(.sha[0:7]) \(.commit.author.date[0:10]) \(.commit.message | split("\n")[0])"'
     ```

     For each hit, report the ADR number and title, and read its `**Status:**` line. A **new** record and a **status change** are both significant: a record moving from `Proposed` to `Accepted` means the group settled a question, and one moving to `Superseded` means an earlier decision was overturned — say what replaced it. Do not describe a record still marked `Proposed` as decided.

   - **Specification changes** — commits to `specification/`, which holds `ai-catalog.md`, the examples, and `trust-manifest-threat-model.md`:

     ```bash
     gh api "repos/Agent-Card/ai-catalog/commits?since=<ISO>&path=specification" --jq '.[] | "\(.sha[0:7]) \(.commit.author.date[0:10]) \(.commit.message | split("\n")[0])"'
     ```

     Flag changes to the threat model separately from changes to the format itself — trust, signing, and verification revisions carry different weight than a field rename.

   - **Docs changes** — same call with `&path=docs`. The `mappings/` subtree (how the format lines up against other specs) and `implementations.md` are the two worth calling out by name; other docs churn can be summarised in a line.

   - **PRs** — opened, merged, or closed org-wide in the window:

     ```bash
     gh search prs --owner Agent-Card --created ">=<ISO>" --json number,title,url,state,repository,createdAt
     gh search prs --owner Agent-Card --merged-at ">=<ISO>" --json number,title,url,repository,closedAt
     ```

     For any PR that looks substantive, check its three review surfaces — the conversation tab alone misses the engineering discussion:
     - `gh api repos/Agent-Card/<repo>/issues/<n>/comments` — top-level conversation.
     - `gh api repos/Agent-Card/<repo>/pulls/<n>/reviews` — review submissions. Note `CHANGES_REQUESTED` / `APPROVED` and **who**; a maintainer requesting changes is often the single most important item in the window.
     - `gh api repos/Agent-Card/<repo>/pulls/<n>/comments` — inline review threads, where spec critique lands.

     Filter each surface by `created_at`/`updated_at` within the window and attribute comments to their author.

   - **Issues** — opened or closed org-wide:

     ```bash
     gh search issues --owner Agent-Card --created ">=<ISO>" --json number,title,url,state,repository
     gh search issues --owner Agent-Card --closed ">=<ISO>" --json number,title,url,repository
     ```

   - **Discussions** — new or updated, via GraphQL (there is no `gh search discussions`):

     ```bash
     gh api graphql -f query='query { search(query: "org:Agent-Card updated:>=<ISO>", type: DISCUSSION, first: 20) { nodes { ... on Discussion { title url createdAt updatedAt author { login } authorAssociation category { name } } } } }'
     ```

   - **SDKs** — `ai-catalog-rust`, `ai-catalog-go`, and `ai-catalog-cli` are covered by the org-wide PR and issue searches above. Give them their own line only when SDK activity reveals a spec problem — an implementation issue that turns out to be an ambiguity in the format is worth surfacing to the spec side.

3. **If a source has no activity in the window, say so in one line** — don't error, don't pad.

Falling back to the GitHub MCP server instead of `gh`: PRs → `search_pull_requests`, issues → `search_issues`, PR surfaces → `pull_request_read` with `get_comments` / `get_reviews` / `get_review_comments`, and the GraphQL passthrough for discussions if it has one.

## Output format

```markdown
# AI Catalog briefing — <date> (since <window>)

## TL;DR
- 3–5 bullets, most important first.

## ADRs
- New records, and any status changes (`Proposed` → `Accepted`, or → `Superseded`, with what replaced them). Or "No changes." Links throughout.

## Specification
- Format changes, example changes, and trust-manifest/threat-model revisions (or "No changes.").

## Docs
- Notably `mappings/` and `implementations.md` (or "No changes.").

## PRs
- Opened / merged / closed, with review verdicts — flag any `CHANGES_REQUESTED` by a maintainer (or "No activity.").

## Issues
- Opened / closed, including SDK issues that point at a spec ambiguity (or "No activity.").

## Discussions
- New or updated threads (or "Quiet.").

## Suggested follow-ups
- Anything that looks like it needs a response, review, or a decision.
```

Links over prose. No deep dives — that's what `/search-ai-catalog-github <topic>` is for.
