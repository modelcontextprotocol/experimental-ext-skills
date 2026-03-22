#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Server
 *
 * Demonstrates the Skills Extension SEP with:
 *   - Extension declaration: io.modelcontextprotocol/skills (SEP-2133)
 *   - Multi-segment skill paths: prefix + name (final segment = frontmatter name)
 *   - SEP-2093 features: resources/metadata, scoped resources/list,
 *     per-resource capabilities via _meta
 *   - skill:// URI scheme with recursive discovery
 *
 * URI scheme:
 *   - skill://{skillPath}/SKILL.md     — Skill content (listed resource)
 *   - skill://{skillPath}/_manifest    — File manifest with SHA256 hashes
 *   - skill://{+skillFilePath}         — Supporting files (resource template)
 *   - skill://prompt-xml               — XML for system prompt injection
 *
 * Example skill URIs with multi-segment paths:
 *   - skill://code-review/SKILL.md              (single-segment, backward compat)
 *   - skill://acme/billing/refunds/SKILL.md     (multi-segment, name = last segment)
 *   - skill://acme/onboarding/SKILL.md          (multi-segment)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  registerMetadataHandler,
  overrideResourcesListWithScoping,
  declareSkillsExtension,
} from "@modelcontextprotocol/ext-skills/server";
import type { ServerInternals } from "@modelcontextprotocol/ext-skills/server";

// Parse CLI arguments: [skillsDir]
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
});
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../../../sample-skills");

// --- Discover skills recursively ---

const skillMap = discoverSkills(skillsDir);

console.error(
  `[skills-server] Discovered ${skillMap.size} skill(s) in ${skillsDir}:`,
);
for (const [skillPath, skill] of skillMap) {
  const nameInfo =
    skill.name !== skillPath ? ` (name: "${skill.name}")` : "";
  const fileCount = skill.manifest.files.length;
  console.error(
    `  - skill://${skillPath}/SKILL.md${nameInfo} — ${fileCount} file(s)`,
  );
}

// --- Create MCP server ---

const server = new McpServer(
  { name: "skills-sep-example", version: "0.1.0" },
  { capabilities: { resources: {} } },
);

// Cast to access low-level Server internals for SEP shims.
// These workarounds can be removed once the SDK supports:
//   - extensions in capabilities (typescript-sdk#1630)
//   - uri parameter on resources/list (SEP-2093)
const lowLevelServer = server.server as unknown as ServerInternals;

// --- Declare extension per SEP-2133 ---

// Patches capabilities to include:
//   extensions: { "io.modelcontextprotocol/skills": {} }
declareSkillsExtension(lowLevelServer);

// --- Register skill resources via SDK ---

registerSkillResources(server, skillMap, skillsDir, {
  template: true,
  promptXml: true,
});

// --- Override resources/list with URI scoping (SEP-2093) ---

// Wraps the McpServer's built-in resources/list handler to add:
//   resources/list(uri="skill://") → only SKILL.md entries under that prefix
overrideResourcesListWithScoping(lowLevelServer);

// --- Register resources/metadata (SEP-2093) ---

registerMetadataHandler(lowLevelServer, skillMap);

console.error("[skills-server] Extension: io.modelcontextprotocol/skills");
console.error("[skills-server] SEP-2093 handlers:");
console.error("  - resources/list with uri scoping");
console.error("  - resources/metadata");

// --- Connect via stdio transport ---

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-server] Connected via stdio");
