# SEP-XXXX: MCP-Native Skills

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-04-19
- **Author(s)**: Kurtis Van Gent (@kurtisvg), Haoyu Wang (@helloeve)
- **Sponsor**: Kurtis Van Gent (@kurtisvg)
- **PR**: TBD

## Abstract

[Agent Skills](https://agentskills.io) have become a standard pattern for
progressive disclosure in agent systems and are [widely
adopted](https://agentskills.io) across agent products. They work by grouping
capabilities into self-contained units whose details load only when relevant.
However, the current implementation is inherently filesystem-driven and relies
on a shell to execute skill actions. This introduces portability issues (Windows
vs Linux vs macOS; Python vs Node.js) and security concerns (shells are
inherently unsafe and unsuitable for some workloads).

This SEP introduces `Skill` as a first-class MCP server primitive alongside
`Tool`, `Resource`, and `Prompt`. Two new methods, `skills/list` and
`skills/activate`, preserve the progressive-discovery model in an MCP-native
way. A Skill bundles instructions with scoped tools, prompts, resources, and
nested sub-skills. Listing is cheap; scoped primitives stay hidden from
`tools/list` until activation, so a server can ship rich per-skill capabilities
without flooding every session. Activation returns prompt-style instructions and
the scoped primitive definitions in one round-trip; clients choose how to
surface them, tailoring to their specific model and UX patterns, consistent with
MCP's principle of not over-prescribing host behavior. Scoped actions run
through ordinary `tools/call` invocations against server-owned tools, so the
client needs no filesystem and no shell. Portability and the security posture
become the server's responsibility rather than every client's.

This proposal offers an alternative to the resources-based [Skills Extension
SEP] and the closed [SEP-2076], adding the container semantics and an explicit
activation step that make progressive disclosure actually reduce agent context
size.

[Skills Extension SEP]:
    https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69
[SEP-2076]:
    https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076

## Motivation

### Tool and context bloat

Agents slow down, spend more, and get less accurate as their tool list grows.
Accuracy degrades past a handful of active tools; unused tool schemas are billed
on every turn; and per-token latency compounds across multi-step workflows.
Agent Skills exist in large part to address this, grouping related capabilities
into a unit the agent pulls in only when relevant. An MCP mechanism for
delivering skills must preserve that gating property or the point of skills is
lost.

### Skills belong in the protocol, not the data plane

Resources are files. A `SKILL.md` served through `resources/` can mention tool
names, list required prompts, and point at companion resources. In that sense a
resource *can* be used to specify other MCP primitives by reference. But pushing
those references into file content moves protocol primitives down into the data
plane. The client is no longer reading a structured protocol response; it is
parsing markdown to figure out which tools a skill needs, when to gate them,
when to reveal them, and how to tie instructions back to capabilities.

An MCP-native approach keeps the semantics in the protocol. A skill's tools,
prompts, resources, and sub-skills become typed fields the client handles the
same way it handles `tools/list` and `prompts/list` today, with no per-client
parser for a markdown convention, and no risk that two servers describe the same
relationship in two incompatible ways. The content the protocol transmits stays
content; the structure stays in the protocol.

## Specification

This section uses RFC-2119 keywords (MUST, SHOULD, MAY) for conformance
requirements. The shapes below mirror the existing [`tools`][spec-tools],
[`resources`][spec-resources], and [`prompts`][spec-prompts] primitives in the
2025-11-25 specification.

### Capability negotiation

A server that supports Skills MUST advertise the `skills` capability in its
`initialize` result. The capability field mirrors the shapes used for `tools`,
`prompts`, and `resources`:

```typescript
export interface ServerCapabilities {
  // ...existing fields omitted...

  /**
   * Present if the server offers any skills.
   */
  skills?: {
    /**
     * Whether this server supports notifications for changes to the skill list.
     */
    listChanged?: boolean;
  };
}
```

### The `Skill` object

A `Skill` is a lightweight, named primitive returned by `skills/list`. Its
scoped contents are returned separately by `skills/activate` so that listing
stays cheap and activation is the explicit moment the bundle enters the session.

```typescript
/**
 * A named workflow bundle the server offers.
 *
 * @category `skills/list`
 */
export interface Skill {
  /**
   * The unique identifier for the skill within the server. Used by the
   * client to reference the skill in `skills/activate`.
   *
   * MUST follow Agent Skills naming rules: 1–64 characters, lowercase
   * alphanumeric and hyphens, with no leading, trailing, or consecutive
   * hyphens.
   */
  name: string;

  /**
   * Optional human-readable title for display in a host UI.
   */
  title?: string;

  /**
   * A model-facing description of what the skill does and when to use it.
   * SHOULD be one or two sentences. Used by the model to choose between skills.
   */
  description: string;

  /**
   * See [General fields: `_meta`](/specification/2025-11-25/basic/index#meta).
   */
  _meta?: { [key: string]: unknown };
}
```

Naming rules on `name` are drawn from the [Agent Skills
spec](https://agentskills.io/specification#name-field).

### `skills/list`

Servers respond to `skills/list` with a cursor-paginated array of `Skill`
metadata. Implementations SHOULD omit `contents` from list responses and return
the expanded form only via `skills/activate`.

```typescript
/**
 * Sent from the client to request a list of skills the server offers.
 *
 * @category `skills/list`
 */
export interface ListSkillsRequest extends PaginatedRequest {
  method: "skills/list";
}

/**
 * The server's response to a skills/list request.
 *
 * @category `skills/list`
 */
export interface ListSkillsResult extends PaginatedResult {
  skills: Skill[];
}
```

### `skills/activate`

`skills/activate` is the method the client calls to pull in a skill the agent
intends to use. It returns everything the client needs to surface the skill: its
instructions and any scoped primitives it bundles.

```typescript
/**
 * Parameters for a `skills/activate` request.
 *
 * @category `skills/activate`
 */
export interface ActivateSkillRequestParams extends RequestParams {
  /**
   * The name of the skill to activate.
   */
  name: string;
}

/**
 * Used by the client to activate a skill provided by the server.
 *
 * @category `skills/activate`
 */
export interface ActivateSkillRequest extends JSONRPCRequest {
  method: "skills/activate";
  params: ActivateSkillRequestParams;
}

/**
 * The server's response to a `skills/activate` request.
 *
 * @category `skills/activate`
 */
export interface ActivateSkillResult extends Result {
  /**
   * The skill's instructions. A markdown string containing the full
   * workflow the agent should follow: what to do, how to use the
   * primitives, and any conditional branching.
   */
  instructions: string;

  /**
   * Fully expanded definitions for primitives scoped to this skill.
   * Every entry MUST be a complete primitive object with the fields a
   * client needs to invoke it (e.g., `inputSchema` for Tools). Scoped
   * primitives MUST NOT appear in top-level `tools/list`,
   * `prompts/list`, or `resources/list`; they exist only within the
   * activated skill's scope.
   */
  contents?: SkillContents;
}

/**
 * Scoped primitives bundled with a skill and returned in the
 * `skills/activate` response.
 */
export interface SkillContents {
  tools?: Tool[];
  prompts?: Prompt[];
  resources?: Resource[];
  skills?: Skill[];
}
```

### Client activation behavior

The specification defines the payload returned by `skills/activate`. It does
**not** mandate how a client exposes the resulting instructions or scoped
primitives to the model. Hosts differ in their rendering, authorization, and
session-state models; prescribing a single post-activation flow would push the
spec into territory the [WG design principles][approaches] explicitly warn
against ("Don't be too prescriptive about client host behavior").

A likely implementation pattern is for the client to expose a small set of
client-side helper tools to the model and route skill machinery through them.
For example:

- `activate_skill`: takes a skill name, calls `skills/activate`, and returns the
  instructions plus a summary of what the skill makes available.
- `read_resource`: lets the model retrieve a scoped resource by URI after
  activation.
- `invoke_prompt`: lets the model trigger a scoped prompt as part of the
  workflow.

This keeps the model's reachable surface small (three client-side tools plus
whatever else the host exposes) while giving the model a clean way to pull in
skill content on demand. Scoped tools remain invokable through ordinary
`tools/call` when the client registers them for the session. Other clients may
inject activation output directly into the model's context, surface skills in a
UI picker, or combine approaches; the spec accommodates all of these.

### `notifications/skills/list_changed`

```typescript
/**
 * An optional notification from the server to the client, informing it
 * that the list of skills it offers has changed. Sent only when the
 * server has declared `skills.listChanged = true`.
 *
 * @category `notifications/skills/list_changed`
 */
export interface SkillListChangedNotification extends JSONRPCNotification {
  method: "notifications/skills/list_changed";
  params?: NotificationParams;
}
```

### Nested skills

A skill MAY list other skills in `contents.skills`. Child skills are listed on
the parent's activation response but are **not** themselves activated by
activating the parent; children require their own `skills/activate` call. This
keeps activation cost predictable and lets the model choose whether to dive into
a sub-skill.

### Naming and collisions

- `name` follows Agent Skills naming rules (see `Skill.name` above).
- Name collisions across servers are resolved by the host, the same way
  tool-name collisions are handled today.

[spec-tools]:
    https://modelcontextprotocol.io/specification/2025-11-25/server/tools
[spec-resources]:
    https://modelcontextprotocol.io/specification/2025-11-25/server/resources
[spec-prompts]:
    https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
[approaches]:
    https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/approaches.md#design-principles

## Rationale

### Why a new primitive rather than extending `resources/`

The [MCP design principles][mcp-principles] set a high bar for new protocol
surface. *Composability over specificity* prefers constructing behavior from
existing primitives; *standardization over innovation* codifies patterns that
have proven valuable rather than inventing paradigms. Both are good defaults,
and a new primitive should have to earn its place. Skills meet that bar. The
strongest way to see why is to notice what the resources-based alternative
actually does to the protocol.

**It mixes the control plane with the data plane.** Resources are a data-plane
primitive: they deliver content. Layering skills on resources forces the client
to parse that content to recover protocol-level semantics: which tools the skill
gates, which prompts it composes, when to activate, how to tie instructions back
to callable primitives. Structure that should live in typed protocol fields ends
up hidden inside markdown every client has to run a parser against. This is the
point made in Motivation §*Skills belong in the protocol, not the data plane*.

**Resources are so generic they could do almost anything, which is exactly why
they shouldn't.** A resource can carry any payload, so in principle we could
describe the entire `Tool` type as a resource convention: URIs matching
`tool://...`, mimeType `application/json`, bodies containing an `inputSchema`.
The spec would shrink by one primitive. Nobody would argue this is a good idea.
It would overload a generic interface, force every client to reimplement the
same parsing logic, and trade type safety and explicit intent for a narrow
reduction in protocol surface. Skills under a resources convention are that same
thought experiment applied to workflows. That something *can* be expressed by
convention is not an argument that it *should* be; primitives with typed
cross-references and activation semantics belong in the protocol itself.

**Standardization here means codifying the pattern, not inventing one.** Agent
Skills are a widely adopted pattern across agent products. The question is not
*whether* to standardize but *where*: in a URI convention on top of an
ill-fitting primitive, or in a typed primitive that matches the pattern agents
already use. A first-class primitive is standardization *of a proven pattern*,
not innovation of a new one, and implementing it in a way that makes sense in
MCP.

### Simpler for clients to implement

This proposal is extremely simple for clients to implement. It is two RPCs,
`skills/list` and `skills/activate`, largely composed of existing primitives.
The activation response delivers typed `Tool`, `Prompt`, `Resource`, and nested
`Skill` objects the client already knows how to render and invoke. Adding skill
support is roughly the work of adding any other primitive.

### Reuses Prompts and Resources for agent-driven workflows

Prompts and Resources were built for a human-activated world, in which users
trigger prompts through slash commands (`/prompt`) and pull in resources through
@-mentions. Some of these primitives are well-suited for autonomous agent
consumption; others aren't. Top-level `Prompt` and `Resource` entries don't
distinguish between the two, leaving the client without a signal for which are
safe for the agent to reach on its own.

Skills give servers a way to express that intent through placement. A `Prompt`
or `Resource` that appears inside a skill's `contents` is an explicit statement
from the server: **this primitive is fit to be consumed directly by the agent as
needed**. Primitives that stay top-level retain their human-activated semantics;
primitives that appear in a skill gain an agent-reachable path without changing
what the top-level version means.

### Communicates tool semantics through placement

Where a server places a tool tells the client what that tool is for. A `Tool` in
`tools/list` is a capability the server asserts every session should have
available: "this is part of the core surface, reach for it whenever it applies."
A `Tool` surfaced only through a skill's `contents.tools` carries the opposite
signal: "this is situational; reach for it only after the agent has declared it
is doing the workflow this tool belongs to." The server expresses availability
semantics the same way it expresses agent-vs-user intent for Prompts and
Resources: by where the primitive lives.

That same placement mechanism is how skills address tool bloat. A server with
100 specialized tools does not publish 100 entries in `tools/list`; it keeps a
short always-on surface and lets each skill's activation surface the handful of
tools relevant to that workflow. Availability becomes a spectrum the server
communicates, not a binary the client has to infer.

## Backward Compatibility

- The `skills` capability is net-new. Servers that do not advertise it are
  unaffected. Clients that do not understand it SHOULD ignore the capability and
  MUST continue to function against the server's existing `tools`, `resources`,
  and `prompts` surfaces.
- No existing method's request or response shape changes.

## Reference Implementation

TODO

## Security Implications

- **Skills are untrusted model input, not directives.** Clients MUST surface
  scoped tools through the same authorization UX they use for top-level tools
  and MUST NOT auto-invoke scoped tools on activation.
- **Trust inherits MCP server trust.** Skills do not introduce a new trust
  model. A skill carries the same level of trust as the server that delivers it.
  Hosts SHOULD NOT present MCP as a distribution channel for arbitrary
  third-party skill content; [existing guidance][trust] applies unchanged.
- **Injection risk is the same as any agent-reachable primitive.** A skill's
  instructions and scoped primitive descriptions are untrusted content the model
  will read, the same risk carried by tool descriptions, prompts, and resource
  contents today. `skills/activate` is pull-only and has no auto-prefetch, so no
  new transport-level exposure is introduced; what changes is that the agent
  (not the user) decides when to activate, and clients SHOULD NOT treat
  activated instructions as privileged over any other untrusted content.
- **No filesystem execution chain.** Scoped actions run through ordinary
  `tools/call` invocations against server-owned tools, so the client makes no
  filesystem, base64, or subprocess assumptions. The `resources/read → decode →
  disk → chmod → shell-exec` chain that the resources-based alternative requires
  in practice (and its attendant attack surface) does not exist here.

[trust]:
    https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries

## Responses to Expected Objections

### 1. "Why not just resources? Skills are files; resources already expose files."

This is the most common objection, raised in [open question #12][oq12] and
reiterated in review of the current draft SEP. The full architectural answer is
in Motivation §*Skills belong in the protocol, not the data plane* and Rationale
§*Why a new primitive rather than extending `resources/`*. In practical
consequences:

- **Namespace overloading.** A server's `resources/list` becomes a mix of
  content files and workflow bundles. Existing host features built around
  resources (@-mentions, attachments, pinned context, resource subscriptions)
  now have to reason about whether each resource is "a file the user might
  attach" or "a skill envelope the agent might activate." A dedicated primitive
  keeps these namespaces separate.

- **Upfront enumeration cost.** Files belonging to skills end up listed in
  `resources/list` alongside unrelated content. URI templates can defer some of
  that, but the scoped-primitive model in this proposal makes deferral the
  default rather than an optimization: `skills/list` returns lightweight
  metadata, and `skills/activate` fetches scoped definitions on demand.

- **Composability with non-skill resources.** Skills often want to reference
  documents, schemas, or prompts that exist for other reasons too. Under a
  resources-based convention, those references live in the SKILL.md body as
  markdown text rather than as typed protocol entries. A first-class `Skill`
  carries them in structured `contents` without inventing a text-based linking
  convention.

### 2. "Clients should implement Tool Search to solve tool bloat."

Tool search is *a* solution to progressive discovery, not *the* solution, and
arguably not the best one.

- **MCP refusing to offer alternatives is itself prescribing a solution.** Most
  MCP clients today do not implement tool search; they surface tools via a flat
  list and rely on the model to pick from it. MCP's design principles counsel
  against dictating *how* clients solve problems, but rejecting a skills
  primitive on the grounds that "tool search exists" *is* a dictation: it forces
  every client onto tool search as the only available path to progressive
  discovery. Offering skills alongside the existing surface is what actually
  leaves the choice to clients.

- **Tool search is non-trivial to implement well.** A cheap keyword or
  substring-match implementation only finds tools whose names already resemble
  the query; an agent looking for a "save to disk" tool will miss a server-side
  capability called `persist_v2`. Doing better requires embedding pipelines,
  ranking infrastructure, reindexing when the tool catalog changes, and
  per-model tuning. Small clients and emerging SDKs are unlikely to prioritize
  that work, and the quality gap between implementations becomes a second
  interoperability problem.

- **Search overhead compounds across multi-tool workflows.** If tool search is
  the discovery mechanism, every tool an agent wants to invoke may require a
  preceding search query to find it. A workflow that invokes five tools doubles
  in turn count (five searches plus five invocations) compared to a workflow
  where the five tools are already visible in the session. Skills pay the
  disclosure cost once, at activation; tool search pays it per invocation.

- **Search only finds what the agent thinks to look for.** Tool search is
  pull-based: the agent queries for what it already knows it needs. Tools that
  would have been useful but that the agent didn't think to look for stay
  invisible. Skills are push-based: activating a skill surfaces the full set of
  tools, prompts, and resources the server considers relevant to the workflow,
  including capabilities the agent would not have discovered on its own.

- **Skills and search compose.** Search retrieves from a flat set; skills group
  related capabilities up front. Search over 100 tools mixed together is a worse
  experience than search over 10 skills, each surfacing the handful of tools
  relevant to that workflow. If hosts do implement tool search, skills make the
  result better.

[oq12]:
    https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/open-questions.md#12-why-not-just-resources
[mcp-principles]: https://modelcontextprotocol.io/community/design-principles
