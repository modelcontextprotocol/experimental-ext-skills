# Glossary

Working definitions for terms used across this repository.

## Agent Skill

Structured how-to knowledge for an agent. A skill can include workflow
instructions, decision rules, examples, and references to bundled files or
remote resources.

## Skill Resource

An MCP resource that exposes skill content or skill metadata. In the current
resources-based proposal, skill resources are discovered and read through
existing MCP resource methods.

## `skill://` URI

A URI scheme used by several experimental implementations to identify skill
resources. The scheme gives clients and servers a recognizable convention for
distinguishing skills from other resource types.

## Progressive Disclosure

A loading pattern where a client or agent first sees a short summary or
manifest, then reads larger instructions or referenced files only when needed.
This helps keep context usage proportional to the task.

## Server-Skill Pairing

The pattern where an MCP server ships skills that explain how to use its own
tools effectively. The skill and tools are versioned and distributed together.

## Multi-Server Composition

A workflow where a skill coordinates tools from more than one MCP server. This
is useful when the task spans services, such as a database, ticketing system,
and deployment platform.

## Skill Metadata

Structured fields that describe a skill, such as name, description, version,
tags, dependencies, source, or provenance. Metadata helps clients discover,
filter, and present skills.

## Control Model

The decision about who sees skill content and who decides when it loads. For
example, a host application may surface skills to a human, or an agent may read
a skill resource during task execution.

## Ephemeral Availability

The property that a skill is available while its MCP server is connected,
without requiring a separate permanent install on the client machine.

## Provenance

Information about where a skill came from and what server, organization, or
artifact produced it. Provenance is important for trust, review, and debugging.
