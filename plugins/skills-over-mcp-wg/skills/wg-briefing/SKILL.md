---
name: wg-briefing
description: Produce a short briefing of recent Skills Over MCP WG activity (daily by default, or any window — past week, past 2 weeks, etc.) across the decision log, SEP threads, meeting notes, Discord, and issues/PRs
license: Apache-2.0
compatibility: Run from a local clone of the experimental-ext-skills repo (uses git log on docs/decisions.md). Needs git, network access, and the guildbridge, github, and mcp-docs MCP servers, or the gh CLI as a fallback.
user_invocable: true
arguments:
  - name: since
    description: How far back to look — any git/GitHub date span (e.g. "1 day", "3 days", "1 week", "2 weeks", "1 month", or an absolute date like "2026-06-01"). Defaults to the last ~24 hours.
    required: false
---

# Skills Over MCP WG — briefing

A quick "what's happened lately" read across the WG's surfaces. Defaults to a daily scan but works for any window — past week, past two weeks, past month — by passing `since`. Keep it short and link-heavy — this is a scan, not an analysis. (First version; we'll iterate.)

## Recipe

1. **Set the window.** Use the `since` argument if given, otherwise default to the last ~24 hours. The same `<window>` value flows into every source below: pass it straight to `git log --since`, and convert it to an ISO cutoff date for the GitHub/Discord filters (e.g. "2 weeks" → the date 14 days ago). Absolute dates work too.

2. **Gather only what's new or changed in the window**, in this order:
   - **Decision log** — `git log -p --since="<window>" -- docs/decisions.md` (run from this repo). Note any added or changed entries and their `Status`.
   - **Active SEP threads** — new comments, commits, or status changes on SEP-2640 (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) and PR #2527. Use the `github` MCP server or `gh`.
   - **Meeting notes** — new or updated discussions in category `meeting-notes-skills-over-mcp-wg` on `modelcontextprotocol/modelcontextprotocol` (GraphQL `search`, filter by `createdAt`/`updatedAt` within the window).
   - **Discord `#skills-over-mcp-wg`** — recent messages via the `guildbridge` server (`read_messages` on channel `1464745826629976084`, guild `1358869848138059966`).
   - **Issues & PRs** — newly opened, closed, or merged items on `modelcontextprotocol/experimental-ext-skills` within the window.

3. **If a source has no activity in the window, say so in one line** — don't error, don't pad.

## Output format

```markdown
# WG briefing — <date> (since <window>)

## TL;DR
- 3–5 bullets, most important first.

## Decision log
- What changed (or "No changes.") with links.

## SEP threads
- New comments / status on SEP-2640, #2527 (or "No activity.").

## Meeting notes
- New/updated notes (or "No new notes.").

## Discord
- Notable threads or sentiment (or "Quiet.").

## Issues & PRs
- Opened / closed / merged (or "No activity.").

## Suggested follow-ups
- Anything that looks like it needs a response, review, or a decision.
```

Links over prose. No deep dives — that's what `/search-wg-sources <topic>` is for.
