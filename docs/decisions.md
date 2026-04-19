# Decision Log

This document records significant decisions made by the Skills Over MCP Working Group, using an ADR-lite (Architecture Decision Record) format. It serves as a transparent, auditable trace of the group's reasoning over time.

For background on the ADR format, see [adr.github.io](https://adr.github.io/).

---

### 2026-02-14: Skills served over MCP use the instructor format

**Status:** Accepted

**Context:** The inaugural meeting surfaced a key distinction between two models: skills-as-instructors (structured markdown content served to agents) and skills-as-helpers (scripts/code that execute locally). The group needed to decide which model to prioritize for skills served over MCP. Subsequent discussion in Discord and the Feb 26 office hours broadened the scope beyond "teaching agents to use tools" specifically.

**Decision:** Skills served over MCP use the instructor format (structured markdown content), with the convention being agnostic about whether skills reference server tools, external tools, or general knowledge. The helper model (executing arbitrary local code) is out of scope for MCP-served skills.

**Rationale:** Helper-style skills that require local code execution already have existing distribution mechanisms (repos, npx, etc.) and don't need MCP as a transport. Instructor-style skills are more portable across remote and local MCP servers, easier to security-vet (static instructional content vs. arbitrary code), and align better with MCP's role as a context protocol. Dynamically served code-execution skills were flagged as unlikely to pass security review for registry listing.

**References:**
- [Feb 13 meeting notes](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2248) (Key Decisions & Agreements)
- [Problem Statement](problem-statement.md)

---

### 2026-02-14: Keep docs as markdown in-repo rather than publish as a website

**Status:** Accepted

**Context:** The question arose whether the IG should publish docs using a solution like Mintlify or keep them as markdown files in the repository.

**Decision:** Keep documentation as markdown files in the repository.

**Rationale:** The markdown-in-repo approach is working well for the IG's current needs. It keeps the contribution barrier low (just edit markdown and submit a PR), avoids introducing additional tooling and infrastructure, and is sufficient for the group's size and documentation complexity. Can be revisited if the group grows or docs become harder to navigate.

**References:**
- [Issue #7](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/7)

---

### 2026-02-14: Reference external implementations rather than fork them

**Status:** Accepted

**Context:** The group needed to decide whether to bring external implementations (reference repos, SEPs, related projects) into this repository or link to them externally.

**Decision:** Document results from implementations in `experimental-findings.md` and link to external repos and resources in `related-work.md`, rather than forking or vendoring external code.

**Rationale:** This avoids duplication and maintenance burden, keeps the repo focused on the IG's exploratory documentation, and lets external projects evolve independently. The pattern of findings + references is working well for the group's needs.

**References:**
- [Issue #8](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/8)

---

### 2026-02-21: Coordinate with Agent Skills spec via their Discussions

**Status:** Accepted

**Context:** The IG needed a communication channel with the [Agent Skills spec](https://agentskills.io/) maintainers to align on proposals, share findings, and avoid divergence. The spec repo initially had no contributing guide.

**Decision:** Use [Discussions in the agentskills/agentskills repo](https://github.com/agentskills/agentskills/discussions) as the primary channel for topics that intersect both groups.

**Rationale:** The Agent Skills spec maintainers established a [contributing guide](https://github.com/agentskills/agentskills/blob/main/CONTRIBUTING.md) directing public discussion to their Discussions area. Using their preferred channel respects their governance model and provides a single, visible place for cross-project coordination rather than fragmenting discussion across Discord, GitHub Issues, and other venues.

**References:**
- [Issue #12](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/12)
- [PR #28](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/28)
- [Agent Skills contributing guide](https://github.com/agentskills/agentskills/blob/main/CONTRIBUTING.md)

---

### 2026-02-21: Add skills-as-resources as an explored approach

**Status:** Accepted

**Context:** Community input (via [Issue #14](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/14)) argued that MCP Resources are a natural fit for serving skill content, and that adding a new primitive when an existing one could work would add unnecessary complexity to the ecosystem.

**Decision:** Incorporate skills-as-resources as an explicit approach in the IG's exploration, updating Approach 3 from "Skills as Tools" to "Skills as Tools and/or Resources" and adding design principles around minimizing ecosystem complexity.

**Rationale:** Resources already have URI-based addressability, existing tooling for fetching, and a subscription model for updates. Using existing primitives rather than introducing new ones reduces ecosystem complexity -- a concern the community has vocally raised. The `skill://` URI scheme also gives skills a natural way to reference each other.

**References:**
- [Issue #14](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/14)
- [PR #17](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/17)
- [Approaches doc](approaches.md)

---

### 2026-02-26: Prioritize skills-as-resources with client helper tools

**Status:** Accepted

**Context:** The Feb 26 office hours discussed the skills-as-resources reference implementation ([PR #16](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/16)) and whether the group should focus on workarounds for today's clients or the ideal client-supported approach.

**Decision:** Focus on the skills-as-resources approach using client helper tools (e.g., a built-in `read_resource` tool on the client side and an SDK-level `list_skill_uris()` method). Workaround implementations (e.g., skills in tool descriptions) remain in the repo as comparison baselines but are clearly separated in intent.

**Rationale:** Rather than having each server ship its own `load_skill` tool, clients should support model-driven resource loading directly. This is a relatively small lift for clients (compared to features like elicitation or sampling) and avoids duplicate approaches across servers. Experimental SDK changes will allow clients and models to load skill resources more consistently, which could also unlock other Resource use cases beyond skills. The plan is to partner with client implementors to test once the extension is ready.

**References:**
- [Feb 26 office hours notes](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2316) (Section 1)
- [PR #16](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/16)

---

### 2026-03-16: `_meta` is for MCP-transport-specific concerns, not skill-level semantics

**Status:** Accepted

**Context:** [PR #60](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/60) initially proposed recommended `_meta` keys that mapped Agent Skills frontmatter fields (version, invocation, allowed-tools) into MCP resource `_meta` as a "materialized view." Review feedback raised several concerns: this duplicates what frontmatter already expresses, the optimization of avoiding content fetches is premature (clients cache locally), and adding it now is harder to remove later. Further discussion identified that even MCP-specific candidates like provenance and dependencies may be better addressed at the plugin/distribution layer.

**Decision:** `_meta` on skill resources is reserved for metadata that is specific to the MCP transport context and has no natural home in frontmatter, `annotations`, Resource fields, or the distribution layer. Skill-level semantics (version, invocation mode, allowed tools, compatibility) remain in frontmatter. The `io.modelcontextprotocol.skills/` namespace is established for any future standardized keys. No specific keys are recommended at this time.

**Rationale:** The general razor is: "does this metadata also apply to non-MCP skills? If so, it should go in frontmatter." This avoids fragmenting skill metadata across transport mechanisms, keeps `_meta` lightweight for clients that optimize for lean metadata reads, and defers standardization of specific keys until there is clear implementation experience showing that frontmatter and the distribution layer are insufficient.

**References:**
- [PR #60](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/60)
- [Issue #55](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/55)
- [Discord discussion](https://discord.com/channels/1358869848138059966/1482008994062274610)
- [Using `_meta` for Skill Resources](skill-meta-keys.md)

---

### 2026-04-16: Convert Skills Over MCP from Interest Group to Working Group

**Status:** [Accepted by Core Maintainers](https://discord.com/channels/1358869848138059966/1464745826629976084/1494774410891231352)

**Context:** The group formed as an Interest Group on 2026-02-01 to explore skills distribution over MCP. Over the following weeks the work moved beyond problem-framing into concrete deliverables including the Skills Extension SEP (Extensions Track). Per MCP [group governance](https://modelcontextprotocol.io/community/working-interest-groups), Interest Groups focus on "identifying problems worth solving" and produce non-binding recommendations, while Working Groups "collaborate on a SEP, a series of related SEPs, or an officially endorsed project" and make binding decisions. The group's output had crossed that boundary.

**Decision:** Convert to a Working Group. The group retains its existing scope (skills discovery, distribution, and consumption through MCP) and charter location, now governed by WG rules: lazy consensus → formal vote → escalation, with WG Leads holding autonomous authority over meeting logistics, proposal prioritization, and in-scope SEP triage. Spec changes require WG consensus plus Core Maintainer approval.

**Rationale:** The group was already doing WG work — shepherding SEPs, building reference implementations, and coordinating cross-WG concerns — without the matching authority structure. Aligning form with function lets the group own SEP decisions in its scope (rather than routing recommendations through other WGs), formalizes the two-Lead model already in practice, and makes responsibilities explicit under the governance doc.

**References:**
- [PR #2586](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2586) — charter conversion (merged 2026-04-16)
- [Charter](https://modelcontextprotocol.io/community/skills-over-mcp/charter)
- [Group governance](https://modelcontextprotocol.io/community/working-interest-groups)

---

### 2026-04-19: Filesystem is a host-side implementation detail

**Status:** Proposed

**Context:** Previous meetings surfaced an open question: whether the Skills Extension SEP should require, forbid, or remain silent on a local filesystem as a host capability. The SEP as drafted is de facto filesystem-agnostic (resources are URI-addressable, `read_resource` is the recommended loading path) but does not state this as a normative requirement, leaving skill authors without a portability guarantee and hosts without clear scope.

**Decision:** The Skills Extension SEP treats the filesystem as a host-side implementation detail. Specifically:

- A skill served over MCP MUST function correctly on hosts that have no access to a local filesystem. Skill content, supporting files, and relative-path resolution MUST be expressible entirely through MCP resource operations.
- Hosts MAY materialize skill resources into a local filesystem as a performance or compatibility optimization.
- Regardless of materialization strategy, relative-path resolution within a skill MUST produce the same result as URI-based resolution. A skill that references `references/guide.md` from its `SKILL.md` resolves to the same content whether the host loads it from disk or from `resources/read` on the originating server.

**Rationale:** The value of filesystem-agnosticism is a consumer-side guarantee: a skill author writes one skill and knows it will run on any conformant host, from a cloud-code CLI with disk access to a stateless remote agent. Requiring MCP-served skills to work without a filesystem preserves this guarantee. Permitting host-side materialization preserves the use cases Peter flagged on March 24 (local server example from Jake, performance optimization for large skills, filesystem-native tooling integration). Requiring unified resolution semantics closes the gap that would otherwise make materialization a behavior-divergence source. The SEP's "Hosts: Unified Treatment" section already aspires to this at SHOULD level; this ADR promotes the semantic requirement to MUST while keeping the implementation a host choice.

**References:**
- [PR #83](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/83) — companion ADR on archive distribution
- [SEP PR #69](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/69), "Hosts: Unified Treatment of Filesystem and MCP Skills" section
