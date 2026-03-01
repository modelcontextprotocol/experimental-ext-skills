#!/usr/bin/env node
/**
 * Skills Workaround Patterns — Combined MCP Server
 *
 * Demonstrates four workaround patterns for making skills discoverable
 * by MCP clients that do not yet support `read_resource`. All four
 * patterns are active simultaneously, layered on top of the canonical
 * resources-only approach.
 *
 * Patterns implemented:
 *
 *   1. Server Instructions — skill catalog injected into the system prompt
 *      via the `instructions` server option. Clients that support server
 *      instructions (Claude Code, Cursor, etc.) see skills automatically.
 *
 *   2. Tool Description Catalog — a `skill` tool whose description embeds
 *      the full <available_skills> XML. The model sees the catalog when it
 *      reads the tool list and calls the tool by name to load content.
 *
 *   3. Load Skill Tool — a simpler `load_skill` tool with just skill names
 *      in the description. Minimal overhead, relies on name recognition.
 *
 *   4. MCP Prompts — per-skill prompts (e.g., `/skill-code-review`) that
 *      return SKILL.md content as embedded resources, plus a `/skills`
 *      summary prompt listing all available skills.
 *
 * All patterns coexist: the server registers skill:// resources (the
 * canonical path) alongside instructions, tools, and prompts so that
 * every client gets the best experience its capabilities allow.
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  generateSkillsXML,
  loadSkillContent,
} from "@ext-modelcontextprotocol/skills";

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
});
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../../../sample-skills");

// ---------------------------------------------------------------------------
// Skill discovery
// ---------------------------------------------------------------------------

const skillMap = discoverSkills(skillsDir);

console.error(
  `[workaround-patterns] Discovered ${skillMap.size} skill(s): ${Array.from(skillMap.keys()).join(", ") || "none"}`
);
for (const [name, skill] of skillMap) {
  console.error(`  - ${name}: ${skill.description}`);
}

// ---------------------------------------------------------------------------
// Pattern 1 — Server Instructions
//
// The skill catalog is embedded in the server's instructions field, which
// clients inject into the system prompt during initialization.
// ---------------------------------------------------------------------------

const preamble =
  "# Skills\n\n" +
  "When a user's task matches a skill description below: " +
  "1) activate it, 2) follow its instructions completely.\n\n";

const instructionsText = preamble + generateSkillsXML(skillMap);

// ---------------------------------------------------------------------------
// Create MCP server (all capabilities enabled)
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "skills-workaround-patterns", version: "0.1.0" },
  {
    capabilities: { resources: {}, tools: {}, prompts: {} },
    instructions: instructionsText,
  }
);

// ---------------------------------------------------------------------------
// Resources — canonical skill:// resources via SDK
//
// Forward-compatible: clients with read_resource support get the standard
// experience regardless of which workaround patterns are also active.
// ---------------------------------------------------------------------------

registerSkillResources(server, skillMap, skillsDir);

// ---------------------------------------------------------------------------
// Pattern 2 — Tool Description Catalog
//
// A `skill` tool whose description embeds the full <available_skills> XML.
// The model sees the catalog when it reads the tool list and calls the tool
// by name to load a skill's full SKILL.md content.
// ---------------------------------------------------------------------------

const catalogXml = generateSkillsXML(skillMap);
const toolDescription = [
  "Load an agent skill by name.",
  "",
  "When a user's task matches a skill description below, call this tool",
  "with the skill name to load its full instructions.",
  "",
  catalogXml,
].join("\n");

server.registerTool(
  "skill",
  {
    description: toolDescription,
    inputSchema: {
      name: z.string().describe("Name of the skill to load"),
    },
  },
  async (args) => {
    const skill = skillMap.get(args.name);
    if (!skill) {
      const available = Array.from(skillMap.keys()).join(", ") || "none";
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${args.name}" not found. Available: ${available}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const content = loadSkillContent(skill.path, skillsDir);
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to load skill "${args.name}": ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Pattern 3 — Load Skill Tool
//
// A simpler `load_skill` tool with just skill names listed in the
// description. Less informative than the catalog approach but minimal
// description overhead.
// ---------------------------------------------------------------------------

const names = Array.from(skillMap.keys());

server.registerTool(
  "load_skill",
  {
    description: `Load an agent skill by name. Available: ${names.join(", ") || "none"}`,
    inputSchema: {
      name: z.string().describe("Name of the skill to load"),
    },
  },
  async (args) => {
    const skill = skillMap.get(args.name);
    if (!skill) {
      const available = Array.from(skillMap.keys()).join(", ") || "none";
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${args.name}" not found. Available: ${available}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const content = loadSkillContent(skill.path, skillsDir);
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to load skill "${args.name}": ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Pattern 4 — MCP Prompts
//
// Per-skill prompts (e.g., /skill-code-review) return the full SKILL.md
// content as an embedded resource. A /skills summary prompt lists all
// available skills. User-controlled: the model cannot self-discover skills
// without the client surfacing the prompt list.
// ---------------------------------------------------------------------------

// Summary prompt: /skills
server.registerPrompt(
  "skills",
  { description: "List all available agent skills" },
  async () => {
    const lines = ["# Available Skills\n"];
    for (const [name, skill] of skillMap) {
      lines.push(`- **${name}**: ${skill.description}`);
    }
    lines.push(
      "\nTo activate a skill, use its corresponding prompt (e.g., `/skill-code-review`)."
    );
    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: lines.join("\n") },
        },
      ],
    };
  }
);

// Per-skill prompts: /skill-{name}
for (const [name, skill] of skillMap) {
  const skillName = name;
  const skillPath = skill.path;

  server.registerPrompt(
    `skill-${skillName}`,
    { description: `Activate the "${skillName}" skill: ${skill.description}` },
    async () => {
      try {
        const content = loadSkillContent(skillPath, skillsDir);
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "resource" as const,
                resource: {
                  uri: `skill://${skillName}/SKILL.md`,
                  mimeType: "text/markdown",
                  text: content,
                },
              },
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Failed to load skill "${skillName}": ${message}`,
              },
            },
          ],
        };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[workaround-patterns] Server connected via stdio");
