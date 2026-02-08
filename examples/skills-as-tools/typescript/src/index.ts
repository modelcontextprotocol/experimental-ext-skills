#!/usr/bin/env node
/**
 * Skills as Tools — MCP Server (TypeScript)
 *
 * A minimal reference implementation demonstrating Approach 3 from the
 * Skills Over MCP Interest Group: exposing agent skills via MCP tools.
 *
 * Exposes two tools:
 *   - list_skills: Returns skill names and descriptions (progressive disclosure)
 *   - read_skill:  Returns the full SKILL.md content for a named skill
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { discoverSkills, loadSkillContent } from "./skill-discovery.js";
import type { SkillSummary } from "./types.js";

// Resolve skills directory from CLI arg or default to ../sample-skills
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../../sample-skills");

// Discover skills at startup
const skillMap = discoverSkills(skillsDir);
const skillNames = Array.from(skillMap.keys());

console.error(
  `[skills-as-tools] Discovered ${skillMap.size} skill(s): ${skillNames.join(", ") || "none"}`
);

// Create MCP server with tools.listChanged capability
const server = new McpServer(
  { name: "skills-as-tools-example", version: "0.1.0" },
  { capabilities: { tools: { listChanged: true } } }
);

// Tool 1: list_skills — progressive disclosure (summaries only)
server.registerTool(
  "list_skills",
  {
    title: "List Available Skills",
    description:
      "List all available skills with their names and descriptions. " +
      `Currently available: ${skillNames.join(", ") || "none"}`,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const summaries: SkillSummary[] = Array.from(skillMap.values()).map(
      (s) => ({
        name: s.name,
        description: s.description,
      })
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summaries, null, 2),
        },
      ],
    };
  }
);

// Tool 2: read_skill — load full SKILL.md content on demand
server.registerTool(
  "read_skill",
  {
    title: "Read Skill Instructions",
    description:
      "Read the full instructions for a specific skill by name. " +
      "Returns the complete SKILL.md content with step-by-step guidance.",
    inputSchema: z.object({
      name: z.string().describe("The skill name to read (from list_skills)"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args) => {
    const { name } = args;

    // Security: lookup by key only — never construct paths from user input
    const skill = skillMap.get(name);

    if (!skill) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${name}" not found. Available skills: ${skillNames.join(", ") || "none"}`,
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
            text: `Failed to load skill "${name}": ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-as-tools] Server connected via stdio");
