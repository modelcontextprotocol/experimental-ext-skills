#!/usr/bin/env node
/**
 * Skills as Resources — MCP Server (TypeScript)
 *
 * A reference implementation demonstrating the Resources approach
 * from the Skills Over MCP Interest Group: exposing agent skills via
 * MCP resources using the skill:// URI scheme.
 *
 * URI scheme (aligned with skillsdotnet conventions):
 *   - skill://{name}/SKILL.md   — Skill content (listed resource)
 *   - skill://{name}/_manifest  — File inventory with SHA256 hashes (listed resource)
 *   - skill://{name}/{+path}    — Supporting file (resource template, not listed)
 *   - skill://prompt-xml        — XML for system prompt injection (optional)
 *
 * Clients are expected to:
 *   - Scan resources/list for skill://{name}/SKILL.md URIs to discover skills
 *   - Parse frontmatter for name + description to build context summaries
 *   - Provide a read_resource tool so the model can load skills on demand
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  discoverSkills,
  registerSkillResources,
} from "@modelcontextprotocol/ext-skills/server";
import type { SkillResourceHandles } from "@modelcontextprotocol/ext-skills";
import { createSubscriptionManager } from "./subscriptions.js";
import { createSkillDirectoryWatcher } from "./skill-watcher.js";

// Parse CLI arguments: [skillsDir]
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
});
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../../../sample-skills");

// Discover skills at startup
const skillMap = discoverSkills(skillsDir);

console.error(
  `[skills-as-resources] Discovered ${skillMap.size} skill(s): ${Array.from(skillMap.keys()).join(", ") || "none"}`
);
for (const [name, skill] of skillMap) {
  const fileCount = skill.manifest.files.length;
  console.error(`  - ${name}: ${fileCount} file(s) in manifest`);
}

// Create MCP server with resources capabilities
const server = new McpServer(
  { name: "skills-as-resources-example", version: "0.2.0" },
  { capabilities: { resources: { listChanged: true, subscribe: true } } }
);

// --- Register all skill resources via SDK ---

// registerSkillResources closes over skillMap by reference, so dynamic
// mutations (add/delete) are reflected in template completions and prompt-xml.
const resourceHandles: SkillResourceHandles = registerSkillResources(
  server,
  skillMap,
  skillsDir,
  { template: true, promptXml: true },
);

// --- Resource subscriptions ---

// Watch subscribed skill files and notify on changes.
const subscriptions = createSubscriptionManager(
  skillMap,
  skillsDir,
  (uri) => { server.server.sendResourceUpdated({ uri }); },
);

server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  subscriptions.subscribe(request.params.uri);
  return {};
});

server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  subscriptions.unsubscribe(request.params.uri);
  return {};
});

// --- Directory watcher for dynamic skill discovery ---

// Watch skillsDir for structural changes (new/removed skill directories)
// and update the resource list + notify clients via resources/listChanged.
const directoryWatcher = createSkillDirectoryWatcher(skillsDir, () => {
  const newSkillMap = discoverSkills(skillsDir);

  // Find removed skills
  for (const name of skillMap.keys()) {
    if (!newSkillMap.has(name)) {
      const handles = resourceHandles.get(name);
      if (handles) {
        handles.skill.remove();
        handles.manifest.remove();
        resourceHandles.delete(name);
      }
      subscriptions.unsubscribeByPrefix(`skill://${name}/`);
      skillMap.delete(name);
      console.error(`[skills-as-resources] Skill removed: ${name}`);
    }
  }

  // Find added skills — register via SDK with single-entry map
  for (const [name, metadata] of newSkillMap) {
    if (!skillMap.has(name)) {
      skillMap.set(name, metadata);
      const singleMap = new Map([[name, metadata]]);
      const newHandles = registerSkillResources(server, singleMap, skillsDir, {
        template: false,  // Already registered at startup
        promptXml: false,  // Already registered (and reads from skillMap by ref)
      });
      resourceHandles.set(name, newHandles.get(name)!);
      console.error(
        `[skills-as-resources] Skill added: ${name} (${metadata.manifest.files.length} file(s))`
      );
    }
  }
});

// Clean up watchers on exit
process.on("SIGINT", () => {
  directoryWatcher.close();
  subscriptions.close();
  process.exit(0);
});

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-as-resources] Server connected via stdio");
