# Dynamic MCP Server Loading Example

Demonstrates the **skill dependency resolution** pattern — a TypeScript port of the
[skillsdotnet DynamicMcpServers sample](https://github.com/bradwilson/skillsdotnet/tree/main/samples/DynamicMcpServers).

## How It Works

1. A skill server exposes skills as MCP resources (using the Skills as Resources pattern)
2. The client builds a `SkillCatalog` that discovers all available skills
3. Skills can declare MCP server dependencies in their YAML frontmatter:
   ```yaml
   dependencies: [everything-server]
   ```
4. When a skill with dependencies is loaded via `catalog.loadSkill()`, the catalog fires
   the `onDependenciesRequired` callback
5. The client host connects the required MCP servers dynamically
6. Tools from the newly connected servers become available

## Running

```bash
# 1. Build the SDK
cd typescript/sdk && npm install && npm run build

# 2. Build the skill server
cd examples/skills-as-resources/typescript && npm install && npm run build

# 3. Build and run this example
cd examples/dynamic-server-loading/typescript
npm install
npm run build
npm start
```

## Architecture

```
Client Host (this example)
  │
  ├── SkillCatalog
  │     ├── addClient(skillServer) → discovers skills
  │     ├── onDependenciesRequired → callback fires when loading skill with deps
  │     └── loadSkill("explore-everything") → triggers dependency resolution
  │
  ├── Skill Server (skills-as-resources)
  │     └── skill://explore-everything/SKILL.md
  │           frontmatter: dependencies: [everything-server]
  │
  └── Everything Server (connected dynamically)
        └── echo, add, sampleLLM, ... (tools become available)
```

## Key Pattern

The client host owns the mapping from server names to connection configs.
The skill library only communicates server names — it never creates connections itself.
This keeps the dependency resolution pattern generic and host-agnostic.
