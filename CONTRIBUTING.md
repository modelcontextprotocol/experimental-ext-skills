# Contributing

## How to Participate

This Working Group welcomes contributions from anyone interested in skills distribution over MCP. You can participate by:

- Joining discussions in the [#skills-over-mcp-wg Discord channel](https://discord.com/channels/1358869848138059966/1464745826629976084) (info on joining the Discord server [here](https://modelcontextprotocol.io/community/communication#discord))
- Opening or commenting on [GitHub Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg) in the main MCP repo
- Sharing experimental findings from your own implementations
- Contributing to documentation and pattern evaluation

## Communication Channels

| Channel | Purpose | Response Expectation |
| :--- | :--- | :--- |
| [Discord #skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084) | Quick questions, coordination, async discussion | Best effort |
| [GitHub Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg) | Meeting notes, long-form technical proposals, experimental findings | Weekly triage |
| This repository | Living reference for approaches, findings, and decisions | Updated after meetings |

## Coordination with the Agent Skills Spec

The [Agent Skills spec](https://agentskills.io/) is maintained in the [agentskills/agentskills](https://github.com/agentskills/agentskills) repository. For topics that intersect with both this WG and the Agent Skills spec (e.g., protocol design questions, proposed extensions, or alignment on terminology), the recommended channel is [Discussions](https://github.com/agentskills/agentskills/discussions) in that repository.

Before opening a discussion, review the [Agent Skills contributing guide](https://github.com/agentskills/agentskills/blob/main/CONTRIBUTING.md).

## Meetings

[Meeting notes](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg) are published in the main MCP repo discussions. Future meetings will be scheduled and scheduling surveys posted in the [#skills-over-mcp-wg Discord channel](https://discord.com/channels/1358869848138059966/1464745826629976084).

Meeting norms:

- Working Sessions are published on [meet.modelcontextprotocol.io](https://meet.modelcontextprotocol.io) at least 7 days in advance
- Agendas are posted as GitHub Discussions ahead of each session
- Notes published within 48 hours

## Decision-Making

As a Working Group, we make binding decisions on technical design and SEPs within our [charter scope](https://modelcontextprotocol.io/community/skills-over-mcp/charter). Per MCP [group governance](https://modelcontextprotocol.io/community/working-interest-groups#decision-making-process), decisions progress through:

- **Lazy consensus** — proposals announced with a deadline (5 days minimum for minor items, 10 days for significant items); silence is consent; any WG Member may block with a documented objection
- **Formal vote** — triggered by a block or by a Lead / three or more WG Members; 50% quorum of active WG Members; simple majority for routine matters, 2/3 for scope changes
- **Escalation** — unresolved matters are escalated to Core Maintainers with documented context

Authority by decision type is detailed in the [charter's Authority & Decision Rights table](https://modelcontextprotocol.io/community/skills-over-mcp/charter#authority-decision-rights).

Outputs include:

- SEPs we shepherd from proposal through review (Extensions Track and related protocol changes)
- Reference implementations demonstrating skill discovery and consumption
- Documented requirements, evaluated approaches, and experimental findings

## Contribution Guidelines

### Documenting Approaches and Findings

When adding experimental findings or new approaches:

- Include enough detail for others to reproduce or evaluate
- Note which clients and servers were tested
- Be explicit about what worked, what didn't, and what remains untested
- Attribute community input with GitHub handles and link to the source where possible

### Community Input

When adding quotes or input from community discussions:

- Attribute to the contributor by name and GitHub handle
- Link to the original source (Discord thread, GitHub comment, etc.) where possible
- Present input as blockquotes to distinguish it from editorial content

### Decision Log

Significant decisions made during meetings or through async discussion should be recorded in [docs/decisions.md](docs/decisions.md) using the ADR-lite format defined there. A decision is worth logging when it:

- Chooses one approach over alternatives
- Sets or changes the group's scope
- Establishes a convention or coordination mechanism

Add a new entry after the meeting where the decision was made or when rough consensus is reached asynchronously. Include context, the decision itself, rationale, and links to relevant issues, PRs, or discussion threads.

### Filing Issues

Use GitHub Issues for:

- Proposing new approaches or use cases
- Reporting gaps in documentation
- Tracking action items from meetings
