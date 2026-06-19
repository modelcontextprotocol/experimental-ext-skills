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
- Servers SHOULD expose a well-known `skill://index.json` resource enumerating the skills they serve (following the [Agent Skills well-known URI index](https://agentskills.io/well-known-uri) format), but MAY decline or expose only a partial index when the catalog is large, generated on demand, or otherwise unenumerable; hosts MUST NOT treat an absent or empty index as proof a server has no skills. The index MAY include parameterized template entries for servers that also register matching MCP resource templates (a user-facing discovery mechanism via the completion API).
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

---

### 2026-04-19: Filesystem is a host-side implementation detail

**Status:** Accepted

**Context:** Previous meetings surfaced an open question: whether the Skills Extension SEP should require, forbid, or remain silent on a local filesystem as a host capability. The SEP as drafted is de facto filesystem-agnostic (resources are URI-addressable, `read_resource` is the recommended loading path) but does not state this as a normative requirement, leaving skill authors without a portability guarantee and hosts without clear scope.

**Decision:** The Skills Extension SEP treats the filesystem as a host-side implementation detail. Specifically:

- A skill served over MCP MUST function correctly on hosts that have no access to a local filesystem. Skill content, supporting files, and relative-path resolution MUST be expressible entirely through MCP resource operations.
- Hosts MAY materialize skill resources into a local filesystem as a performance or compatibility optimization.
- Regardless of materialization strategy, relative-path resolution within a skill MUST produce the same result as URI-based resolution. A skill that references `references/guide.md` from its `SKILL.md` resolves to the same content whether the host loads it from disk or from `resources/read` on the originating server.

**Rationale:** The value of filesystem-agnosticism is a consumer-side guarantee: a skill author writes one skill and knows it will run on any conformant host, from a cloud-code CLI with disk access to a stateless remote agent. Requiring MCP-served skills to work without a filesystem preserves this guarantee. Permitting host-side materialization preserves the use cases Peter flagged on March 24 (local server example from Jake, performance optimization for large skills, filesystem-native tooling integration). Requiring unified resolution semantics closes the gap that would otherwise make materialization a behavior-divergence source. The SEP's "Hosts: Unified Treatment" section already aspires to this at SHOULD level; this ADR promotes the semantic requirement to MUST while keeping the implementation a host choice.

**References:**
- [PR #83](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/83) — companion ADR on archive distribution
- [SEP PR #69](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/69), "Hosts: Unified Treatment of Filesystem and MCP Skills" section

---

### 2026-04-19: Archives permitted as server-side packaging optimization

**Status:** Accepted

**Context:** On 2026-03-24, a commit to the Skills Extension SEP (PR #69, [`9e73838c`](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69/commits/9e73838cda478f3bba4996a06a69d3142fb0a91c)) removed `type: "archive"` from the `skill://index.json` schema with the rationale that archives do not apply when files are individually addressable. On further review, there are four costs not addressed in the original commit: asymmetry with the Agent Skills discovery RFC, which defines both `skill-md` and `archive` distribution types; loss of atomicity across multi-file skill reads; N+1 round trips for hosts that pre-materialize skills; and loss of UNIX file metadata (executable bits, symlinks) that has no representation when each file is served as an individual MCP resource.

**Decision:** Permit `type: "archive"` entries in `skill://index.json`, matching the Agent Skills discovery RFC. An archive entry's `url` points to a single resource (mime type `application/zip` or `application/x-tar`) whose content unpacks into the skill's URI namespace at `skill://<skill-path>/<file-path>`. Servers choose per-skill between individual-file and archive distribution; hosts observe an identical virtual namespace either way.

**Rationale:** The SEP is positioned as a pure transport binding that delegates format to the Agent Skills specification. Dropping a distribution type the format spec defines contradicts that framing. Reinstating archives as a server-side packaging option — rather than a client-visible mode split — preserves the "skills as virtual filesystem" model (post-unpack view is identical to individual-file distribution) while recovering atomicity and round-trip properties. The main property lost is per-file subscription granularity, which is acceptable because subscription is not currently part of the skill reading model in the SEP.

**References:**
- Commit [`9e73838c`](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69/commits/9e73838cda478f3bba4996a06a69d3142fb0a91c) — original removal, PR #69
- [Issue #61](https://github.com/modelcontextprotocol/experimental-ext-skills/issues/61) — thread weighing archive vs. individual-file distribution
- [Agent Skills discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) — upstream format source
- April 14, 2026 office hours — discussion treated archives as supported

---

### 2026-06-02: Reinstate the `digest` field in `skill://index.json`

**Status:** Accepted

**Context:** SEP-2640's `skill://index.json` binding follows the [Agent Skills well-known discovery index](https://github.com/agentskills/agentskills/pull/254) with two stated differences — the `url` field carries a full MCP resource URI, and the per-entry `digest` field is omitted "(integrity is the transport's concern over an authenticated MCP connection)" — plus one MCP-specific addition, the `mcp-resource-template` `type` value. In the upstream index each skill entry carries a `digest` (a `sha256:<hex>` content hash) serving two purposes: (1) integrity — letting an index host attest that a served skill matches what the index advertised, which matters when the index and the skill artifacts live on different hosts (e.g., index on one domain, archives on a CDN); and (2) caching — a client stores the digest, refetches only the index, and skips refetching unchanged skill content, which can run to tens of MB. The same trade-off was argued upstream on [agentskills#254](https://github.com/agentskills/agentskills/pull/254), where Peter Alexander questioned the digest's value over HTTP (standard HTTP caching could cover it) and Jonathan Hefner defended it on cross-domain integrity and lockstep-consistency grounds. Over MCP, purpose (1) does not apply, since the same server serves both the index and the skill resources; and the cleaner long-term answer to (2) — a general resource-freshness mechanism (resource metadata or ETags) — does not exist in the base protocol today. The omission was revisited in the June 2, 2026 Working Session and in the [#skills-over-mcp-wg](https://discord.com/channels/1358869848138059966/1464745826629976084) Discord channel, where the group converged on putting `digest` back.

**Decision:** Reinstate the per-entry `digest` field in `skill://index.json`, matching the upstream Agent Skills discovery index (a `sha256:<hex>` content hash). The SEP's index-format description and field table are updated to add `skills[].digest`. With this change, the binding's only remaining divergences from the upstream index format are the `url` field's MCP-resource-URI semantics and the MCP-specific `mcp-resource-template` `type` value; `digest` and `archive` both align with upstream.

**Rationale:** Caching is the practical driver. Absent a resource-level freshness mechanism in the current spec, the index digest is the client's primary signal for whether cached skill content is still current; skill payloads are large enough that blindly refetching on every index poll is wasteful. Notably, the caching argument that was marginal over HTTP — where we resisted the digest because standard HTTP caching already exists — is the one that carries the decision over MCP, precisely because MCP has no equivalent caching layer or `resources/metadata`/ETag facility yet. The digest may become redundant once the protocol grows such a facility, at which point this binding can defer to it; but omitting it now leaves clients with no freshness signal within the reading model this SEP defines, a near-term cost too large to accept for the sake of avoiding an eventual redundancy. A secondary benefit raised in discussion is tamper and drift detection: a client can compare the advertised digest against cached content and warn the user when a skill has changed — including the case where an agent has modified skill content locally — for example on a `/skills list` view. A further consideration, raised by Jonathan Hefner in both the upstream thread and the June 2 session, is consistency across interdependent skills: when a client reads the index and then fetches several skills in sequence, a digest lets it detect content shifting underneath it mid-fetch and retry. The original integrity argument for *omitting* the field still holds — integrity is not the digest's job over a single authenticated connection — but integrity was never the reason to *include* it; caching is. Finally, reinstating the field realigns the binding with the upstream discovery format, consistent with the SEP's framing as a transport binding that delegates format to agentskills.io — the same principle the SEP already invokes to permit `archive` distribution (see the related decision below).

**References:**
- [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) — Skills Extension; canonical text on the `sep/skills-extension` branch. The "Enumeration via `skill://index.json`" section currently states `digest` is omitted and the index field table has no `digest` row — both to be updated.
- [agentskills/agentskills#254](https://github.com/agentskills/agentskills/pull/254) — upstream Agent Skills well-known discovery index defining the per-entry `digest` (`sha256:<hex>`) for integrity and caching; includes the Peter Alexander / Jonathan Hefner thread weighing the same trade-off over HTTP.
- [Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) — Cloudflare provenance for the index format and SHA-256 digests.
- [Meeting Notes — Skills Over MCP WG](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg) — June 2, 2026 Working Session.
- [#skills-over-mcp-wg Discord](https://discord.com/channels/1358869848138059966/1464745826629976084) — latest digest reinstatement thread.

---

### 2026-06-05: Decouple the index schema from `.well-known`; keep it a file with verbatim frontmatter and per-skill archives

**Status:** Proposed

**Context:** SEP-2640's index was originally specified as the [Agent Skills `.well-known` discovery index](https://github.com/agentskills/agentskills/pull/254) with a few MCP-specific differences (see 2026-06-02), so that a client consuming the HTTP `.well-known` index could consume `skill://index.json` with the same code. Peter Alexander reported being unable to confirm that the upstream `.well-known` agent-skills discovery spec will land: it has implementations in the wild but no governance momentum into the agentskills.io spec itself. Binding the SEP's index to a stalled upstream blocks progress, so the thread converged on defining the WG's own schema.

**Decision:**

- **Decouple the index schema from the `.well-known` discovery format.** The WG defines its own `skill://index.json` schema rather than mirroring upstream; alignment with `.well-known` is no longer a design constraint.
- **Keep the index as a file resource; do not elevate to a `skills/list` protocol method.** Elevation was considered — the principal motivation for a file had been matching `.well-known`, now removed — and set aside.
- **Each skill entry carries `url`, `digest`, a `frontmatter` object, and an `archives` array:**
  - `frontmatter` is a *full, verbatim copy* of the skill's `SKILL.md` frontmatter. The schema designates no specific fields and neither includes nor excludes any — it is the whole block.
  - `archives` is a list of `{ url, mediaType, digest }`, each describing one archive representation of the skill (e.g. `application/gzip`, `application/zip`).
- **Archives move from separate `type: "archive"` index entries (see 2026-04-19) to the per-skill `archives` array.** This amends the representation in that decision; archives remain a server-side packaging option, now expressed as a property of the skill rather than a sibling entry.

**Rationale:**

- *Decoupling.* The upstream `.well-known` format has real implementations but is not progressing through agentskills.io governance, and the SEP cannot wait on it; owning the schema unblocks the WG. The cost is divergence from a format that has consumers, so the schema should stay close enough to re-converge if upstream revives — but the hard dependency is removed. This retires the "mirror/realign with upstream" rationale that the 2026-04-19 (archives) and 2026-06-02 (digest) decisions invoked. Both still stand on their own merits — archives for dual-format distribution, digest for caching and cross-fetch consistency — but neither is justified by upstream alignment any longer.
- *File over method.* A `skills/list` method would make "skill" a named concept in the protocol, which conflicts with the skills-as-files philosophy of the SEP and of skills themselves. The capabilities a method would add — enumeration, pagination, change notification — are already available from resource improvements (a directory-style listing and `resources/list_changed`), so a method adds primitive surface without a matching gain. Keeping a file also leaves the index free to advertise non-skill entry types (e.g. primitive groups) as a progressive-discovery entry point later; that flexibility is a side effect of decoupling, explicitly not an in-scope expansion here.
- *Verbatim frontmatter.* `name` and `description` live in the frontmatter per the [Agent Skills spec](https://agentskills.io/specification#frontmatter); promoting them to top-level entry properties would require special-case logic to avoid duplicating them and would invite recurring debate over which fields belong in the index. Copying the full frontmatter block verbatim avoids both, keeps the index's skill semantics pinned to the agent-skills spec (no drift), and automatically covers client-side compatibility filtering (raised by Bloomberg): `compatibility`, `metadata`, and any other fields arrive by definition rather than being individually whitelisted.
- *Archives as a per-skill array.* Expressing archives as a property of the skill, rather than as separate entries, resolves the "archive + `SKILL.md` simultaneously" item without duplicating `name`/`description`/frontmatter across two entries, and lets a server offer several formats, each with its own `mediaType` and `digest`. Per-archive `digest` mirrors the entry-level digest's caching/consistency role for each packaged form.

**References:**

- [#skills-over-mcp-wg Discord](https://discord.com/channels/1358869848138059966/1464745826629976084) — index-schema thread, 2026-06-04/05 (Peter Alexander, Ola Hungerford, Sam Kothari).

---

### 2026-06-09: Directory enumeration via a dedicated `resources/directory/read` method

**Status:** Proposed

**Context:** A skill is a directory of files, and hosts that materialize a skill (or otherwise walk its contents) need to enumerate the files under a skill root without already knowing every URI. An earlier SEP draft did this with a scoped `resources/list(uri="skill://…")` call, but the base MCP spec does not guarantee scoped `resources/list`, leaving this extension with a protocol dependency it could not rely on (the SEP's "Why an Index Resource Rather Than `resources/list`?" section records the move away from that approach). The 2026-06-02 Working Session listed "try to get `resources/list(uri)` into the protocol" as an action item; the MCP core maintainer (dsp) was on board, leaving the WG to spec the mechanism. The design was worked out over the following week in the SEP feedback thread and landed in [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) on 2026-06-09.

**Decision:** Add a dedicated `resources/directory/read` method to the protocol for listing the children of a directory-like resource:

- Directories are identified by `mimeType` `inode/directory`.
- `resources/directory/read(uri)` returns a **paginated list of `Resource`** — the same response shape as `resources/list` (cursor-based pagination included). It returns **metadata only** (each child's `uri`, `name`, `title`, `mimeType`, etc.), **not** the contents of the children — equivalent to `ls`, not a recursive read.
- Calling `resources/directory/read` on a non-directory resource is an error.
- The method name is plural-`resources/`, consistent with the existing `resources/read` and `resources/list` (an earlier `resource/directory/read` spelling was a typo).
- This is introduced as a skills-extension-scoped capability for now; if it works well, the WG expects to promote it to core MCP and may add further directory verbs in a later spec version.

**Rationale:** The WG considered three options and rejected the two that overload existing verbs:

1. *Make `resources/read` return a child listing when the target is a directory.* Rejected: it would give `resources/read` a result schema that varies by `mimeType`, which risks breaking backward compatibility for clients already calling `resources/read` on URIs that are now classified as directories.
2. *Give `resources/list` an optional `uri`/subpath parameter.* This was the least-effort option for clients (Sam Kothari's preference) and was seriously weighed. Rejected: `resources/list` with and without a `uri` would carry different semantics — with no argument it returns *everything* the server exposes, which is a confusing thing to overload a scoping parameter onto. A dedicated verb keeps each method's contract single-meaning.
3. *A new `resources/directory/read` verb* (chosen): a distinct method with a stable, single result schema (reusing the `resources/list` response type, so no new shape to learn), a clear error on misuse, and no change to the semantics of any existing call. Peter Alexander proposed and specced this form (coordinating the protocol change with MCP core); Sam Kothari confirmed it solves the materialization/enumeration use case ("sgtm") and had no objection to the dedicated verb once the overloading trade-offs were laid out.

Returning metadata-only (URIs + descriptive fields, no contents) keeps the call cheap and `ls`-like, letting a host walk a skill tree and decide what to fetch via `resources/read`, rather than forcing the server to inline potentially large file contents. Tying directory-ness to the standard `inode/directory` `mimeType` reuses an existing convention instead of inventing a flag.

**References:**
- [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) — Skills Extension; `resources/directory/read` added in [commit `2e04c48`](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640/changes/2e04c48da90224000e750ffd54a3611f2824fbc0) (2026-06-09).
- [#skills-over-mcp-wg Discord](https://discord.com/channels/1358869848138059966/1464745826629976084) — directory-read design thread, 2026-06-04 through 2026-06-09 (Peter Alexander, Sam Kothari, Ola Hungerford).
- [Meeting Notes — Skills Over MCP WG](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/categories/meeting-notes-skills-over-mcp-wg) — June 2, 2026 Working Session (action item: get `resources/list(uri)` into the protocol).
- SEP draft, "Why an Index Resource Rather Than `resources/list`?" — records the earlier scoped-`resources/list` approach this method supersedes for directory enumeration.
