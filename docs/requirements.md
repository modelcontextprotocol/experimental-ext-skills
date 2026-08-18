# Requirements

This document extracts testable requirements from [Use Cases](use-cases.md), [Open Questions](open-questions.md), and the [Design Principles](approaches.md#design-principles). It is intended as input to the Skills Over MCP convention draft and to the evaluation matrix work.

Status values in the **Approach coverage** column are intentionally provisional; the evaluation matrix should replace them with evidence-backed approach-by-approach ratings.

## Priority tiers

| Tier | Meaning |
|---|---|
| P0 | Blocking for any useful convention |
| P1 | Important for broad interoperability or adoption |
| P2 | Desirable for advanced or domain-specific deployments |

## Use-case-derived requirements

| ID | Requirement | RFC 2119 level | Priority | Source | Approach coverage |
|---|---|---|---|---|---|
| UC-01 | Skills **MUST** support instruction sets that exceed practical `server.instructions` size limits. | MUST | P0 | [Use Case 1](use-cases.md#1-complex-workflow-orchestration) | To be evaluated |
| UC-02 | Skills **SHOULD** support conditional workflows whose relevant guidance is selected based on task context. | SHOULD | P1 | [Use Case 2](use-cases.md#2-conditional-workflows) | To be evaluated |
| UC-03 | Skills **MUST** be expressible independently of any single MCP server when a workflow composes tools from multiple servers. | MUST | P0 | [Use Case 3](use-cases.md#3-multi-server-composition) | To be evaluated |
| UC-04 | Skills **SHOULD** support declarative dependency metadata for required servers, tools, resources, prompts, or other skills. | SHOULD | P1 | [Use Case 3](use-cases.md#3-multi-server-composition) | To be evaluated |
| UC-05 | Skills **SHOULD** support progressive disclosure so clients can discover lightweight metadata before loading full content. | SHOULD | P0 | [Use Case 4](use-cases.md#4-progressive-disclosure) | To be evaluated |
| UC-06 | Clients **SHOULD NOT** be required to load every skill exposed by a server at initialization time. | SHOULD NOT | P0 | [Use Case 4](use-cases.md#4-progressive-disclosure) | To be evaluated |
| UC-07 | A convention **SHOULD** allow servers to advertise companion skills that are useful or necessary for operating the server effectively. | SHOULD | P1 | [Use Case 5](use-cases.md#5-server-skill-pairing) | To be evaluated |
| UC-08 | Skills **SHOULD** include version metadata that clients can compare when newer server-provided content is available. | SHOULD | P1 | [Use Case 6](use-cases.md#6-skill-versioning-and-updates) | To be evaluated |
| UC-09 | Organizations **SHOULD** be able to distribute official, domain-specific workflow guidance through authenticated MCP infrastructure. | SHOULD | P1 | [Use Case 7](use-cases.md#7-enterprise-integration) | To be evaluated |
| UC-10 | Skills **MAY** support version-adaptive content where returned guidance depends on the detected platform or framework version. | MAY | P2 | [Use Case 8](use-cases.md#8-version-adaptive-skill-content) | To be evaluated |
| UC-11 | Skills **MAY** support access-control and audit metadata for tenant-, role-, or subscription-specific content. | MAY | P2 | [Use Case 9](use-cases.md#9-commercial-multi-tenant-skills) | To be evaluated |
| UC-12 | Documentation-oriented MCP servers **SHOULD** support selective discovery and fetching of documentation or skill-like pages. | SHOULD | P1 | [Use Case 10](use-cases.md#10-documentation-as-mcp-server) | To be evaluated |
| UC-13 | Plugin-style distributions **SHOULD** be able to bundle skills with MCP server configuration and related local tools. | SHOULD | P2 | [Use Case 11](use-cases.md#11-skills--mcp-server-plugins) | To be evaluated |

## Open-question-derived requirements

| ID | Requirement | RFC 2119 level | Priority | Source | Approach coverage |
|---|---|---|---|---|---|
| OQ-01 | A convention **SHOULD** support both registry-adjacent discovery and server-provided discovery without requiring them to be the same mechanism. | SHOULD | P1 | [Open Question 1](open-questions.md#1-is-this-a-registry-problem-or-an-mcp-server-problem) | To be evaluated |
| OQ-02 | A convention **MUST** define what capabilities, if any, MCP-surfaced skills lack compared with directly installed first-class skills. | MUST | P1 | [Open Question 2](open-questions.md#2-how-do-first-class-skills-differ-from-skills-as-context) | To be evaluated |
| OQ-03 | A convention **SHOULD** preserve the distinction between initialization-time server instructions and load-on-demand skill content. | SHOULD | P0 | [Open Question 3](open-questions.md#3-should-serverinstructions-be-extended-for-richer-content) | To be evaluated |
| OQ-04 | Hosts **SHOULD** mediate skill dependency resolution and hide unavailable skills when required dependencies are missing. | SHOULD | P1 | [Open Question 4](open-questions.md#4-how-should-skills-relate-to-multiple-servers) | To be evaluated |
| OQ-05 | Any recommended approach **SHOULD** be testable against real client behavior, especially resource loading and model-driven use. | SHOULD | P1 | [Open Question 5](open-questions.md#5-do-clients-actually-leverage-skills-when-presented-via-mcp) | To be evaluated |
| OQ-06 | The design **SHOULD** identify which requirements are satisfied by convention alone and which would require protocol changes. | SHOULD | P1 | [Open Questions 7–8](open-questions.md#7-what-would-mcp-have-had-to-get-right-for-skills-to-have-been-shipped-over-mcp-from-the-beginning) | To be evaluated |
| OQ-07 | A convention **MUST** address who controls visibility into skill content: application, model, user, or policy. | MUST | P0 | [Open Question 9](open-questions.md#9-who-gets-visibility-into-skill-content-and-who-decides-when-it-gets-loaded) | To be evaluated |
| OQ-08 | Skills **MUST** be treated as untrusted documents; clients **MUST NOT** auto-apply them without explicit policy. | MUST / MUST NOT | P0 | [Open Question 10](open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries) | To be evaluated |
| OQ-09 | A convention **SHOULD** support both application-controlled and model-controlled access patterns when use cases require them. | SHOULD | P1 | [Open Question 11](open-questions.md#11-should-the-control-model-be-use-case-specific) | To be evaluated |
| OQ-10 | The design **SHOULD** reuse existing MCP primitives unless a clear interoperability gap requires new protocol surface. | SHOULD | P0 | [Open Question 12](open-questions.md#12-why-not-just-resources) and [Design Principles](approaches.md#design-principles) | To be evaluated |
| OQ-11 | The relationship between standalone skills and MCP-served skills **SHOULD** add clear value beyond direct file loading. | SHOULD | P1 | [Open Question 13](open-questions.md#13-what-is-the-optimal-relationship-between-skills-and-mcp) | To be evaluated |

## Evaluation-matrix inputs

The evaluation matrix can use these requirement IDs as rows. At minimum, each approach should be rated against:

- P0 requirements, because these are blocking for any convention.
- Requirements that mention control model, discovery, and dependency resolution, because those are recurring divergence points.
- Requirements with `MAY` level, because they identify advanced scenarios that should not block a minimal convention but may influence extension design.

## Open follow-ups

- Replace provisional **Approach coverage** values with ratings from the evaluation matrix.
- Decide whether P2 commercial and plugin requirements belong in the first convention milestone or in an extension roadmap.
- Cross-check these requirements against the canonical SEP-2640 text before treating them as stable working-group consensus.
