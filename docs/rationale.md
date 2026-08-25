# Rationale

This document records the design rationale for [SEP-2640: Skills Extension](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640), extracted from the canonical SEP.

## Why Resources Instead of a New Primitive?

The Working Group's [decision log](decisions.md#2026-02-26-prioritize-skills-as-resources-with-client-helper-tools) records this as settled. Skills are files; Resources exist to expose files. Reusing Resources inherits URI addressability, `resources/read`, resource subscriptions (the `resourceSubscriptions` filter on `subscriptions/listen`), and the existing client tooling for free. A new primitive would duplicate most of this and add ecosystem complexity. Using resources to describe files is also aligned with [Composability over specificity](https://modelcontextprotocol.io/community/design-principles#composability-over-specificity) and other MCP [design principles](https://modelcontextprotocol.io/community/design-principles).

[SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) originally proposed the new-primitive alternative. That approach offers cleaner capability negotiation and dedicated list-changed notifications, but at the cost of flattening skills to name-addressed blobs — losing the directory model that the Agent Skills specification defines and that supporting files depend on.

## Why `skill://<path>/<file>` With an Explicit `SKILL.md`?

Several independent implementations converged on `skill://` as the scheme without coordination — a strong signal. They diverged on structure. This SEP adopts the explicit-file form because:

- It directly mirrors the Agent Skills specification's directory model. A skill _is_ a directory; its URI space should look like one.
- `SKILL.md` being explicit means supporting files are siblings at the same level, with no special casing for "the skill URI" versus "a file in the skill."
- Hosts implementing both filesystem and MCP skills can use one path-resolution codepath.

The cost — `SKILL.md` is always typed out rather than implied — is small, and where discovery is supported the response already points clients at the right URI.

## Why Allow a Path Prefix But Constrain the Final Segment?

Earlier drafts required `<skill-path>` to be a single segment equal to the frontmatter `name`. That breaks down when a server needs hierarchy: an organization serving both `acme/billing/refunds` and `acme/support/refunds` cannot satisfy "single segment" without renaming one skill to dodge the collision. Allowing a prefix (`acme/billing/`, `acme/support/`) solves this — both skills can be named `refunds` and the prefix disambiguates.

A subsequent draft went further and fully decoupled the path from the name. That was too loose: a URI like `skill://a/b/c/SKILL.md` tells you nothing about what the skill is called until you fetch and parse frontmatter. Clients listing skills, hosts displaying them in a picker, and models reasoning over URIs all want the name visible without a round trip.

Constraining the final segment to match the frontmatter `name` gets both properties. The prefix carries the server's organizational structure; the final segment carries the skill's name; and the two together form a locator from which the name can be read directly.

## Why May the Listing Be Empty or Partial?

Requiring every server to implement a complete `skills/list` fails for at least three server shapes: a documentation server that synthesizes a skill per API endpoint (thousands), a skill gateway fronting an external index (unbounded), and a server that generates skills dynamically at read time (unenumerable by construction). For these, the list is either too large to be useful in the model's context or does not meaningfully exist.

The baseline is therefore direct readability — a skill URI is always a valid argument to `resources/read`. The method is universal but exhaustiveness is not: a server that cannot enumerate returns what it can, or nothing. A host that assumes enumeration is exhaustive will miss skills on servers where it is not, hence the requirement that hosts MUST NOT treat empty enumeration as proof of absence.

## Why `skills/get` Alongside `skills/list`?

Enumeration alone leaves two gaps, and both are integrity gaps rather than conveniences.

The first is the unlisted skill. Listings may be empty or partial by design, and the baseline hands hosts skill URIs that never appeared in one — from server instructions, another skill, or the user. Before `skills/get`, such a skill could be read but not verified: its digests existed nowhere, so it could not be content-bound — and a catalog too large to enumerate, or fronted by a gateway, serves static content whose digests were perfectly publishable, just unreachable. `skills/get` makes an entry reachable from a URI alone, so verification no longer depends on how the host happened to find the skill. Skills generated at read time remain unverifiable by construction, listed or not: they carry `"resources": "dynamic"` either way.

The second is the cost of picking up a change. A host does not need to poll for one: the approved `resources` set is what its reads are verified against, so a skill whose content has moved announces itself as a verification failure. What the host then needs is the skill's current entry — and before `skills/get`, the only way to get it was to re-enumerate the whole catalog, thousands of entries to learn the new digests of one skill. The same applies to a skill the user asks to update. Fetching one entry keeps the cost proportional to what changed.

Both are single-entry reads of a shape the listing already defines, so `skills/get` adds a method but no new schema: the `skill` object is a listing entry.

## Why a Method Instead of a Well-Known Index Resource?

An earlier revision served enumeration as a reserved resource at `skill://index.json`, read like any other resource. Replacing it with `skills/list` — same entry schema, different carrier — buys four things. Pagination: a resource is one monolithic document, while a method pages large catalogs with the same `cursor`/`nextCursor` contract as every base list method. Caching: list methods inherit the base protocol's caching attributes ([SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549)) uniformly, instead of this extension inventing a parallel freshness signal for one resource. Discoverability: support is implied by the extension declaration itself, rather than probed by reading a URI and interpreting the error. And uniformity: clients reuse the machinery they already have for `tools/list` and `resources/list`, and the `skill://` namespace no longer needs a reserved-URI carve-out for a document that was never a skill.

## Why Delegate the Format to agentskills.io?

The Agent Skills specification already defines YAML frontmatter fields, naming rules, directory conventions, and the progressive-disclosure model. It has its own governance, contributing process, and multi-vendor participation. Redefining any of this in an MCP SEP would create a second source of truth and a drift risk. This SEP is a transport binding; the payload format is someone else's concern.

