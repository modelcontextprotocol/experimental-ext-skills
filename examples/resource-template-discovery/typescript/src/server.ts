#!/usr/bin/env node
/**
 * Resource Template Discovery — Test Fixture Server
 *
 * A minimal MCP server that exposes skills exclusively via resource templates,
 * mimicking the pattern from github/github-mcp-server#2129 by Sam Morrow.
 *
 * This server deliberately does NOT register any skills via resources/list.
 * Skills are discoverable only through:
 *   1. resources/templates/list — returns skill:// templates
 *   2. completion/complete — enumerates available owner/repo/skill_name values
 *   3. resources/read — loads content by expanding the template URI
 *
 * URI templates:
 *   - skill://{owner}/{repo}/{skill_name}/SKILL.md   — skill content
 *   - skill://{owner}/{repo}/{skill_name}/_manifest  — JSON manifest with file:// URIs
 *   - file://{owner}/{repo}/{+path}                  — supporting file content
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverSkills } from "@modelcontextprotocol/ext-skills/server";
import type { SkillMetadata } from "@modelcontextprotocol/ext-skills";

// ---------- Configuration ----------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, "../../../sample-skills");

// Simulated owner/repo structure (local equivalent of GitHub's org/repo)
const OWNER = "test-org";
const REPO = "sample-skills-repo";

// ---------- Skill Discovery ----------

const skillMap = discoverSkills(skillsDir);

console.error(
  `[template-discovery] Discovered ${skillMap.size} skill(s): ${Array.from(skillMap.keys()).join(", ") || "none"}`,
);

// ---------- Server Setup ----------

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "resource-template-discovery-fixture", version: "0.1.0" },
    { capabilities: { resources: {} } },
  );

  // --- Skill Content Template ---
  // skill://{owner}/{repo}/{skill_name}/SKILL.md
  server.registerResource(
    "skill-content",
    new ResourceTemplate("skill://{owner}/{repo}/{skill_name}/SKILL.md", {
      list: undefined, // NOT listed — template-only discovery
      complete: {
        owner: () => [OWNER],
        repo: () => [REPO],
        skill_name: (value: string) => {
          return Array.from(skillMap.keys()).filter((name) =>
            name.startsWith(value),
          );
        },
      },
    }),
    {
      description: "Agent skill content (SKILL.md)",
      mimeType: "text/markdown",
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (uri, variables) => {
      const skillName = String(
        Array.isArray(variables.skill_name)
          ? variables.skill_name[0]
          : variables.skill_name,
      );

      const skill = skillMap.get(skillName);
      if (!skill) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error\n\nSkill "${skillName}" not found.`,
            },
          ],
        };
      }

      const content = fs.readFileSync(skill.path, "utf-8");
      return {
        contents: [{ uri: uri.href, text: content, mimeType: "text/markdown" }],
      };
    },
  );

  // --- Skill Manifest Template ---
  // skill://{owner}/{repo}/{skill_name}/_manifest
  server.registerResource(
    "skill-manifest",
    new ResourceTemplate("skill://{owner}/{repo}/{skill_name}/_manifest", {
      list: undefined,
      complete: {
        owner: () => [OWNER],
        repo: () => [REPO],
        skill_name: (value: string) => {
          return Array.from(skillMap.keys()).filter((name) =>
            name.startsWith(value),
          );
        },
      },
    }),
    {
      description: "Skill file manifest with URIs",
      mimeType: "application/json",
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (uri, variables) => {
      const owner = String(
        Array.isArray(variables.owner) ? variables.owner[0] : variables.owner,
      );
      const repo = String(
        Array.isArray(variables.repo) ? variables.repo[0] : variables.repo,
      );
      const skillName = String(
        Array.isArray(variables.skill_name)
          ? variables.skill_name[0]
          : variables.skill_name,
      );

      const skill = skillMap.get(skillName);
      if (!skill) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: `Skill "${skillName}" not found` }),
            },
          ],
        };
      }

      // Build manifest with file:// URIs (local equivalent of repo:// URIs)
      const manifest = {
        skill: skillName,
        files: skill.manifest.files.map((f) => ({
          path: f.path,
          uri: `file://${owner}/${repo}/contents/${skillName}/${f.path}`,
          size: f.size,
        })),
      };

      return {
        contents: [
          { uri: uri.href, text: JSON.stringify(manifest), mimeType: "application/json" },
        ],
      };
    },
  );

  // --- File Content Template ---
  // file://{owner}/{repo}/contents/{+path}
  // Local equivalent of GitHub's repo:// template
  server.registerResource(
    "file-content",
    new ResourceTemplate("file://{owner}/{repo}/contents/{+path}", {
      list: undefined,
      complete: {
        owner: () => [OWNER],
        repo: () => [REPO],
        path: (value: string) => {
          const paths: string[] = [];
          for (const skill of skillMap.values()) {
            for (const f of skill.manifest.files) {
              const fullPath = `${skill.name}/${f.path}`;
              if (fullPath.startsWith(value)) {
                paths.push(fullPath);
              }
            }
          }
          return paths;
        },
      },
    }),
    { description: "File content from the skills repository" },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (uri, variables) => {
      const filePath = String(
        Array.isArray(variables.path) ? variables.path[0] : variables.path,
      );

      // filePath is like "code-review/SKILL.md" or "code-review/references/REFERENCE.md"
      const parts = filePath.split("/");
      const skillName = parts[0];
      const relativePath = parts.slice(1).join("/");

      const skill = skillMap.get(skillName);
      if (!skill) {
        return {
          contents: [{ uri: uri.href, text: `# Error\n\nSkill "${skillName}" not found.` }],
        };
      }

      const fullPath = path.join(skill.skillDir, relativePath);

      // Security: ensure path stays within skill directory
      const resolvedSkillDir = path.resolve(skill.skillDir);
      const resolvedFullPath = path.resolve(fullPath);
      if (!resolvedFullPath.startsWith(resolvedSkillDir)) {
        return {
          contents: [{ uri: uri.href, text: "# Error\n\nPath traversal not allowed." }],
        };
      }

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return {
          contents: [{ uri: uri.href, text: content }],
        };
      } catch {
        return {
          contents: [{ uri: uri.href, text: `# Error\n\nFile not found: ${relativePath}` }],
        };
      }
    },
  );

  return server;
}

// ---------- Export for integration tests ----------

export { skillMap, OWNER, REPO, skillsDir };

// ---------- Standalone mode ----------

// Only start stdio transport when run directly (not imported by tests)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isDirectRun) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[template-discovery] Server connected via stdio");
}
