#!/usr/bin/env node
/**
 * Skills as Resources — MCP Server (TypeScript)
 *
 * A reference implementation demonstrating the Resources approach
 * from the Skills Over MCP Interest Group: exposing agent skills via
 * MCP resources using the skill:// URI scheme, with a load_skill tool
 * for model-controlled progressive disclosure.
 *
 * URI scheme (aligned with skillsdotnet conventions):
 *   - skill://{name}/SKILL.md   — Skill content (listed resource)
 *   - skill://{name}/_manifest  — File inventory with SHA256 hashes (listed resource)
 *   - skill://{name}/{+path}    — Supporting file (resource template, not listed)
 *   - skill://prompt-xml        — XML for system prompt injection (optional)
 *
 * Tool:
 *   - load_skill                — Model-controlled skill loading (progressive disclosure)
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 * - SkillsDotNet by Brad Wilson (https://github.com/bradwilson/skillsdotnet)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverSkills, loadSkillContent, loadDocument } from "./skill-discovery.js";
import { generateSkillsXML, isTextMimeType } from "./resource-helpers.js";

// Resolve skills directory from CLI arg or default to ../sample-skills
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../../sample-skills");

// Discover skills at startup
const skillMap = discoverSkills(skillsDir);
const skillNames = Array.from(skillMap.keys());
const skillListStr = skillNames.join(", ") || "none";

console.error(
  `[skills-as-resources] Discovered ${skillMap.size} skill(s): ${skillListStr}`
);
for (const [name, skill] of skillMap) {
  const fileCount = skill.manifest.files.length;
  console.error(`  - ${name}: ${fileCount} file(s) in manifest`);
}

// Create MCP server with resources and tools capabilities
const server = new McpServer(
  { name: "skills-as-resources-example", version: "0.2.0" },
  { capabilities: { resources: { listChanged: true }, tools: {} } }
);

// --- Static resources ---

// Resource: skill://prompt-xml — XML for system prompt injection (optional convenience)
server.registerResource(
  "skills-prompt-xml",
  "skill://prompt-xml",
  {
    description:
      "XML representation of available skills for injecting into system prompts",
    mimeType: "application/xml",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: generateSkillsXML(skillMap),
      },
    ],
  })
);

// Per-skill static resources
for (const [name, skill] of skillMap) {
  // Resource: skill://{name}/SKILL.md — skill content (listed)
  server.registerResource(
    `skill-${name}`,
    `skill://${name}/SKILL.md`,
    {
      description: skill.description,
      mimeType: "text/markdown",
    },
    async (uri) => {
      try {
        const content = loadSkillContent(skill.path, skillsDir);
        return {
          contents: [{ uri: uri.href, text: content }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error\n\nFailed to load skill "${name}": ${message}`,
            },
          ],
        };
      }
    }
  );

  // Resource: skill://{name}/_manifest — file inventory with SHA256 hashes (listed)
  server.registerResource(
    `skill-${name}-manifest`,
    `skill://${name}/_manifest`,
    {
      description: `File manifest for skill '${name}' with content hashes`,
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: skill.manifestJson,
        },
      ],
    })
  );
}

// --- Resource template for supporting files ---

// Template: skill://{skillName}/{+path}
// The {+} prefix uses RFC 6570 reserved expansion, matching paths with slashes.
// NOT listed — supporting files are discoverable via the _manifest resource.
server.registerResource(
  "skill-file",
  new ResourceTemplate("skill://{skillName}/{+path}", {
    list: undefined,
    complete: {
      skillName: (value) => {
        return Array.from(skillMap.values())
          .filter((s) => s.documents.length > 0)
          .map((s) => s.name)
          .filter((name) => name.startsWith(value));
      },
      path: (value, context) => {
        const skillName = context?.arguments?.skillName;
        if (!skillName) return [];

        const skill = skillMap.get(skillName);
        if (!skill) return [];

        // SDK's createCompletionResult handles truncation to 100 and sets total/hasMore
        return skill.documents
          .map((d) => d.path)
          .filter((p) => p.startsWith(value));
      },
    },
  }),
  {
    description: "Fetch a supporting file from a skill directory",
    mimeType: "text/plain",
  },
  async (uri, variables) => {
    const skillName = Array.isArray(variables.skillName)
      ? variables.skillName[0]
      : variables.skillName;
    const filePath = Array.isArray(variables.path)
      ? variables.path[0]
      : variables.path;

    const skill = skillMap.get(skillName);
    if (!skill) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nSkill "${skillName}" not found. Available: ${skillListStr}`,
          },
        ],
      };
    }

    const doc = skill.documents.find((d) => d.path === filePath);
    if (!doc) {
      const available = skill.documents.map((d) => `- ${d.path}`).join("\n");
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nFile "${filePath}" not found in skill "${skillName}".\n\n## Available Files\n\n${available || "No supporting files available."}`,
          },
        ],
      };
    }

    try {
      const isText = isTextMimeType(doc.mimeType);
      const content = loadDocument(skill, filePath, skillsDir, isText);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: doc.mimeType,
            ...content,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nFailed to read file: ${message}`,
          },
        ],
      };
    }
  }
);

// --- Tool for model-controlled progressive disclosure ---

// Tool: load_skill — allows models to discover and load skills on demand.
// Description dynamically lists available skill names, mirroring
// skillsdotnet's SkillCatalog pattern but implemented server-side.
server.registerTool(
  "load_skill",
  {
    description:
      `Load the full SKILL.md content for a named skill. ` +
      `Use this when you need detailed instructions for performing a specific task. ` +
      `Available skills: ${skillListStr}`,
    inputSchema: {
      skillName: z.string().describe("The name of the skill to load"),
    },
  },
  async ({ skillName }) => {
    const skill = skillMap.get(skillName);
    if (!skill) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Skill "${skillName}" not found. Available skills: ${skillListStr}`,
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
            text: `Failed to load skill "${skillName}": ${message}`,
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
console.error("[skills-as-resources] Server connected via stdio");
