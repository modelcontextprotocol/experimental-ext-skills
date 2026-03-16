# Why Skills Over MCP?

> The value proposition for distributing agent skills through MCP, and a guide for when it applies.

## The Gap Between Tools and Know-How

MCP servers give agents access to tools. But tools alone are insufficient for complex workflows — tool descriptions tell an agent *what* a tool does, not *how to orchestrate* multiple tools together to achieve a goal. Skills bridge this gap. They are the structured "how-to" knowledge that makes tools useful: multi-step workflows, conditional logic, domain-specific patterns, and orchestration instructions that can run to hundreds of lines.

Skills are *context*, and MCP is a *context protocol*. This Interest Group isn't looking for problems to solve with the MCP hammer. The question is narrower and more practical: agents already connect to remote services over MCP to get tools — can they get the know-how to use those tools through the same channel?

The answer matters because skills and tools are often tightly coupled. A server that provides graph-building tools is hard to use without 875 lines of orchestration instructions. A server exposing Airflow APIs needs version-specific guidance to avoid suggesting deprecated patterns. One workaround is wrapping each MCP server in a custom sub-agent with hand-written instructions — but this means independently reinventing the same orchestration guidance for the same servers. Skills over MCP makes those instructions portable and shareable: the server author ships them once, and every user benefits. See [problem-statement.md](problem-statement.md) for the full gap analysis.

## What MCP Adds

### Same Channel, No Separate Install

MCP is already the protocol agents use to connect to remote services. When skills travel the same channel as tools, there is no separate install path — no git clone, no file download, no filesystem access required on the client side. The skill is present while the server is connected and gone when it disconnects.

This is especially relevant for **remote agent skill integration**. A remote MCP server can serve both its tools and the instructions for using them together, as a single atomic unit. An agent connecting to a remote server gets everything it needs to operate — tools *and* know-how — without the user managing separate artifacts.

> "Skills living as `skill://` resources on the server itself was the natural endpoint of that consolidation. The skill context is colocated with the tools it describes, versioned together, shipped together." — [Mat Goldsborough](https://github.com/mgoldsborough) (NimbleBrain)

See [NimbleBrain findings](experimental-findings.md#nimblebrain-skill-resource-consolidation) for production validation of this pattern.

### Discovery Where It Belongs

Users installing MCP servers from a registry today don't know if there's a companion skill they should also install. Skills over MCP creates a natural discovery path: connect to a server, discover its skills through the same interface. No separate search, no documentation hunting, no hoping someone mentioned the skill in a README.

See [Use Case 5: Server-Skill Pairing](use-cases.md#5-server-skill-pairing) for examples including Anthropic's [chrome-devtools-mcp](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-servers/chrome-devtools-mcp), which ships a `skills/` folder that requires a separate install path from the server itself.

### Dynamic Updates Without Reinstall

Skills served over MCP can be updated server-side. The agent receives current instructions every time it reads the resource, without users needing to re-download, update versions, or re-initialize. This is particularly valuable for rapidly evolving platforms where guidance changes frequently.

See [Use Case 6: Skill Versioning and Updates](use-cases.md#6-skill-versioning-and-updates).

### Built-in Control Model

MCP defines app, human, and assistant roles. This gives skills a built-in framework for *who sees the content* and *who decides when it loads* — model-controlled (the agent decides to read a skill) vs. application-controlled (the host app presents it). File-based distribution has no equivalent; the control model is ad hoc and varies by host application.

See [Open Question 9](open-questions.md#9-who-gets-visibility-into-skill-content-and-who-decides-when-it-gets-loaded) for the ongoing discussion.

### Multi-Server Composition

Skills that orchestrate tools from multiple servers need a transport that already connects to all of them. MCP is that transport. A skill can reference tools from any connected server without being coupled to any single server's instruction set — enabling workflows that span databases, APIs, and cloud services in a single set of instructions.

See [Use Case 3: Multi-Server Composition](use-cases.md#3-multi-server-composition).

### Enterprise and Commercial Distribution

RBAC, audit logging, multi-tenant skill serving, version-adaptive content — these are capabilities MCP servers already support. Skills over MCP inherits this infrastructure rather than rebuilding it. An enterprise can serve different skill content to different users based on role, subscription tier, or platform version, all through the same authenticated MCP connection.

See Use Cases [7](use-cases.md#7-enterprise-integration), [8](use-cases.md#8-version-adaptive-skill-content), and [9](use-cases.md#9-commercial-multi-tenant-skills) for enterprise and commercial scenarios from Apache Airflow, Astronomer, and others.

## When Skills Over MCP Makes Sense

**MCP distribution adds clear value when:**

- The skill is tightly coupled to an MCP server's tools — the server is hard to use without it
- Skills need to update without user action — server-side updates flow automatically
- Different users need different skill content — multi-tenant, RBAC, or role-based access
- The skill orchestrates tools from multiple MCP servers
- Ephemeral availability is desired — skill present while connected, no permanent footprint
- Skill content adapts dynamically based on runtime context (e.g., platform version)

**Simpler alternatives may suffice when:**

- The skill is standalone with no MCP server dependency — a file in a git repo works fine
- The skill is consumed by a single user on a single machine — local files are simpler
- The skill doesn't need dynamic content or updates — static files are easier to manage
- The organization already has skill distribution infrastructure that works

This isn't an either/or choice. Skills can exist as local files *and* be served over MCP. The question is whether MCP distribution solves a real problem for your particular use case.

## Why Not Just...?

### "Why not just files in a git repo?"

This works well for many cases and will continue to. But file-based distribution has no discovery mechanism (you have to know the repo exists), no dynamic updates (you have to re-pull), and no ephemeral availability (files persist on disk). For enterprises, git-based skill distribution raises its own trust and access-control concerns — though MCP-based distribution introduces different governance questions (allowlisting, provenance verification, runtime integrity) that are [still being worked out](open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries).

### "Why not just extend server instructions?"

Server instructions load at initialization and are limited in practical size. Complex workflows requiring hundreds of lines with conditional logic and bundled references exceed what instructions can carry. Instructions also can't be selectively loaded — it's all-or-nothing at init time.

### "Why not just bare resources without a convention?"

You *can* use bare resources. But without a shared convention, every server invents its own naming, discovery, and metadata patterns. Clients can't reliably distinguish a skill from any other resource. The `skill://` URI scheme — which [four implementations converged on independently](skill-uri-scheme.md) — gives the ecosystem a shared language.

## Learn More

- [Use Cases](use-cases.md) — 11 detailed scenarios driving this work
- [Approaches](approaches.md) — Technical approaches being explored
- [Experimental Findings](experimental-findings.md) — Results from implementations and testing
- [Open Questions](open-questions.md) — Unresolved questions with community input
