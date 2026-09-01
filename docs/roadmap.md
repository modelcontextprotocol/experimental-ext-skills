# Skills Over MCP Working Group Roadmap

> **Snapshot as of 2026-08-19**, moved here from the Google Doc so it can be commented on and referenced alongside the rest of the repo. Charter will also be updated here: [modelcontextprotocol.io/community/working-groups/skills-over-mcp](https://modelcontextprotocol.io/community/working-groups/skills-over-mcp).

1. Release the v1 extension including SDK support and documentation. (Core maintainer voting on SEP is open until 9/1/26).

2. Identify which gaps need to be addressed outside of the WG and who is carrying those forward, including:

   1. Progressive Discovery for MCP primitives
   2. Remote/local parity for files and resources
   3. Agent Skills spec: formalizing common metadata fields being used to identify skill dependencies, versioning, etc.
   4. MCP Content Annotations are called out in the spec but not commonly supported
   5. How do we know if a skill was actually used? Is this an Observability topic rather than a Skills problem? If yes, will there be an Observability WG/IG to house this topic going forward? See [Skill usage observability](#skill-usage-observability) below.

3. Transition the WG back to an Interest Group and keep the channel(s) open for followup discussions and support. Depending on adoption, feedback, and what other working groups cover, we may reconvene for a v2 after revisiting the charter, formal membership, etc.

## Skill usage observability

Expanding item 2.5 based on meeting notes, SEP threads, and Discord.  Status of the external groups will drift, so please refer to those groups' notes and channels for the latest status where applicable.

### Observability WG status

An Observability WG was proposed in `#wg-ig-group-creation` on 2026-04-13 by Sankara Avula (Galileo), with facilitators from Galileo and Arcade, scoped to server-to-client telemetry passback starting from SEP-2448. As of 2026-08-31 the WG has not yet been formalized and supported by a core maintainer.

Aditya posted the concrete shape in the same channel: a thin set of client-to-server lifecycle events (`listed`, `dropped`, `selected`, `completed`, `timed_out`) with structured reasons, naming the skills cases directly: was the skill ever used, was it dropped or ignored, is the description causing the right behavior.

### Adjacent SEPs

[SEP-414](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/414) (merged) documents the convention for carrying W3C trace context — `traceparent`, `tracestate`, `baggage` — in `_meta`, exempting those keys from DNS prefixing so traces do not break. In practice that is request-direction propagation into the server. [SEP-2448](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2448) carries server execution spans back to the client in `_meta.otel`; after review it was reworked into an Extensions Track proposal under SEP-2133.

### Suggested split

- **Attribution primitives stay with this WG.** Does the extension guarantee a stable skill identity a harness can attribute against, surviving caching, name collisions, and the same skill installed from more than one server? Candidate for a [decision log](decisions.md) entry.
- **Client-to-server usage reporting needs a home.** Applies to tools and resources identically, so it does not belong in the skills extension.
