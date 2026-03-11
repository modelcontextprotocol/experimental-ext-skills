---
name: explore-everything
description: Explore the MCP Everything Server to discover and demonstrate its tools
dependencies: [everything-server]
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Explore Everything Server

This skill requires the **Everything Server** MCP server to be connected.
When loaded, the client host will automatically connect to it via the
dependency resolution callback.

## What to do

1. Use the `echo` tool to validate connectivity to the Everything Server.
2. List all available tools from the Everything Server and describe them to the user.
3. Demonstrate at least one tool by calling it with sample inputs.

## Notes

- The Everything Server is an MCP reference server that exposes sample tools,
  resources, and prompts for testing purposes.
- If the expected tools are not available after loading this skill, it means
  the server dependency was not connected. Ask the user to check their
  server configuration.
