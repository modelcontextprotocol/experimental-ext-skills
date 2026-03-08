/**
 * Dynamic MCP Server Loading Example
 *
 * Demonstrates the skill dependency resolution pattern:
 * 1. Connect to a skill server that exposes skills as MCP resources
 * 2. Build a SkillCatalog that discovers available skills
 * 3. Set an onDependenciesRequired callback for dynamic server connections
 * 4. Load a skill with dependencies — the callback fires automatically
 * 5. The host connects the required MCP server on demand
 *
 * This is a TypeScript port of the skillsdotnet DynamicMcpServers sample.
 * See: https://github.com/bradwilson/skillsdotnet/tree/main/samples/DynamicMcpServers
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SkillCatalog } from "@ext-modelcontextprotocol/skills";
import type { SkillDependencyRequest } from "@ext-modelcontextprotocol/skills";

// --- Configuration ---

// Server configs the client host knows about. In a real app this might come from
// a config file, user settings, or a registry. The key point is that the client host
// owns this mapping — the skill library only communicates server names.
const serverConfigs: Record<string, { command: string; args: string[] }> = {
  "everything-server": {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
  },
};

// --- Track dynamically connected MCP servers ---

const connectedServers = new Map<string, Client>();

// --- Helper: connect to an MCP server via stdio ---

async function connectServer(
  name: string,
  config: { command: string; args: string[] },
): Promise<Client> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
  });

  const client = new Client({ name, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

// --- Main ---

async function main() {
  // Determine skill server path (the skills-as-resources example server)
  const skillServerDir =
    process.argv[2] ||
    new URL("../../skills-as-resources/typescript", import.meta.url).pathname;

  console.log("=== Dynamic MCP Server Loading Demo ===\n");

  // 1. Connect to skill server
  console.log(`[host] Connecting to skill server: ${skillServerDir}`);
  const skillTransport = new StdioClientTransport({
    command: "node",
    args: [
      `${skillServerDir}/dist/index.js`,
      "--skills-dir",
      new URL("../../sample-skills", import.meta.url).pathname,
    ],
  });

  const skillClient = new Client({
    name: "dynamic-server-demo",
    version: "1.0.0",
  });
  await skillClient.connect(skillTransport);
  console.log("[host] Connected to skill server.\n");

  // 2. Build skill catalog
  const catalog = await SkillCatalog.create(skillClient);
  console.log(`[host] Discovered ${catalog.skillNames.length} skill(s):`);
  for (const name of catalog.skillNames) {
    console.log(`  - ${name}`);
  }
  console.log();

  // 3. Print skill contexts (what gets injected into system prompts)
  console.log("[host] Skill contexts for system prompt:");
  for (const ctx of catalog.getSkillContexts()) {
    console.log(`  ${ctx}`);
  }
  console.log();

  // 4. Print tool definition
  const toolDef = catalog.getLoadSkillToolDefinition();
  console.log("[host] load_skill tool definition:");
  console.log(JSON.stringify(toolDef, null, 2));
  console.log();

  // 5. Set dependency callback
  catalog.onDependenciesRequired = async (
    request: SkillDependencyRequest,
  ): Promise<boolean> => {
    console.log(
      `\n[host] Skill '${request.skillName}' requires MCP servers: ${request.serverNames.join(", ")}`,
    );

    for (const serverName of request.serverNames) {
      if (connectedServers.has(serverName)) {
        console.log(`[host] '${serverName}' is already connected.`);
        continue;
      }

      const config = serverConfigs[serverName];
      if (!config) {
        console.log(
          `[host] Unknown server '${serverName}' — cannot connect.`,
        );
        return false;
      }

      console.log(`[host] Connecting to '${serverName}'...`);
      try {
        const client = await connectServer(serverName, config);
        connectedServers.set(serverName, client);
        console.log(`[host] Connected to '${serverName}'.`);

        // List tools from the newly connected server
        const toolsResult = await client.listTools();
        console.log(
          `[host] '${serverName}' provides ${toolsResult.tools.length} tool(s):`,
        );
        for (const tool of toolsResult.tools) {
          console.log(`  - ${tool.name}: ${tool.description ?? "(no description)"}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[host] Failed to connect to '${serverName}': ${message}`,
        );
        return false;
      }
    }

    return true;
  };

  // 6. Load a skill with dependencies — triggers the callback
  console.log(
    '\n[host] Loading skill "explore-everything" (has dependencies)...\n',
  );

  try {
    const content = await catalog.loadSkill("explore-everything");
    console.log("[host] Skill loaded successfully!");
    console.log("[host] Skill content preview:");
    console.log(
      content
        .split("\n")
        .slice(0, 10)
        .map((l) => `  ${l}`)
        .join("\n"),
    );
    console.log("  ...");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[host] Failed to load skill: ${message}`);
  }

  // 7. Summary
  console.log("\n=== Summary ===");
  console.log(`Skills discovered: ${catalog.skillNames.length}`);
  console.log(`Servers dynamically connected: ${connectedServers.size}`);
  for (const [name] of connectedServers) {
    console.log(`  - ${name}`);
  }

  // Cleanup
  console.log("\n[host] Cleaning up...");
  for (const [name, client] of connectedServers) {
    console.log(`[host] Disconnecting from '${name}'...`);
    await client.close();
  }
  await skillClient.close();
  console.log("[host] Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
