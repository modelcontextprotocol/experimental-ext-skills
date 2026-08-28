# Agent Plugins Plugin

Skills for searching and keeping up with the [Agent Plugins](https://agent-plugins.org) specification — its spec and schemas, PRs, issues, and discussions across the [`agentplugins`](https://github.com/agentplugins) GitHub org.

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

There is no Discord source for this org — everything comes from GitHub.

## Available skills

### `/search-agent-plugins-github <topic>`

Search the org for prior decisions and related work: PRs, issues, discussions, code, and the versioned spec text under `spec/`.

The skill knows two things that are easy to get wrong by hand. Spec text is versioned as whole files (`spec/1.0.0.md`, `spec/1.1.0.md`), so it checks *which* version a hit came from before calling it current. And `FUTURE_CONSIDERATIONS.md` records what was deliberately deferred — so "not in the spec" and "rejected" come back as different answers.

**Example:**

```
/search-agent-plugins-github mcp transport
```

**Note:** the skill searches both open **and** closed/merged issues and PRs — important for understanding past decisions and why direction changed.

### `/agent-plugins-briefing [since]`

A short briefing of what's changed across the org within a time window (default: last ~24 hours, but any span works). Links over prose; no deep dives.

Unlike `/wg-briefing`, there's no local clone to `git log` — commit history is read through the GitHub API. A new version file appearing under `spec/` leads the briefing; movement in and out of `FUTURE_CONSIDERATIONS.md` is reported with its direction.

**Examples:**

```
/agent-plugins-briefing
/agent-plugins-briefing 1 week
/agent-plugins-briefing 2 weeks
```

## Conformance

This plugin targets [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md). The portable core is root `plugin.json` and `mcp.json`, both declaring the 1.0.0 canonical `$schema`, with skills under `skills/<name>/SKILL.md`.

A 1.1.0 spec exists upstream on `main`, but its schemas are not yet published at the canonical URL, so plugins target 1.0.0 until that release lands.

`.claude-plugin/plugin.json` and `.mcp.json` are retained as a Claude Code adapter. The portable files are the source of truth; keep the two in sync when either changes.
