# Glossary

This glossary keeps terminology aligned across the Skills Over MCP working group. The definitions are intentionally short and scoped to this repository's experimental work; they are not MCP specification text.

## Skill

In this repository, a **skill** is structured how-to context: instructions, references, and sometimes dependency metadata that help an agent perform a workflow. The [Agent Skills specification](https://agentskills.io/specification) defines a concrete file/package format for agent skills; Skills Over MCP is exploring how equivalent content can be discovered and delivered through MCP primitives.

## Instruction

An **instruction** is text that guides behavior. In MCP, `server.instructions` is server-provided initialization guidance, while skill instructions are workflow content that may be discovered and loaded later; conflating the two can obscure lifecycle and loading questions.

## Primitive

A **primitive** is a protocol-level MCP surface such as tools, resources, prompts, or sampling. This is narrower than the colloquial use of "primitive" to mean any basic building block in an implementation.

## Convention

A **convention** is a documented recommended pattern that can be implemented without changing the MCP protocol. The current Resources-based `skill://` direction is framed as a convention/extension path rather than a new core primitive.

## Context

**Context** is information made available to a model or host so it can reason or act. In "skills as context" or "context-as-resources," the focus is on discoverable workflow content delivered through MCP, not merely on the general LLM context window.

## Progressive disclosure

**Progressive disclosure** means exposing lightweight skill metadata first and loading the full skill content only when needed. In skills work, this is about managing model context and discovery cost, not just a general UX pattern for hiding advanced options.

## Control model

The **control model** describes who decides when content is visible or loaded. MCP Resources are commonly application-controlled, while skills are often expected to be model-controlled or model-visible on demand; this distinction affects trust, privacy, and usability.

## First-class primitive

A **first-class primitive** has dedicated protocol methods, capability declarations, and usually notifications for lifecycle changes. For skills, this would mean something like `skills/list` and `skills/get`; the current exploration asks whether existing Resources conventions are enough before adding that surface area.

## Server author

A **server author** builds and operates an MCP server. Server authors may expose skills related to their tools, but they are not necessarily the same people who write or maintain every skill.

## Skill author

A **skill author** writes the workflow guidance, references, and metadata that make up a skill. Skill authorship can be independent from server authorship, especially for cross-server or organization-level workflows.

## Discovery

**Discovery** is finding that a skill exists and learning enough metadata to decide whether it is relevant. Fetching the skill body is a separate operation, and separating these steps is central to progressive disclosure.

## Skill content

**Skill content** is the full body of instructions and linked material a client may load after discovery. Visibility into this content is part of the control-model and trust-boundary discussion.
