# Glossary

This glossary defines working terminology for the Skills Over MCP documents. It is descriptive rather than normative: the [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) and the [Agent Skills specification](https://agentskills.io/specification) remain the source of truth for their respective formats and protocol surfaces. Definitions are intentionally short (1–3 sentences) and note alignment or divergence with Agent Skills where relevant.

## Core terms

| Term | Working definition |
| :--- | :--- |
| Skill | Structured workflow context that teaches an agent how to perform a task, usually by coordinating tools, prompts, resources, or domain knowledge. This working group uses the Agent Skills directory model as the payload format — a directory with a required `SKILL.md` file and optional supporting files — and adds discovery, transport, URI, and host-loading conventions over MCP rather than redefining the skill format. |
| Instruction | In MCP, server instructions are initialization-time guidance a server returns before any individual tool or resource is used. Skill instructions are the workflow content inside `SKILL.md` and its supporting files, usually loaded only when a specific skill is relevant. The two are not interchangeable: they differ in scope, loading lifecycle, and size constraints. |
| Primitive | An MCP protocol primitive is a named capability surface with defined messages, capabilities, and client behavior, such as Tools, Resources, or Prompts. In this repository, "primitive" should not be used loosely for any convenient implementation object; when skills reuse existing Resources, "skill" is not a new MCP primitive. |
| Resource | MCP's URI-addressed mechanism for servers to expose data or content that clients can incorporate as context. Skills Over MCP currently uses Resources as the transport fit because skills are file-like context that can be listed, read, and progressively loaded. |
| Convention | A documented, interoperable pattern that implementations can adopt without changing the MCP base protocol. Serving skill files as Resources under a `skill://` URI is a convention: implementations can adopt it while the working group gathers evidence before proposing protocol-level behavior. |
| Context | Information made available to a model or host so it can decide what to do next, especially workflow know-how exposed as resources. This is narrower than the general "LLM context window": context-as-resources focuses on addressable, selectively loadable material before it becomes model tokens, though that material eventually consumes the window. |
| Progressive disclosure | Staged loading of skill material: lightweight discovery metadata first, the full `SKILL.md` when relevant, and supporting files only when the workflow calls for them. This aligns with the Agent Skills model and maps naturally to MCP Resources, since each layer can be read on demand. |
| Control model | Describes who decides that content is visible or loaded — the host application, the user, the model, or some combination. MCP Resources are application-driven by default while tools are model-invoked once exposed; Skills Over MCP sits at this boundary, so designs need to state whether a skill is surfaced by the host, fetched through a model-readable resource tool, or both. |
| First-class primitive | A dedicated MCP protocol surface with its own methods, capability declaration, and change notifications — for skills, this would mean methods such as `skills/list` and `skills/get` plus a `notifications/skills/list_changed` notification. A resource-based convention can make skills discoverable without making them a first-class primitive; the current approach avoids this unless existing primitives prove insufficient. |
| Server author | The person or organization that ships and maintains an MCP server and controls the tools, resources, auth, update cadence, and transport behavior it exposes. A server author may also author skills, but in multi-server or ecosystem scenarios they often provide only one part of the system. |
| Skill author | The person or organization that writes a skill's `SKILL.md`, examples, references, and declared assumptions. This may be the server author, a platform team, or a third party documenting how to use an existing server; the distinction matters when a skill orchestrates tools from several servers or when registry metadata suggests companion skills. |
| Discovery | Learning that a skill exists and obtaining enough metadata to decide whether it may be relevant. Fetching or reading `SKILL.md` is a separate content-loading step; conflating the two can hide important control, privacy, and performance choices, and matters most for large catalogs or servers with incomplete enumeration. |

## Distribution and ecosystem terms

| Term | Working definition |
| :--- | :--- |
| Skill resource | A skill file exposed through MCP's Resources primitive, such as `skill://git-workflow/SKILL.md` or a supporting reference file under the same skill path. The resource URI is the transport locator; the skill's semantic metadata still lives in `SKILL.md` frontmatter as defined by the Agent Skills specification. |
| `skill://` URI | A URI scheme used by several experimental implementations to identify skill resources, giving clients and servers a recognizable convention for distinguishing skills from other resource types. See [skill-uri-scheme.md](skill-uri-scheme.md). |
| Skill metadata | Structured fields that describe a skill — such as name, description, version, tags, dependencies, source, or provenance — used by clients to discover, filter, and present skills before loading full content. |
| Server-skill pairing | The pattern where an MCP server ships skills that explain how to use its own tools effectively, with skill and tools versioned and distributed together as a single unit. |
| Multi-server composition | A workflow where a skill coordinates tools from more than one MCP server, useful when a task spans services such as a database, ticketing system, and deployment platform. |
| Ephemeral availability | The property that a skill is available while its MCP server is connected, without requiring a separate permanent install on the client machine. |
| Provenance | Information about where a skill came from and which server, organization, or artifact produced it. Provenance supports trust, review, and debugging, and is closely tied to the server-author vs. skill-author distinction. |

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Open Questions](open-questions.md)
- [Approaches](approaches.md)
- [Skill URI Scheme Proposal](skill-uri-scheme.md)
