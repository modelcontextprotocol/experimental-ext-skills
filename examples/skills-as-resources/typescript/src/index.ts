#!/usr/bin/env node
/**
 * Skills as Resources — MCP Server (TypeScript)
 *
 * A minimal reference implementation demonstrating the Resources approach
 * from the Skills Over MCP Interest Group: exposing agent skills via
 * MCP resources using the skill:// URI scheme.
 *
 * Exposes resources:
 *   - skill://index              — JSON index of all available skills
 *   - skill://prompt-xml         — XML for system prompt injection
 *   - skill://{name}             — Individual skill SKILL.md content
 *   - skill://{name}/documents   — List of supplementary files
 *   - skill://{name}/document/{+documentPath} — Individual document (template)
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverSkills, loadSkillContent, loadDocument } from "./skill-discovery.js";
import { generateSkillsXML } from "./resource-helpers.js";
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
  `[skills-as-resources] Discovered ${skillMap.size} skill(s): ${skillNames.join(", ") || "none"}`
);
for (const [name, skill] of skillMap) {
  if (skill.documents.length > 0) {
    console.error(
      `  - ${name}: ${skill.documents.length} document(s)`
    );
  }
}

// Create MCP server with resources.listChanged capability
const server = new McpServer(
  { name: "skills-as-resources-example", version: "0.1.0" },
  { capabilities: { resources: { listChanged: true } } }
);

// --- Static resources ---

// Resource: skill://index — JSON index of all available skills
server.registerResource(
  "skills-index",
  "skill://index",
  {
    description:
      "Index of all available skills with their descriptions, URIs, and document counts. " +
      `Currently available: ${skillNames.join(", ") || "none"}`,
    mimeType: "application/json",
  },
  async (uri) => {
    const index: SkillSummary[] = Array.from(skillMap.values()).map((s) => ({
      name: s.name,
      description: s.description,
      uri: `skill://${s.name}`,
      ...(s.documents.length > 0 && {
        documentsUri: `skill://${s.name}/documents`,
      }),
      documentCount: s.documents.length,
      ...(s.metadata && { metadata: s.metadata }),
    }));

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(index, null, 2),
        },
      ],
    };
  }
);

// Resource: skill://prompt-xml — XML for system prompt injection
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
  // Resource: skill://{name} — individual skill SKILL.md content
  server.registerResource(
    `skill-${name}`,
    `skill://${name}`,
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

  // Resource: skill://{name}/documents — list of supplementary files
  if (skill.documents.length > 0) {
    server.registerResource(
      `skill-${name}-documents`,
      `skill://${name}/documents`,
      {
        description: `List of supplementary documents for the ${name} skill`,
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                skill: name,
                documents: skill.documents.map((doc) => ({
                  path: doc.path,
                  mimeType: doc.mimeType,
                  size: doc.size,
                  uri: `skill://${name}/document/${doc.path}`,
                })),
              },
              null,
              2
            ),
          },
        ],
      })
    );
  }
}

// --- Dynamic resource template ---

// Template: skill://{skillName}/document/{+documentPath}
// The {+} prefix uses RFC 6570 reserved expansion, matching paths with slashes
server.registerResource(
  "skill-document",
  new ResourceTemplate("skill://{skillName}/document/{+documentPath}", {
    list: async () => {
      const resources = Array.from(skillMap.values()).flatMap((skill) =>
        skill.documents.map((doc) => ({
          uri: `skill://${skill.name}/document/${doc.path}`,
          name: `${skill.name}/${doc.path}`,
          description: `Document from ${skill.name} skill`,
          mimeType: doc.mimeType,
        }))
      );
      return { resources };
    },
    complete: {
      skillName: (value) => {
        return Array.from(skillMap.values())
          .filter((s) => s.documents.length > 0)
          .map((s) => s.name)
          .filter((name) => name.startsWith(value));
      },
      documentPath: (value, context) => {
        const skillName = context?.arguments?.skillName;
        if (!skillName) return [];

        const skill = skillMap.get(skillName);
        if (!skill) return [];

        return skill.documents
          .map((d) => d.path)
          .filter((p) => p.startsWith(value));
      },
    },
  }),
  {
    description: "Fetch a specific supplementary document from a skill",
    mimeType: "text/plain",
  },
  async (uri, variables) => {
    const skillName = Array.isArray(variables.skillName)
      ? variables.skillName[0]
      : variables.skillName;
    const documentPath = Array.isArray(variables.documentPath)
      ? variables.documentPath[0]
      : variables.documentPath;

    const skill = skillMap.get(skillName);
    if (!skill) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nSkill "${skillName}" not found. Available: ${skillNames.join(", ") || "none"}`,
          },
        ],
      };
    }

    const doc = skill.documents.find((d) => d.path === documentPath);
    if (!doc) {
      const available = skill.documents.map((d) => `- ${d.path}`).join("\n");
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nDocument "${documentPath}" not found in skill "${skillName}".\n\n## Available Documents\n\n${available || "No documents available."}`,
          },
        ],
      };
    }

    try {
      const content = loadDocument(skill, documentPath, skillsDir);
      return {
        contents: [
          {
            uri: uri.href,
            text: content,
            mimeType: doc.mimeType,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        contents: [
          {
            uri: uri.href,
            text: `# Error\n\nFailed to read document: ${message}`,
          },
        ],
      };
    }
  }
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-as-resources] Server connected via stdio");
