# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project overview

Incubation repository for the [Skills Over MCP Working Group](https://modelcontextprotocol.io/community/skills-over-mcp/charter): design docs, experimental findings, and a decision log covering how [Agent Skills](https://agentskills.io/) are served over MCP. It is documentation-only — no application code, and no build, test, or lint step.

## The v1 SEP source of truth is the PR, not this repository

The specification text for the Skills Extension lives on **[SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640)** (`modelcontextprotocol/modelcontextprotocol`, branch [`sep/skills-extension`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/sep/skills-extension/seps/2640-skills-extension.md)). That PR is authoritative.

[`docs/sep-draft-skills-extension.md`](docs/sep-draft-skills-extension.md) is a verbatim copy of the v1 baseline, synced from that branch at a commit pinned in the file's header. It exists so Working Group discussion, meeting notes, and decision records can quote and link stable text.

What this means when working here:

- **Do not answer questions about what the spec says from this repository alone.** The copy is only as current as its last sync — check the pinned commit in the file header against the canonical branch before relying on it. An earlier copy drifted far enough to describe a `skill://index.json` resource and a no-nesting rule that no longer exist, which misled readers who found it first.
- **Do not hand-edit the copy's spec text to change the design.** Re-sync by overwriting the unmarked text from the canonical file and updating the pinned commit reference.
- **Review of v1 belongs on the PR**, not on this repository's copy.

## Proposing changes beyond v1

Changes beyond v1 are proposed here rather than added to the upstream SEP. The vehicle is a dated entry in [`docs/decisions.md`](docs/decisions.md) with `**Status:** Proposed`, in the ADR-lite format used throughout that file (Status / Context / Decision / Rationale / References) — the PR carrying that entry is the proposal.

Once a proposal is accepted, the resulting spec text is applied to the baseline copy and that section is marked with a pointer back to its record. A section without such a marker is v1 as it stands upstream.

When a decision supersedes or amends an earlier one, add a forward pointer to the earlier entry's `**Status:**` line rather than rewriting the entry. The log is an auditable trace of the group's reasoning over time, not a snapshot of current state.

## Conventions

- Markdown only. Do not hard-wrap prose — each paragraph is a single line, broken only where the markup requires it (list items, headings, code blocks, table rows).
- Refer to other repositories by GitHub URL rather than local filesystem paths.
- Attribute community input by name and GitHub handle, link to the original source, and present quoted input as blockquotes to distinguish it from editorial content.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for participation, meetings, decision-making authority, and full decision-log guidance.
