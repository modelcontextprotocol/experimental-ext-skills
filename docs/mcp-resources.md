# MCP Resources

> **Source:** Retrieved via the [MCP Docs server](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) using the official MCP documentation MCP server integration.

## Overview

The Model Context Protocol (MCP) provides a standardized way for servers to expose **resources** to clients. Resources allow servers to share data that provides context to language models, such as files, database schemas, or application-specific information. Each resource is uniquely identified by a **URI**.

Resources are one of the core MCP server primitives alongside Tools and Prompts.

## Discovery Patterns

Resources support two discovery patterns:

### Direct Resources
Fixed URIs that point to specific data.

- Example: `calendar://events/2024` — returns calendar availability for 2024

### Resource Templates
Dynamic URIs with parameters for flexible queries, defined using [RFC 6570 URI Templates](https://www.rfc-editor.org/rfc/rfc6570).

- Example: `travel://activities/{city}/{category}` — returns activities by city and category
- Example resolution: `travel://activities/barcelona/museums` — returns all museums in Barcelona

Resource Templates include metadata such as `title`, `description`, and expected `mimeType`, making them discoverable and self-documenting. Arguments may be auto-completed through the completion API.

## Protocol Operations

| Method | Purpose | Returns |
| :--- | :--- | :--- |
| `resources/list` | List available direct resources | Array of resource descriptors |
| `resources/templates/list` | Discover resource templates | Array of resource template definitions |
| `resources/read` | Retrieve resource contents | Resource data with metadata |
| `resources/subscribe` | Monitor resource changes | Subscription confirmation |

Both `resources/list` and `resources/templates/list` support **pagination** via an optional `cursor` parameter.

### Listing Resources

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {
    "cursor": "optional-cursor-value"
  }
}
```

### Reading Resources

To retrieve resource contents, clients send a `resources/read` request:

```json
{
  "jsonrpc": "2.0",
  "id": "read-resource-example",
  "method": "resources/read",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

**Response example:**

```json
{
  "contents": [
    {
      "uri": "file:///project/src/main.rs",
      "mimeType": "text/x-rust",
      "text": "fn main() {\n  println!(\"Hello world!\");\n}"
    }
  ]
}
```

> **Note:** If the URI scheme is `https://`, clients may fetch the resource directly from the web.

## Resource Contents

Resources can contain either **text** or **binary (blob)** data:

- **Text resources** (`TextResourceContents`): include a `text` field with the string content
- **Binary resources** (`BlobResourceContents`): include a `blob` field with base64-encoded binary data

Both types MUST include:
- A valid resource `uri`
- The appropriate `mimeType` (if known)
- Either `text` content or base64-encoded `blob` data

## Subscriptions

The protocol supports optional subscriptions to resource changes. Clients can subscribe to specific resources and receive notifications when they change:

**Subscribe request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

**Update notification (server → client):**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

Servers can also notify clients when the list of available resources changes via `notifications/resources/list_changed`.

## Capabilities

Servers that support resources MUST declare the `resources` capability during initialization. The capability supports two optional features:

- **`subscribe`**: whether the client can subscribe to be notified of changes to individual resources
- **`listChanged`**: whether the server will emit notifications when the list of available resources changes

```json
{
  "capabilities": {
    "resources": {
      "subscribe": true,
      "listChanged": true
    }
  }
}
```

Both `subscribe` and `listChanged` are optional — servers can support neither, either, or both.

## User Interaction Model

Resources in MCP are designed to be **application-driven**, with host applications determining how to incorporate context based on their needs. For example, applications could:

- Expose resources through UI elements for explicit selection (tree or list view)
- Allow the user to search through and filter available resources
- Implement automatic context inclusion, based on heuristics or the AI model's selection

Implementations are free to expose resources through any interface pattern that suits their needs — the protocol itself does not mandate any specific user interaction model.

## Embedded Resources in Prompts

Resources can also be embedded directly in MCP prompt messages, allowing prompts to incorporate server-managed content like documentation, code samples, or other reference materials directly into the conversation flow.

## Relevance to Skills Over MCP

From experimental findings in this repository (see [experimental-findings.md](experimental-findings.md)):

- **Skills as Resources resulted in poor outcomes** — models never used or looked at skill resources unless explicitly asked
- Resources are application-driven rather than model-driven, which may explain why models don't proactively consume them
- The `resources/subscribe` capability is potentially interesting for dynamic skill updates without server re-initialization (addressing the problem of skills loading only at initialization)

The discoverability gap for resources (clients/models not knowing when to proactively pull resource content) is a key open question for the skills-over-resources approach.

## References

- [MCP Resources Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [How Resources Work — MCP Learn](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [MCP Schema Reference](https://modelcontextprotocol.io/specification/2025-06-18/schema)
