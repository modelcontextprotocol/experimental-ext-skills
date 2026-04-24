# Related Work

## SEPs and Proposals

| Proposal | Venue | Description |
| :--- | :--- | :--- |
| [PR #2527](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2527) | MCP Spec | Recommend clients expose resource read to models — prerequisite for the resources-based skills approach |
| [SEP-2640 (Skills Extension)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640) | MCP Spec | This WG's proposed extension: skills served over MCP using the Resources primitive and `skill://` URI scheme ([working draft](sep-draft-skills-extension.md)) |
| [skills.json format proposal](https://github.com/modelcontextprotocol/registry/discussions/895) | MCP Registry | Skills metadata in registry schema |
| ~~[SEP-2093](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093)~~ | MCP Spec | ~~Resource Contents Metadata and Capabilities: scoped `resources/list`, per-resource capabilities, `resources/metadata` endpoint~~ — **rejected** ([labeled upstream](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093)) |
| ~~[SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076)~~ | MCP Spec | ~~Agent Skills as a first-class MCP primitive~~ — **closed** (2026-02-24, without merge) |

## Working Group Member Implementations

Work by WG leads and active participants that directly implements the group's core patterns: SKILL.md with YAML frontmatter, `skill://` resource URIs, and progressive disclosure via MCP primitives.

| Implementation | Author | URL | Notes |
| :--- | :--- | :--- | :--- |
| skilljack-mcp | Ola Hungerford | [github.com/olaservo/skilljack-mcp](https://github.com/olaservo/skilljack-mcp) | SKILL.md, `skill://` resources, tools, and prompts; progressive disclosure (index→skill→files); file watching for dynamic updates; audience annotations |
| skills-over-mcp | Keith Groves | [github.com/keithagroves/skills-over-mcp](https://github.com/keithagroves/skills-over-mcp) | SKILL.md, `skill://` resources with progressive disclosure (index→skill→documents); Zod validation against Agent Skills spec |
| skillsdotnet | Peder HP | [github.com/PederHP/skillsdotnet](https://github.com/PederHP/skillsdotnet) | C# implementation: SKILL.md, `skill://` resources, `load_skill` tool for progressive disclosure, manifest with file hashes; published on NuGet; compatible with FastMCP 3.0 |

## Alternative Approaches

Work by WG members and MCP maintainers that explores skills over MCP through different technical approaches than the core SKILL.md / `skill://` pattern.

| Implementation | Author | Organization | URL | Notes |
| :--- | :--- | :--- | :--- | :--- |
| skillful-mcp | Kurtis Van Gent | Google Cloud | [github.com/kurtisvg/skillful-mcp](https://github.com/kurtisvg/skillful-mcp) | Progressive disclosure via 4 lightweight tools (`list_skills`, `use_skill`, `read_resource`, `execute_code`); wraps downstream MCP servers as skills using `mcp.json` config rather than SKILL.md; sandboxed code execution via Monty |
| Astronomer agents | Kaxil Naik | Astronomer | [github.com/astronomer/agents](https://github.com/astronomer/agents) | Production skills catalog for Apache Airflow (blueprint, migration, warehouse-init); uses SKILL.md frontmatter but distributed via plugin marketplace rather than MCP resources; demonstrates real-world skills adoption at scale |
| mcpGraph skill | Bob Dickinson | TeamSpark.ai | [github.com/TeamSparkAI/mcpGraph](https://github.com/TeamSparkAI/mcpGraph) | Declarative YAML-based tool orchestration engine (directed graphs of MCP tool calls); includes SKILL.md files as documentation; explores a complementary "no-code composition" approach to skill authoring |

## Other Community Implementations

External projects building on skills patterns or integrating skills into frameworks.

| Implementation | Author | URL | Notes |
| :--- | :--- | :--- | :--- |
| FastMCP 3.0 Skills | FastMCP | [gofastmcp.com/servers/providers/skills](https://gofastmcp.com/servers/providers/skills) | Native skills provider ([#2694](https://github.com/jlowin/fastmcp/issues/2694)) |
| PydanticAI Skills | PydanticAI | [pydantic/pydantic-ai#3780](https://github.com/pydantic/pydantic-ai/pull/3780) | Agent skills with tools-based approach |
| mcp-execution | bug-ops | [github.com/bug-ops/mcp-execution](https://github.com/bug-ops/mcp-execution) | Compiles MCP servers into skill packages; `--dry-run` preview |
| mcp-cli | philschmid | [github.com/philschmid/mcp-cli](https://github.com/philschmid/mcp-cli) | Wraps MCP servers as CLI for progressive disclosure |
| my-cool-proxy | karashiiro | [github.com/karashiiro/my-cool-proxy](https://github.com/karashiiro/my-cool-proxy) | MCP gateway with skills as resources via Lua scripts; result offloading, session persistence (v1.6.x) |
| NimbleBrain skills repo | NimbleBrain | [github.com/NimbleBrainInc/skills](https://github.com/NimbleBrainInc/skills) | Monorepo with `.skill` artifact format |
| NimbleBrain registry | NimbleBrain | [registry.nimbletools.ai](https://registry.nimbletools.ai/) | Registry with skill metadata support |
| NimbleBrain skill:// servers | NimbleBrain | [github.com/NimbleBrainInc](https://github.com/NimbleBrainInc) | skill:// resource colocation examples: [mcp-ipinfo](https://github.com/NimbleBrainInc/mcp-ipinfo), [mcp-webfetch](https://github.com/NimbleBrainInc/mcp-webfetch), [mcp-pdfco](https://github.com/NimbleBrainInc/mcp-pdfco), [mcp-folk](https://github.com/NimbleBrainInc/mcp-folk), [mcp-brave-search](https://github.com/NimbleBrainInc/mcp-brave-search) |
| Kiro powers directory | Kiro | [github.com/kirodotdev/powers](https://github.com/kirodotdev/powers/) | Plugin directory bundling skills + MCP servers; active catalog (AWS, GCP migration, SAM, etc.) |

## Related Ecosystem Work

Projects that illustrate the problem space or use adjacent patterns.

| Project | Author | URL | Notes |
| :--- | :--- | :--- | :--- |
| chrome-devtools-mcp | Anthropic | [github.com/anthropics/anthropic-quickstarts/…/chrome-devtools-mcp](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-servers/chrome-devtools-mcp) | Real-world example of the problem: `skills/` folder requires separate install path |
| Strands Agents MCP server | AWS | [github.com/strands-agents/mcp-server](https://github.com/strands-agents/mcp-server/) | Docs-as-MCP: TF-IDF search + doc fetch |
| AWS MCP server | AWS | [docs.aws.amazon.com/aws-mcp/…](https://docs.aws.amazon.com/aws-mcp/latest/userguide/understanding-mcp-server-tools.html) | `retrieve_agent_sop` (skills) + `call_aws` (tool) |

## Specifications and Standards

- **Agent Skills Standard:** [agentskills.io](https://agentskills.io/)
- **Agent Skills Discovery RFC v0.2.0** (Matt Silverlock / Cloudflare): [github.com/cloudflare/agent-skills-discovery-rfc](https://github.com/cloudflare/agent-skills-discovery-rfc) — Domain-level skill discovery using `/.well-known/agent-skills/` (RFC 8615). Defines `index.json` with progressive disclosure, `skill-md` and `archive` distribution types, `$schema` versioning, SHA-256 content integrity, and archive safety requirements. Complementary to MCP-level discovery: `.well-known` answers "what skills does this domain publish?" while MCP answers "how does the agent consume them at runtime?"
- **Skill dependency declaration:** [agentskills/agentskills#110](https://github.com/agentskills/agentskills/issues/110) — Discusses how skills should declare their tool/server dependencies
- **Apache Airflow AIP-91** (MCP integration): [cwiki.apache.org/…/AIP-91+-+MCP](https://cwiki.apache.org/confluence/display/AIRFLOW/AIP-91+-+MCP)

## Background Reading

- **Anthropic's guidance on progressive disclosure:** [Equipping agents for the real world with agent skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- **"MCP and Skills: Why Not Both?"** (Kurtis Van Gent): [kvg.dev/posts/20260125-skills-and-mcp/](https://kvg.dev/posts/20260125-skills-and-mcp/) — Frames MCP (connectivity) and Skills (context saturation) as complementary; discusses hybrid approaches
- **Conceptual spec visualization** (Keith Groves): [enact-465fb1fc.mintlify.app/specification/draft/server/skills](https://enact-465fb1fc.mintlify.app/specification/draft/server/skills) — "What if" exploration
- **llms.txt convention:** [llmstxt.org](https://llmstxt.org/) — Convention for making documentation LLM-accessible; used by [MCPDoc](https://github.com/langchain-ai/mcpdoc) in a way similar to how skills work
- **AWS Agent SOPs:** [docs.aws.amazon.com/…/agent-sops](https://docs.aws.amazon.com/aws-mcp/latest/userguide/agent-sops.html) — Pre-built operational workflows as skill-like guidance
- **Video background:** [youtube.com/watch?v=CEvIs9y1uog](https://www.youtube.com/watch?v=CEvIs9y1uog)