## Why a Directory Read Method?

The virtual-filesystem model this SEP builds on had a read operation (`resources/read`) but no readdir. That gap is harmless while skill instructions name files explicitly, but skills routinely defer the choice to the agent — "use the template in `templates/` that matches the document type." On a filesystem the agent lists the directory; over MCP the only enumeration was `resources/list`, which is global: it returns the server's entire resource space, cannot be scoped to a subtree, and is precisely what large or generative servers — the ones whose partial listings this SEP accommodates — decline to implement. A server that cannot enumerate its catalog can still trivially enumerate one directory it is already serving.

`resources/directory/read` is the readdir analog: scoped, paginated, and composable — listings mark subdirectories with `inode/directory`, so an agent descends a skill's tree exactly as it would walk a directory locally.

Two alternatives were considered. Extending `resources/list` with a scope parameter would change a core method's semantics from inside an extension, and a URI-prefix filter misstates the model anyway — prefixes are string matching, not structure. Embedding a file manifest in `SKILL.md` or the listing was rejected as the navigation mechanism: it would freeze the listing at authoring or publication time and bloat context for skills with many files, while a method keeps listings live and on demand. The `resources` enumeration ([Resources](sep-draft-skills-extension.md#resources)) is not that manifest — it is an integrity commitment consumed by the host at verification and approval time, with no need to occupy model context, and the dynamically generated skills that need live listings most are exactly the ones that carry `"dynamic"` in its place.

Although introduced by this extension, the method is deliberately general — any directory resource qualifies, under any scheme — making it a candidate for promotion into the core Resources primitive if usage warrants.

## Why Verbatim Frontmatter in the Listing?

The listing could instead carry a curated subset of skill metadata — `name` and `description` as dedicated top-level fields. That forces a choice every time the Agent Skills frontmatter grows a field: amend this SEP to mirror it, or leave listing consumers to fetch and parse every `SKILL.md` for it. Copying the frontmatter verbatim removes the choice. The listing carries exactly what the skill author wrote; the fields hosts need for a registry (`name`, `description`) are guaranteed present because the Agent Skills specification requires them; and new frontmatter fields flow through with no change to this extension. A host builds its complete skill registry from the listing alone.

## Why Per-File Digests Instead of a Single Skill Digest?

An earlier revision carried one digest per entry, covering only `SKILL.md`. That left every supporting file unbound: a server could obtain approval for a benign skill, then rotate `references/GUIDE.md` — instructional content the model follows as readily as the skill body — while the approved digest stayed valid. Persisted approval covered the one file a user is least likely to be attacked through.

Enumerating every file covers both rotation and addition: the set is complete, so a new file is as detectable as a changed one. It also supports pinning — approval binds to the whole set, and each file is verified against it when read. That gives the consistency half of the atomic-snapshot property archive distribution ([Appendix: Deferred Features](sep-draft-skills-extension.md#appendix-deferred-features)) offered: a host can never unknowingly mix files from two versions. Unlike an archive it requires no unpacking surface, and no file is retrieved ahead of need ([Integrity and verification](sep-draft-skills-extension.md#integrity-and-verification)). The cost falls on dynamically generated skills, which cannot publish stable digests; they carry `"resources": "dynamic"` instead, and accept that hosts may decline them.

## Why Does an Enclosing Skill's Manifest Include Its Nested Skills?

An earlier revision treated a nested `SKILL.md` as a boundary: a host walking an enclosing skill stopped there rather than taking in the subtree. The shipped model treats a nested skill's files as ordinary supporting files of the enclosing skill, so they appear in both manifests ([Resources](sep-draft-skills-extension.md#resources)).

Content-bound approval binds to the `resources` set, so the set has to cover every file the skill can introduce into model context. A boundary would leave gaps in it at paths the server controls, and content in a gap could change without changing the approved set. The cost is that changing one nested skill revokes the persisted approval of every skill whose manifest encloses it.

Approval remains per skill. An enclosing skill's approval covers reading a nested `SKILL.md` as ordinary content, never activating it ([Nested skills](sep-draft-skills-extension.md#nested-skills)) — so a host does not need to detect nesting to apply the consent rule, and nothing in a listing marks the relationship.

## Why Retrieve Files Only When They Are Needed?

An earlier revision let a host fetch, verify, and cache a skill's entire `resources` set at approval time and serve every later read from that copy. That is now prohibited: no file is retrieved on connection, on listing, or at approval. `SKILL.md` is fetched when the skill is loaded and a supporting file when it is read ([Integrity and verification](sep-draft-skills-extension.md#integrity-and-verification)).

The reason is server load. A listing may be arbitrarily large — these are the same catalogs that make an empty or partial `skills/list` legitimate ([Why May the Listing Be Empty or Partial?](#why-may-the-listing-be-empty-or-partial)) — and a single portable skill can run to 512 files and 16 MiB ([Limits](sep-draft-skills-extension.md#limits)). A host that staged every skill it might use would put load on a server proportional to the catalog rather than to what a session reads, and every connecting host would repeat it. The same argument bounds the cost of deferring archives: a round trip per file scales with the files a session opens, not with the size of the skill.

Retrieving late does not weaken the integrity story. Approval binds to the entry's `resources` set, not to bytes the host holds, so a file fetched long after approval is verified against the approved set when read. What late retrieval gives up is the single verification point: staging everything at approval leaves no later read to diverge, while per-read verification keeps that window open for the session. The spec narrows it with two rules — reads resolve only to URIs in the held entry, and a disk cache is either write-isolated or re-verified on access ([Security Implications](sep-draft-skills-extension.md#security-implications)). What remains is a server returning different bytes for the same URI on a later read, which the threat model tracks as content rotation and which per-read verification rejects.
