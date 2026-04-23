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

### 2026-04-16: URI scheme conventions for skills as resources

**Status:** Accepted

**Context:** Several independent MCP implementations (FastMCP 3.0, NimbleBrain, skilljack-mcp, skills-over-mcp, etc.) had converged on using Resources to represent skills using either `skill://` or domain-specific URI schemes, but diverged on the rest of the URI structure. This included variations around whether to use an authority segment, whether `SKILL.md` is explicit in the URI, how to address sub-resources, and how the URI path relates to the skill's frontmatter `name`. A survey of these patterns was published in [`skill-uri-scheme.md`](skill-uri-scheme.md) and informed the draft [Skills Extension SEP (#69)](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69). The path↔name relationship went through two drafts before settling: the first required a single path segment equal to the `name`, which broke for servers needing hierarchy (e.g., `acme/billing/refunds` vs. `acme/support/refunds`); a second draft fully decoupled path from `name`, which was too loose — a URI like `skill://a/b/c/SKILL.md` revealed nothing about what the skill was called without a frontmatter round trip.

**Decision:** Adopt `skill://<skill-path>/SKILL.md` as the recommended URI convention for skill resources over MCP, with:

- The first path segment occupies the authority position by RFC 3986 mechanics but carries no special semantics — clients MUST NOT resolve it as a network host.
- `SKILL.md` MUST be explicit in the URI, mirroring the Agent Skills spec's directory model.
- `<skill-path>` is one or more `/`-separated segments. Its **final segment MUST equal the skill's `name`** as declared in `SKILL.md` frontmatter (matching the Agent Skills spec's requirement that `name` match the parent directory). Preceding segments, if any, are a server-chosen organizational prefix (by domain, team, version, or any other axis).
- No-nesting constraint: a `SKILL.md` MUST NOT appear in any descendant directory of a skill.
- Sub-resources are addressed by path relative to the skill directory (e.g., `skill://<skill-path>/references/GUIDE.md`).
- Servers MAY serve skills under a domain-specific URI scheme (e.g., `github://owner/repo/skills/refunds/SKILL.md`) instead of `skill://`, provided each such skill is listed in the server's `skill://index.json`. The structural constraints above apply regardless of scheme.
- Enumeration via a well-known `skill://index.json` resource is OPTIONAL; hosts MUST NOT treat an absent or empty index as proof that a server has no skills. Resource templates are OPTIONAL and primarily a user-facing discovery mechanism via MCP's completion API.
- Versioning in URIs is deferred and implicitly tied to server version.

**Rationale:** `skill://` convergence across independent implementations is a strong signal worth codifying. Keeping `SKILL.md` explicit preserves alignment with the Agent Skills spec's directory model. Constraining the final path segment to equal `name` — while allowing a prefix — is the key settlement: it enables hierarchical organization (fixing the single-segment rule's collision problem) while keeping the skill's identity readable from the URI alone (fixing the fully-decoupled draft's opacity problem). Allowing domain-specific schemes accommodates servers whose natural URI space already carries organizational meaning, without forcing a rewrite into `skill://`. Making enumeration optional accommodates servers with large, generated, or unenumerable skill catalogs. The decision was discussed in office hours and async in Discord and held open as [PR #70](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/70) from 2026-03-18 through 2026-04-16.

**References:**
- [PR #70](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/70) — URI scheme refinements (merged 2026-04-16)
- [Issue #44](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/44) — URI scheme discussion
- [Draft Skills Extension SEP (#69)](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)
- [Skill URI Scheme Proposal](skill-uri-scheme.md)

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
