# Skills Over MCP Interest Group

> ⚠️ **Experimental** — This repository is an incubation space for the Skills Over MCP Interest Group. Contents are exploratory and do not represent official MCP specifications or recommendations.

## Mission

This Interest Group explores how "[agent skills](https://agentskills.io/)" (rich, structured instructions for agent workflows) can be discovered and consumed through MCP. Native skills support in host applications demonstrates strong demand, but the community hasn't aligned on whether existing MCP primitives suffice or what conventions to standardize. Cross-cutting collaboration is needed because solutions touch the protocol spec, registry schema, SDK implementations, and client behavior.

## Scope

### In Scope

- **Requirements gathering:** Documenting use cases, constraints, and gaps in current MCP primitives for skill distribution
- **Pattern exploration:** Testing and evaluating approaches (skills as tools, resources, registry metadata, protocol primitives)
- **Coordination:** Bridging discussions across Registry WG, Agents WG, and external stakeholders (Agent Skills spec owners, FastMCP, PydanticAI)
- **Proof of concepts:** Maintaining a shared repo of reference implementations and experimental findings

### Out of Scope

- **Approving spec changes:** This IG does not have authority to approve protocol changes; recommendations flow through the SEP process
- **Registry schema decisions:** Coordinate with Registry WG; this IG explores requirements but doesn't own the schema
- **Client implementation mandates:** We can document patterns but not require specific client behavior

## Problem Statement

Native "skills" support in host applications demonstrates demand for rich workflow instructions, but there's no convention for exposing equivalent functionality through MCP primitives. Current limitations include:

- **Server instructions load only at initialization** — new or updated skills require re-initializing the server
- **Complex workflows exceed practical instruction size** — some skills require hundreds of lines of markdown with references to bundled files
- **No discovery mechanism** — users installing MCP servers don't know if there's a corresponding skill they should also install
- **Multi-server orchestration** — skills may need to coordinate tools from multiple servers

See [problem-statement.md](docs/problem-statement.md) for full details.

## Repository Contents

| Document | Description |
| :--- | :--- |
| [Problem Statement](docs/problem-statement.md) | Current limitations and gaps |
| [Use Cases](docs/use-cases.md) | Key use cases driving this work |
| [Approaches](docs/approaches.md) | Approaches being explored (not mutually exclusive) |
| [Open Questions](docs/open-questions.md) | Unresolved questions with community input |
| [Experimental Findings](docs/experimental-findings.md) | Results from implementations and testing |
| [Related Work](docs/related-work.md) | SEPs, implementations, and external resources |
| [Meeting Notes](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-ig) | Published after each working session |
| [Contributing](CONTRIBUTING.md) | How to participate |

## Stakeholder Groups

| Group | Overlap |
| :--- | :--- |
| Agents WG | How agents consume server metadata, skill activation |
| Registry WG | Skills discovery/distribution, registry schema changes |
| Primitive Grouping WG | Progressive disclosure patterns |

## Facilitators

| Role | Name | Organization | GitHub |
| :--- | :--- | :--- | :--- |
| Maintainer | Ola Hungerford | Nordstrom / MCP Maintainer | [@olaservo](https://github.com/olaservo) |
| Facilitator | Bob Dickinson | TeamSpark.ai | [@BobDickinson](https://github.com/BobDickinson) |
| Facilitator | Rado | Stacklok / MCP Maintainer | [@rdimitrov](https://github.com/rdimitrov) |
| Facilitator | Yu Yi | Google | [@erain](https://github.com/erain) |
| Facilitator | Ozz | Stacklok | [@JAORMX](https://github.com/JAORMX) |
| Facilitator | Kaxil Naik | Astronomer / Apache Airflow PMC | [@kaxil](https://github.com/kaxil) |

## Lifecycle

**Current Status: Active Exploration**

### Graduation Criteria (IG → WG)

This IG may propose becoming a Working Group if:

- Clear consensus emerges on an approach requiring sustained spec work
- Cross-cutting coordination requires formal authority delegation
- At least two Core Maintainers sponsor WG formation

### Retirement Criteria

- Problem space resolved (conventions established, absorbed into other WGs)
- Insufficient participation to maintain momentum
- Community consensus that skills don't belong in MCP protocol scope

## Work Tracking

| Item | Status | Champion | Notes |
| :--- | :--- | :--- | :--- |
| Requirements alignment | In Progress | All facilitators | Review approaches, identify common requirements and gaps |
| Agent Skills spec coordination | Not Started | TBD | Establish communication with agentskills.io maintainers |
| Experimental findings repo | Proposed | Ola | Dedicated repo for implementations and evaluation results |
| SEP-2076 review | In Progress | Yu Yi | Skills as first-class primitive proposal |
| Registry skills.json proposal | In Progress | Ozz | Skills metadata in registry schema |
| MCP Skills Convention v0.1 | Proposed | TBD | Documented pattern (not spec) for skills over existing primitives |

## Success Criteria

- **Short-term:** Documented consensus on requirements and evaluation of existing approaches
- **Medium-term:** Clear recommendation (convention vs. protocol extension vs. both)
- **Long-term:** Interoperable skill distribution across MCP servers and clients
