# Use Cases

## 1. Complex Workflow Orchestration

Skills that teach agents how to perform multi-step workflows that they wouldn't know how to execute from tool descriptions alone.

**Example:** Bob Dickinson's [mcpGraph](https://github.com/TeamSparkAI/mcpGraph) toolkit requires a [skill file of 875+ lines](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) to instruct agents on building directed graphs of MCP nodes. This orchestration logic is "way more than you'd want to put in instructions."

**Community input:**

> "Skills may define how to use tools, possibly from different servers, to accomplish complex workflows requiring contextual reasoning that could not be coded with MCP tools." — [Daniele Martinoli](https://github.com/dmartinol)

## 2. Conditional Workflows

Workflows that reference tools conditionally based on context, requiring rich structured instructions that can be dynamically loaded.

**Example:** A skill that guides an agent through different branches of a debugging workflow depending on the type of error encountered, loading relevant sub-instructions only when needed.

## 3. Multi-Server Composition

Skills that leverage tools from multiple off-the-shelf servers where you can't (or don't want to) modify their individual instructions.

**Community input:**

> "I think there might also be a subtle difference between the kind of skill that allows you to orchestrate a set of tools, possibly from different servers, to do something the agent wouldn't have necessarily known how to do without the skill (more of a skill registry issue), and the 'you're pretty much going to need this skill to make use of this server at all' (an MCP server registry issue, maybe)." — [Bob Dickinson](https://github.com/TeamSparkAI)

> "The ecosystem has been too focused on the server being the main deliverable in some ways, and actually there's a lot that can be done in terms of composition that we miss by people generally imagining their code as being the server boundary and not providing functionality more as a library." — [Sam Morrow](https://github.com/SamMorrowDrums)

## 4. Progressive Disclosure

Skills broken into linked sets of files for effective context management, loaded progressively as the agent needs them rather than all at once.

**Community input:**

> "Especially mimicking progressive disclosure via resources and dynamically adding new ones as the agent reads pieces of the skill has been quite handy!" — [Ozz / Juan Antonio Osorio](https://github.com/JAORMX)

**Related:** [Anthropic's guidance on progressive disclosure](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

## 5. Server-Skill Pairing

Servers that are difficult or impossible to use effectively without an accompanying skill.

**Community input:**

> "Clients of the registry presumably understand MCP, but there is no guarantee that they understand skills. So if it is going to be hard for an agent to use the server without the 'skill' then doesn't it make sense for the MCP server to contain all the instructions necessary to use it?" — [Cliff Hall](https://github.com/cliffhall)

**Example:** [chrome-devtools-mcp](https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-servers/chrome-devtools-mcp) ships with a skills/ folder that requires a separate install path from the MCP server itself.

## 6. Skill Versioning and Updates

Skills that evolve over time and need version-aware distribution.

**Community input:**

> "I'd like for skills over MCP to enable the client to make use of the version attribute... If a skill stored locally has an older version than the skill seen on the MCP server, the client can download the latest skill on the spot." — [woweow](https://github.com/woweow)

## 7. Enterprise Integration

Organizations building official MCP servers for established platforms are looking to skills as a distribution mechanism for domain-specific workflow guidance.

**Community input:**

> "As part of Apache Airflow community, we are planning to build our official MCP Server... and I am specifically interested in integrating Skills as part of the MCP protocol." — [Kaxil Naik](https://github.com/kaxil)

**Related:** [Apache Airflow AIP-91 (MCP integration)](https://cwiki.apache.org/confluence/display/AIRFLOW/AIP-91+-+MCP)

## 8. Version-Adaptive Skill Content

Skills whose instructions and examples dynamically adapt based on the platform or framework version in use, rather than versioning the skill artifact itself.

**Example:** Apache Airflow 2.x and 3.x have substantially different APIs, operators, and recommended patterns. A version-adaptive skill detects which Airflow version is running and returns only the relevant guidance — e.g., `TaskFlow` decorators in 2.x vs. updated `Asset`-based patterns in 3.x — so the agent never suggests deprecated or unavailable APIs.

**Community input:**

> "As a SaaS company (Astronomer) building on Airflow, we need skills that adapt their content based on the Airflow version the customer is running. A skill that returns Airflow 2.x guidance to an Airflow 3.x user is worse than no skill at all. While skill reference files are valuable, a single version-aware skill that delivers tailored guidance is far more useful than hundreds of reference files where Airflow 2 and 3 diverge — best practices, recommended operators, and even DAG authoring patterns look fundamentally different between the two." — [Kaxil Naik](https://github.com/kaxil)

## 9. Commercial Multi-Tenant Skills

SaaS companies serving per-user skill content that varies by subscription tier, role, or tenant — with auditing, logging, and RBAC governing what each user can access.

**Example:** A SaaS platform exposes the same MCP server endpoint to all customers, but a free-tier user receives basic workflow guidance while an enterprise user gets advanced optimization skills, custom operator libraries, and tenant-specific configuration — all controlled through RBAC policies and audit-logged per request.

**Community input:**

> "At Astronomer we need to serve different skill content to different customers based on their subscription tier and role, with full audit logging. This goes beyond enterprise adoption — it's about multi-tenant commercial delivery of skills with fine-grained access control." — [Kaxil Naik](https://github.com/kaxil)
