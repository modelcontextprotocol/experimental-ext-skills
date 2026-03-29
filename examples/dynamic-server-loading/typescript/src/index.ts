#!/usr/bin/env node
/**
 * Dynamic Server Loading Demo
 *
 * Demonstrates the SkillCatalog with on-demand MCP server dependency resolution:
 *
 *   1. Connect to the skills server
 *   2. Build a SkillCatalog — discovers skills, caches frontmatter context
 *   3. Show the load_skill tool definition (model would call this)
 *   4. Load a skill without dependencies — loads immediately
 *   5. Load a skill with dependencies — triggers onDependenciesRequired callback
 *
 * The callback is where a host would dynamically start/connect MCP servers
 * that the skill requires (e.g., filesystem, github).
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SkillCatalog } from "@modelcontextprotocol/ext-skills/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function header(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

async function main() {
  // Connect to the skills server
  const serverPath = path.resolve(
    __dirname,
    "../../../skills-server/typescript/dist/index.js",
  );

  console.log("Connecting to skills-sep-example server...\n");

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "dynamic-loading-demo", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("Connected!\n");

  try {
    // -----------------------------------------------------------------------
    // 1. Build the SkillCatalog
    // -----------------------------------------------------------------------
    header("1. Build SkillCatalog");

    const catalog = await SkillCatalog.create(client as any);

    console.log(`Discovered ${catalog.skillNames.length} skill(s):\n`);
    for (const name of catalog.skillNames) {
      console.log(`  ${catalog.getSkillContext(name)}`);
    }

    // -----------------------------------------------------------------------
    // 2. Show the load_skill tool definition
    // -----------------------------------------------------------------------
    header("2. load_skill Tool Definition");

    console.log("The SkillCatalog generates a tool definition that constrains");
    console.log("the model to only request skills that exist:\n");
    console.log(JSON.stringify(catalog.getLoadSkillToolDefinition(), null, 2));

    // -----------------------------------------------------------------------
    // 3. Show context strings for system prompt injection
    // -----------------------------------------------------------------------
    header("3. Context Strings (for System Prompt)");

    console.log("These lightweight strings (~50-100 tokens each) go into the");
    console.log("system prompt so the model knows what skills are available:\n");
    for (const ctx of catalog.getSkillContexts()) {
      console.log(`  ${ctx}`);
    }

    // -----------------------------------------------------------------------
    // 4. Load a skill without dependencies
    // -----------------------------------------------------------------------
    header("4. Load Skill Without Dependencies");

    console.log("Loading 'code-review' (no dependencies)...\n");
    const content = await catalog.loadSkill("code-review");
    const lines = content.split("\n");
    console.log(lines.slice(0, 15).join("\n"));
    if (lines.length > 15) {
      console.log(`\n... (${lines.length - 15} more lines)`);
    }

    // -----------------------------------------------------------------------
    // 5. Load a skill WITH dependencies — fires callback
    // -----------------------------------------------------------------------
    header("5. Load Skill With Dependencies");

    // Register the dependency resolution callback
    catalog.onDependenciesRequired = async (request) => {
      console.log(`[host] Skill '${request.skillName}' requires servers:`);
      for (const server of request.serverNames) {
        console.log(`  - ${server}`);
      }
      console.log();
      console.log("[host] In production, the host would:");
      console.log("  1. Check if these servers are already connected");
      console.log("  2. Start/connect any missing servers");
      console.log("  3. Return true if all are available, false otherwise");
      console.log();
      console.log("[host] Simulating success — returning true\n");
      return true;
    };

    console.log("Loading 'explore-everything' (requires: filesystem, github)...\n");
    const depContent = await catalog.loadSkill("explore-everything");
    const depLines = depContent.split("\n");
    console.log(depLines.slice(0, 15).join("\n"));
    if (depLines.length > 15) {
      console.log(`\n... (${depLines.length - 15} more lines)`);
    }

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    header("Demo Complete");

    console.log("Features demonstrated:");
    console.log("  - SkillCatalog: discover + cache skills from MCP server");
    console.log("  - Context strings: lightweight frontmatter for system prompt");
    console.log("  - load_skill tool: model-callable with enum constraint");
    console.log("  - Dependency resolution: onDependenciesRequired callback");
    console.log("  - Dynamic server loading: host connects servers on demand");
    console.log();
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
