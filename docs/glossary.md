# Glossary

> Working terminology for the Skills Over MCP Working Group. These definitions
> describe how this repository uses the terms; they do not replace the MCP
> specification or the Agent Skills specification.

## Skill

A skill is structured instructional content that teaches an agent how to perform
a workflow, often by coordinating tools, prompts, resources, or domain-specific
knowledge. This repository uses the Agent Skills specification as the payload
format: a skill is a directory with a required `SKILL.md` file and optional
supporting files. The working group focuses on how those skills can be
discovered and served through MCP.

## Instruction

In MCP, server instructions are guidance returned by a server during
initialization and are available before any individual tool or resource is used.
Skill instructions are workflow content inside `SKILL.md` and its supporting
files, usually loaded only when a specific skill is relevant. Discussions should
avoid treating these as interchangeable because they have different lifecycles
and loading behavior.

## Primitive

An MCP primitive is a protocol-level building block such as tools, resources, or
prompts. In this repository, "primitive" should not mean any convenient
implementation object; when a document uses the protocol sense, it refers to a
surface with defined MCP messages, capabilities, and client behavior.

## Convention

A convention is a documented recommended pattern that works with existing MCP
primitives without changing the base protocol. For example, serving skill files
as resources under a `skill://` URI is a convention: implementations can adopt
it while the working group gathers evidence before proposing or revising
protocol-level behavior.

## Context

Context is information made available to a model or host so it can decide what
to do next. In "skills as context" or "context-as-resources," the skill is
loaded as information, not invoked as a protocol method. This is separate from
the general "context window" limit, though progressive loading matters because
the loaded content eventually consumes that window.

## Progressive Disclosure

Progressive disclosure means loading only the skill information needed at each
stage: discovery metadata first, the main `SKILL.md` when relevant, and
supporting files only if the workflow calls for them. This aligns with the Agent
Skills model and maps naturally to MCP resources because each file can be read
on demand.

## Control Model

The control model describes who decides that content is visible or loaded:
the host application, the user, or the model. MCP resources are commonly treated
as application-controlled, while tools are model-invoked after the host exposes
them. Skills over MCP sits at this boundary, so designs need to say whether a
skill is surfaced by the host, fetched by a model-readable resource tool, or
both.

## First-Class Primitive

A first-class primitive is a dedicated MCP protocol surface with its own methods,
capability declaration, and change notifications. For skills, this would mean
methods such as `skills/list` and `skills/get`, plus a
`notifications/skills/list_changed` notification. A resource-based convention can
make skills discoverable without making them a first-class primitive.

## Server Author

A server author builds or maintains the MCP server that exposes tools, resources,
prompts, instructions, and transport behavior. The server author may also ship
skills, but that is not required. Keeping this role separate helps with
provenance, permissions, and registry design.

## Skill Author

A skill author writes the workflow instructions and supporting files for a
skill. The skill author may be the same person as the server author, a platform
team, or a third party documenting how to use an existing server. This distinction
matters when a skill orchestrates tools from several servers or when registry
metadata suggests companion skills.

## Discovery

Discovery means finding that a skill exists and learning enough metadata to
decide whether it might be relevant. Fetching content is a separate operation:
after discovery, the client or model still needs to read `SKILL.md` and any
supporting files. This distinction matters for large catalogs, generated skills,
and servers where enumeration is incomplete or unavailable.

## Skill Resource

A skill resource is a skill file exposed through MCP's Resources primitive, such
as `skill://git-workflow/SKILL.md` or a supporting reference file below the same
skill path. The resource URI is the transport locator; the skill's semantic
metadata still lives in `SKILL.md` frontmatter as defined by the Agent Skills
specification.

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Open Questions](open-questions.md)
- [Approaches](approaches.md)
- [Skill URI Scheme Proposal](skill-uri-scheme.md)
