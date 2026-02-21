# MCP Resources

> Source: [MCP Specification – Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)  
> Retrieved via the `SearchModelContextProtocol` MCP docs tool.

## Overview

The Model Context Protocol (MCP) provides a standardized way for servers to **expose resources to clients**. Resources allow servers to share data that provides context to language models, such as files, database schemas, or application-specific information. Each resource is uniquely identified by a **URI**.

## Discovery Patterns

Resources support two complementary discovery patterns:

### Direct Resources

Fixed URIs that point to specific, well-known data.

```
calendar://events/2024   →  returns calendar availability for 2024
file:///path/to/doc.md   →  returns the contents of a specific file
```

### Resource Templates

Parameterized URI templates (RFC 6570) that enable flexible, dynamic queries. Arguments may be auto-completed through the MCP completion API.

```
travel://activities/{city}/{category}
travel://activities/barcelona/museums   →  all museums in Barcelona
```

Resource templates include metadata (title, description, expected MIME type) making them discoverable and self-documenting.

## Protocol Operations

| Method | Purpose | Returns |
|---|---|---|
| `resources/list` | List available direct resources | Array of resource descriptors |
| `resources/templates/list` | Discover resource templates | Array of resource template definitions |
| `resources/read` | Retrieve resource contents | Resource data with metadata |
| `resources/subscribe` | Monitor resource changes | Subscription confirmation |

### List Resources

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list"
}
```

This operation supports **pagination** via an optional `cursor` parameter.

### Read a Resource

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "file:///path/to/document.md"
  }
}
```

### List Resource Templates

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/templates/list",
  "params": {
    "cursor": "optional-cursor-value"
  }
}
```

## Resource Contents

Resources can contain either **text** or **binary (blob)** data. Each resource MUST include:

- A valid resource URI
- The appropriate MIME type
- Either text content or base64-encoded blob data

## Subscriptions

The protocol supports **optional subscriptions** to resource changes. Clients can subscribe to specific resources and receive notifications when they change.

A `notifications/resources/list_changed` notification can also be sent by the server at any time (without a prior subscription) to inform the client that the list of available resources has changed.

## Embedded Resources

Resources may be **embedded** directly in tool results or prompt messages to provide additional context or data. This allows prompts and tools to seamlessly incorporate server-managed content (documentation, code samples, reference materials) into the conversation flow.

```json
{
  "type": "resource",
  "resource": {
    "uri": "resource://example",
    "mimeType": "text/plain",
    "text": "Resource content"
  }
}
```

## Relevance to Skills Over MCP

Resources are one of the most natural candidates for delivering skill content over MCP:

- A skill document (e.g., a SKILL.md) can be exposed as a resource with a stable URI.
- Resource templates enable parameterized skill delivery (e.g., `skills://{workflow}/{step}`).
- Subscriptions allow clients to be notified when skill content changes without re-initialising the server — directly addressing one of the [current limitations](problem-statement.md) of server instructions.

However, [experimental findings](experimental-findings.md) show that models do not reliably discover and consume resources on their own; additional scaffolding (such as tool hints or server instructions) is typically required to direct model attention to skill resources.
