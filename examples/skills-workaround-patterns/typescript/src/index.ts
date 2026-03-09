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
 *   1. Server Instructions (opt-in) — skill descriptions catalog injected
 *      into the system prompt via the `instructions` server option. Enabled
 *      with --use-static-server-instructions. Clients that support server
 *      instructions (Claude Code, Cursor, etc.) see skills automatically.
 *
 *   2. Tool Description Catalog — a `load_skill` tool whose description embeds
 *      the full <available_skills> XML. The model sees the catalog when it
 *      reads the tool list and calls the tool by name to load content.
 *      Aligned with skilljack-mcp's tool interface.
 *
 *   3. MCP Prompts — per-skill prompts (e.g., `/skill-code-review`) that
 *      return SKILL.md content as embedded resources, plus a `/skills`
 *      summary prompt listing all available skills.
 *
 * All patterns coexist: the server registers skill:// resources (the
 * canonical path) alongside instructions, tools, and prompts so that
 * every client gets the best experience its capabilities allow.
 *
 * Flags:
 *   --use-static-server-instructions
 *       Embed the skill descriptions catalog in the server's instructions
 *       field. The model sees skill names and descriptions in the system
 *       prompt and can call tools to load full content on demand.
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
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "use-static-server-instructions": { type: "boolean", default: false },
  },
});
const useStaticServerInstructions = values["use-static-server-instructions"];
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
if (useStaticServerInstructions) {
  console.error("[workaround-patterns] --use-static-server-instructions enabled");
}

// ---------------------------------------------------------------------------
// Pattern 1 — Server Instructions (opt-in via --use-static-server-instructions)
//
// When enabled, the skill descriptions catalog is embedded in the server's
// instructions field, which clients inject into the system prompt during
// initialization. The model sees skill names and descriptions upfront and
// can call tools to load full content on demand.
// ---------------------------------------------------------------------------

let instructionsText: string | undefined;

if (useStaticServerInstructions) {
  const preamble =
    "# Skills\n\n" +
    "When a user's task matches a skill description below: " +
    "1) activate it, 2) follow its instructions completely.\n\n";

  instructionsText = preamble + generateSkillsXML(skillMap);
}

// ---------------------------------------------------------------------------
// Create MCP server (all capabilities enabled)
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "skills-workaround-patterns", version: "0.1.0" },
  {
    capabilities: { resources: {}, tools: {}, prompts: {} },
    ...(instructionsText ? { instructions: instructionsText } : {}),
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
// Pattern 2 — Skill Tool (aligned with skilljack-mcp)
//
// A `skill` tool whose description embeds the full <available_skills> XML.
// The model sees the catalog when it reads the tool list and calls the tool
// by name to load a skill's full SKILL.md content.
//
// When --use-static-server-instructions is set, the catalog lives in server
// instructions instead, so the tool description is kept minimal to avoid
// duplication.
// ---------------------------------------------------------------------------

const skillToolUsage =
  "Load a skill's full instructions. Returns the complete SKILL.md content " +
  "with step-by-step guidance, examples, and file references to follow.\n\n" +
  "IMPORTANT: When a skill is relevant to the user's task, you must invoke this tool " +
  "IMMEDIATELY as your first action. NEVER just announce or mention a skill without " +
  "actually calling this tool. This is a BLOCKING REQUIREMENT: invoke this tool BEFORE " +
  "generating any other response about the task.\n\n";

const toolDescription = useStaticServerInstructions
  ? skillToolUsage + "See server instructions for available skills."
  : skillToolUsage + generateSkillsXML(skillMap);

server.registerTool(
  "load_skill",
  {
    title: "Activate Skill",
    description: toolDescription,
    inputSchema: {
      name: z.string().describe("Skill name from <available_skills>"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
            text: `Skill "${args.name}" not found. Available skills: ${available}`,
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
// Pattern 3 — MCP Prompts
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
