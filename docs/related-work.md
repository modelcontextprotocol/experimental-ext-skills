# Related Work

## Open SEPs and Proposals

| Proposal | Venue | Description |
| :--- | :--- | :--- |
| [SEP-2076](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076) | MCP Spec | Agent Skills as a first-class MCP primitive |
| [skills.json format proposal](https://github.com/modelcontextprotocol/registry/discussions/895) | MCP Registry | Skills metadata in registry schema |

## Implementations

Original implementations from external repositories (example implementations in this repo will be added to `examples` folder):

| Implementation | Author | URL | Notes |
| :--- | :--- | :--- | :--- |
| skilljack-mcp | Ola Hungerford | [github.com/olaservo/skilljack-mcp](https://github.com/olaservo/skilljack-mcp) | Skills as MCP tools, resources, prompts with dynamic updates |
| mcpGraph skill | Bob Dickinson | [github.com/TeamSparkAI/mcpGraph](https://github.com/TeamSparkAI/mcpGraph) | Complex skill example for graph orchestration |
| skills-over-mcp | Keith Groves | [github.com/keithagroves/skills-over-mcp](https://github.com/keithagroves/skills-over-mcp) | Example using skills as MCP resources with current MCP primitives |
| chrome-devtools-mcp | Anthropic | [github.com/anthropics/anthropic-quickstarts/…/chrome-devtools-mcp](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-servers/chrome-devtools-mcp) | Real-world example: `skills/` folder requires separate install path |
| NimbleBrain skills repo | NimbleBrain | [github.com/NimbleBrainInc/skills](https://github.com/NimbleBrainInc/skills) | Monorepo with `.skill` artifact format |
| NimbleBrain registry | NimbleBrain | [registry.nimbletools.ai](https://registry.nimbletools.ai/) | Registry with skill metadata support |
| FastMCP 3.0 Skills | FastMCP | [gofastmcp.com/servers/providers/skills](https://gofastmcp.com/servers/providers/skills) | Native skills provider ([#2694](https://github.com/jlowin/fastmcp/issues/2694)) |
| skillsdotnet | Peder HP | [github.com/PederHP/skillsdotnet](https://github.com/PederHP/skillsdotnet) | Exploratory C# implementation compatible with FastMCP 3.0, includes interactive console chat client and sample server |
| PydanticAI Skills | PydanticAI | [pydantic/pydantic-ai#3780](https://github.com/pydantic/pydantic-ai/pull/3780) | Agent skills with tools-based approach |
| mcp-cli | philschmid | [github.com/philschmid/mcp-cli](https://github.com/philschmid/mcp-cli) | Wraps MCP servers as CLI for progressive disclosure |
| mcp-execution | bug-ops | [github.com/bug-ops/mcp-execution](https://github.com/bug-ops/mcp-execution) | Compiles MCP servers into skill packages |
| Astronomer agents | Kaxil Naik | [github.com/astronomer/agents](https://github.com/astronomer/agents) | Skills distribution via MCP for Apache Airflow |
| my-cool-proxy | karashiiro | [github.com/karashiiro/my-cool-proxy](https://github.com/karashiiro/my-cool-proxy) | MCP gateway server with skills as resources via Lua scripts |
| Strands Agents MCP server | AWS | [github.com/strands-agents/mcp-server](https://github.com/strands-agents/mcp-server/) | Docs-as-MCP: TF-IDF search + doc fetch |
| AWS MCP server | AWS | [docs.aws.amazon.com/aws-mcp/…](https://docs.aws.amazon.com/aws-mcp/latest/userguide/understanding-mcp-server-tools.html) | `retrieve_agent_sop` (skills) + `call_aws` (tool) |
| Kiro powers directory | Kiro | [github.com/kirodotdev/powers](https://github.com/kirodotdev/powers/) | Plugin directory bundling skills + MCP servers |

## External Resources

- **Agent Skills Standard:** [agentskills.io](https://agentskills.io/)
- **Anthropic's guidance on progressive disclosure:** [Equipping agents for the real world with agent skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- **"MCP and Skills: Why Not Both?"** (Kurtis Van Gent): [kvg.dev/posts/20260125-skills-and-mcp/](https://kvg.dev/posts/20260125-skills-and-mcp/) — Frames MCP (connectivity) and Skills (context saturation) as complementary; discusses hybrid approaches
- **Conceptual spec visualization** (Keith Groves): [enact-465fb1fc.mintlify.app/specification/draft/server/skills](https://enact-465fb1fc.mintlify.app/specification/draft/server/skills) — "What if" exploration
- **Apache Airflow AIP-91** (MCP integration): [cwiki.apache.org/…/AIP-91+-+MCP](https://cwiki.apache.org/confluence/display/AIRFLOW/AIP-91+-+MCP)
- **llms.txt convention:** [llmstxt.org](https://llmstxt.org/) — Convention for making documentation LLM-accessible; used by [MCPDoc](https://github.com/langchain-ai/mcpdoc) in a way similar to how skills work.
- **AWS Agent SOPs:** [docs.aws.amazon.com/…/agent-sops](https://docs.aws.amazon.com/aws-mcp/latest/userguide/agent-sops.html) — Pre-built operational workflows as skill-like guidance
- **Video background:** [youtube.com/watch?v=CEvIs9y1uog](https://www.youtube.com/watch?v=CEvIs9y1uog)
