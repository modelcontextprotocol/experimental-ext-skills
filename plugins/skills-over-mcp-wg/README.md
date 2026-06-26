# Skills Over MCP WG Plugin

Skills for searching and keeping up with the **Skills Over MCP Working Group** — its decision log, meeting notes, active SEP threads, Discord, and issues/PRs.

## Installation

### Claude Code

```bash
/plugin marketplace add modelcontextprotocol/experimental-ext-skills
```

### Claude Cowork

Navigate to Customize >> Browse Plugins >> Personal >> Plus Button >> Add marketplace from GitHub and add `modelcontextprotocol/experimental-ext-skills`.

## MCP servers

The plugin's `.mcp.json` declares three servers the skills use:

| Server | Transport | Used for |
| :--- | :--- | :--- |
| `guildbridge` | http | The `#skills-over-mcp-wg` Discord channel |
| `github` | http | PRs, issues, and discussions |
| `mcp-docs` | http | Authoritative MCP spec content |

**Note:** the GitHub MCP server may require authentication. If it isn't available, the skills fall back to the `gh` CLI (`gh search`, `gh api graphql`), which is equivalent for these tasks.

## Available skills

### `/search-wg-sources <topic>`

Search across the WG's surfaces and return one attributed answer — leading with what's *settled* (decision log, merged PRs), then what's *in flight* (open SEP threads, open questions), then *sentiment* (Discord).

**Sources searched:**

- Decision log and living docs (`docs/decisions.md`, `open-questions.md`, `approaches.md`, …) — in-repo
- [SEP-2640: Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) and related/historical SEP threads
- [Meeting notes discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg)
- [`#skills-over-mcp-wg` Discord](https://discord.com/channels/1358869848138059966/1464745826629976084)
- [`experimental-ext-skills` issues & PRs](https://github.com/modelcontextprotocol/experimental-ext-skills)

**Example:**

```
/search-wg-sources skill uri scheme
```

**Note:** the skill searches both open **and** closed/merged issues and PRs — important for understanding past decisions and why direction changed.

### `/wg-briefing [since]`

A short briefing of what's changed across the same sources within a time window (default: last ~24 hours, but any span works). Links over prose; no deep dives. Intentionally simple for now — meant to be run daily and iterated on.

**Examples:**

```
/wg-briefing
/wg-briefing 1 week
/wg-briefing 2 weeks
```
