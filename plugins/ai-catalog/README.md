# AI Catalog Plugin

Skills for searching and keeping up with the AI Catalog (AI Card) project — its ADRs, specification, docs, PRs, issues, and discussions across the [`Agent-Card`](https://github.com/Agent-Card) GitHub org.

## Installation

### Claude Code

```bash
/plugin marketplace add modelcontextprotocol/experimental-ext-skills
```

### Claude Cowork

Navigate to Customize >> Browse Plugins >> Personal >> Plus Button >> Add marketplace from GitHub and add `modelcontextprotocol/experimental-ext-skills`.

## MCP servers

The plugin declares one server:

| Server | Transport | Used for |
| :--- | :--- | :--- |
| `github` | streamable-http | PRs, issues, discussions, and code |

**Note:** the GitHub MCP server may require authentication. If it isn't available, the skills fall back to the `gh` CLI (`gh search`, `gh api graphql`), which is equivalent for these tasks.

This plugin reads GitHub only. No Discord source is wired up — there's no Discord MCP server configured, so nothing in this plugin reads one.

## Three names for one project

Searching this project by hand goes wrong because the org, the repos, and the spec all use different names:

- **AI Card** — the project and working-group name. Per [ADR-0010](https://github.com/Agent-Card/ai-catalog/blob/main/adr/0010-ai-card-terminology.md) it is the high-level concept, and deliberately does not appear as the formal spec term.
- **Catalog Entry** — the term the specification uses.
- **AI Catalog** — the repo and docs naming.

Both skills search all three.

## Available skills

### `/search-ai-catalog-github <topic>`

Search the org for prior decisions and related work.

The `adr/` directory is the highest-signal source here — numbered decision records in Status / Context / Decision / Rationale form, naming the participants in each discussion — so the skill checks it before reconstructing rationale from PR threads, and reads the `Status` line rather than treating a record still marked `Proposed` as settled. Several ADRs record field renames, so an empty result gets checked against the ADR list before the concept is called absent.

**Example:**

```
/search-ai-catalog-github trust manifest
```

**Note:** the skill searches both open **and** closed/merged issues and PRs — important for understanding past decisions and why direction changed.

### `/ai-catalog-briefing [since]`

A short briefing of what's changed across the org within a time window (default: last ~24 hours, but any span works). Links over prose; no deep dives.

Unlike `/wg-briefing`, there's no local clone to `git log` — commit history is read through the GitHub API. New and changed ADRs lead the briefing, including status flips from `Proposed` to `Accepted` or `Superseded`; trust-manifest and threat-model changes are called out separately from format changes.

**Examples:**

```
/ai-catalog-briefing
/ai-catalog-briefing 1 week
/ai-catalog-briefing 2 weeks
```

## Conformance

This plugin targets [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md). The portable core is root `plugin.json` and `mcp.json`, both declaring the 1.0.0 canonical `$schema`, with skills under `skills/<name>/SKILL.md`.

A 1.1.0 spec exists upstream on `main`, but its schemas are not yet published at the canonical URL, so plugins target 1.0.0 until that release lands.

`.claude-plugin/plugin.json` and `.mcp.json` are retained as a Claude Code adapter. The portable files are the source of truth; keep the two in sync when either changes.
