# Convention vs. New Primitive

> A recap of what to consider when evaluating how skills should be exposed over MCP.

## Two Paths

The community is exploring two broad approaches for skills over MCP:

1. **Convention on existing primitives.** Skills exposed as indexed `skill://`  or domain-specific resources using existing MCP methods (`resources/read`), formalized via the Skills Extension SEP ([#69 - draft extension](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)).
2. **New protocol primitive.** Dedicated methods for listing and activating skills, a `skills` capability, and skill-specific notifications. An earlier proposal ([SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076)) was closed when the IG began exploring the resources-based approach. [PR #86](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/86) reopens the primitive path with `skills/list` and `skills/activate`, adding scoped primitives (tools, prompts, resources, and nested skills) that are bundled inside a skill and only become visible after activation, rather than appearing in top-level lists.

Note that these are not mutually exclusive -- convention can prove patterns that later inform a primitive.

## Shared Work

Both approaches delegate skill content format to the [Agent Skills specification](https://agentskills.io/specification). This means much of the implementation work is the same regardless of which path is chosen:

| Work item | Convention approach | New primitive |
|---|---|---|
| Enumerate available skills | `skill://index.json` | `skills/list` |
| Model-driven loading | Host-provided `read_resource` tool | Dedicated `skills/activate` method |
| Multi-file skills | Sub-resources or archives | Same structural choice, different method names |
| Skill-level semantics (version, tools, invocation) | Frontmatter | Frontmatter |
| Transport-specific metadata | `_meta` | `_meta` or bespoke fields |
| Change notifications | `notifications/resources/list_changed` | `notifications/skills/list_changed` |

The frontmatter/transport split is inherent to the decision (shared by both proposals) that the Agent Skills specification remains the authority for skill content. Neither approach eliminates it. That said, PR #86 partially shifts some frontmatter concerns into typed protocol fields -- `allowed-tools` becomes `contents.tools`, the SKILL.md body becomes an `instructions` string -- though other frontmatter fields (version, compatibility, invocation mode) don't have typed equivalents and would still rely on frontmatter.

## Where They Differ

**Protocol surface area.** A new primitive adds methods, capabilities, and notifications to the MCP spec. The convention approach uses infrastructure clients already need for resources.

**Reusability.** The convention approach encourages clients to ship a host-provided `read_resource` tool, which unlocks model-driven access to any MCP resource -- not just skills. Several major clients already do this (Codex, Gemini CLI, Goose, fast-agent, Claude Code), and skills give the rest a concrete reason to follow. A skills-specific primitive solves skills but doesn't advance client support for the broader resources ecosystem.

**Scoped primitives.** PR #86 introduces a new capability the convention approach does not have a direct equivalent for: tools, prompts, and resources that are structurally hidden from top-level lists and only surface when a skill is activated. This makes activation the gating mechanism for tool visibility, addressing tool bloat at the protocol level rather than through other solutions such as tool search and other dynamic tool loading mechanisms. Whether this structural gating is necessary to add to the protocol, or whether other solutions are sufficient in practice is still an open question.

**Identification.** The convention approach relies on URI schemes (`skill://`) and naming patterns for clients to identify skill resources. A new primitive provides structural identification -- if it came from `skills/list`, it's a skill. The convention is more flexible; the primitive is more explicit.

**Reversibility.** Starting with convention and later adding a primitive is recoverable -- convention implementations continue to work and inform the primitive's design. Starting with a primitive and later changing direction puts more burden on client and server implementors.

## Questions Worth Asking

When evaluating which path is right for a particular use case or for the ecosystem broadly:

1. **Is structural tool gating necessary, or are existing solutions for dynamic tool selection sufficient?** Scoped primitives (PR #86) hide tools from `tools/list` until activation. The convention approach delegates to other solutions for dynamic tool selection (such as tool search and other methods outside of the protocol itself).  [The Primitive Grouping IG](https://github.com/modelcontextprotocol/experimental-ext-grouping) is also exploring general-purpose primitive grouping, which could address tool visibility at the protocol level independent of skills.
2. **Would a new primitive accelerate client adoption, or add to the backlog?** Clients have already implemented support for resources (including model-facing tools for loading them).  Several community projects have already been naturally using resources to represent skills. A new primitive is additional surface area on top of that.
3. **Do skills need protocol-level coordination with other primitives?** If skills need to interact with tools and prompts in ways that require dedicated protocol support (e.g., sampling with skill-aware tool visibility), convention may not be sufficient.

## What Will Help the Debate

Implementation experience on the convention approach -- what works, what's awkward, what genuinely fails. Friction reports with enough specificity to inform gap analysis. And engagement with both proposals, so that whichever path the ecosystem takes, the design is grounded in what implementers actually tried.

## References

- [SEP-2076: Skills as MCP Primitives](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) (closed)
- [PR #86: MCP-Native Skills](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/86)
- [PR #69: Skills Extension SEP](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/69)
- [PR #2527: Recommend clients expose resource read to models](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527)
- [Approaches](approaches.md) -- full landscape of approaches that the group has discussed.
- [Primitive Grouping IG Repo](https://github.com/modelcontextprotocol/experimental-ext-grouping)
