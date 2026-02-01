# Skills Over MCP Interest Group

> ⚠️ **Experimental** — This repository is an incubation space for the [Skills Over MCP Interest Group](https://docs.google.com/document/d/1j-AGRcvLkYiiIJ9asmmF1mLLjjUiova7a9BgkSXtD4s/edit?usp=sharing). Contents are exploratory and do not represent official MCP specifications or recommendations.

## Mission

This Interest Group explores how "[agent skills](https://agentskills.io/)" (rich, structured instructions for agent workflows) can be discovered and consumed through MCP. Native skills support in host applications demonstrates strong demand, but the community hasn't aligned on whether existing MCP primitives suffice or what conventions to standardize.

## Problem Statement

Native "skills" support in host applications demonstrates demand for rich workflow instructions, but there's no convention for exposing equivalent functionality through MCP primitives. Current limitations include:

- **Server instructions load only at initialization** — new or updated skills require re-initializing the server
- **Complex workflows exceed practical instruction size** — some skills require hundreds of lines of markdown with references to bundled files
- **No discovery mechanism** — users installing MCP servers don't know if there's a corresponding skill they should also install
- **Multi-server orchestration** — skills may need to coordinate tools from multiple servers

## Status

- This repository is WIP and will ultimately replace [this public Google Document](https://docs.google.com/document/d/1j-AGRcvLkYiiIJ9asmmF1mLLjjUiova7a9BgkSXtD4s/edit?usp=sharing).
- Until this note is removed, please continue to use the above document and the [#skills-over-mcp-ig Discord channel](https://discord.com/channels/1358869848138059966/1464745826629976084) for ongoing discussion.
