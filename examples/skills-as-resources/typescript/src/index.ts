#!/usr/bin/env node
/**
 * Skills as Resources — MCP Server (TypeScript)
 *
 * Reference implementation of SEP-2640 (Skills Extension): exposing Agent Skills
 * via MCP resources under the `skill://` URI scheme.
 *
 * Resources registered per skill:
 *   skill://<skillPath>/SKILL.md      — skill content
 *   skill://<skillPath>/{+filePath}   — supporting files (resource template)
 *
 * Plus the well-known discovery resource:
 *   skill://index.json                — index of all skills served
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  discoverSkills,
  registerSkillResources,
  registerSkillArchive,
  registerSkillTemplate,
  SKILLS_EXTENSION,
} from "@modelcontextprotocol/ext-skills/server";
import type {
  ArchiveIndexEntry,
  ResourceTemplateIndexEntry,
  SkillResourceHandles,
} from "@modelcontextprotocol/ext-skills";
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

const skillMap = discoverSkills(skillsDir);

console.error(
  `[skills-as-resources] Discovered ${skillMap.size} skill(s): ${Array.from(skillMap.keys()).join(", ") || "none"}`,
);
for (const [skillPath, skill] of skillMap) {
  console.error(
    `  - ${skillPath} (name=${skill.name}): ${skill.documents.length} supporting file(s)`,
  );
}

// SEP-2640 §Capability Declaration: advertise the extension.
// `extensions` is defined by SEP-2133 and is not yet typed in @modelcontextprotocol/sdk.
const capabilities = {
  resources: { listChanged: true, subscribe: true },
  extensions: { [SKILLS_EXTENSION]: {} },
} as Record<string, unknown>;

const server = new McpServer(
  { name: "skills-as-resources-example", version: "0.1.0" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { capabilities: capabilities as any },
);

// Demonstrate SEP-2640 archive + template entries.
// `extraIndexEntries` is read on every skill://index.json fetch, so entries
// added after registerSkillResources still show up.
const archiveEntries: ArchiveIndexEntry[] = [];
const templateEntries: ResourceTemplateIndexEntry[] = [];

const resourceHandles: SkillResourceHandles = registerSkillResources(
  server,
  skillMap,
  skillsDir,
  {
    extraIndexEntries: () => [...archiveEntries, ...templateEntries],
  },
);

// Register a tar.gz archive for each skill (alongside file-by-file).
for (const skill of skillMap.values()) {
  archiveEntries.push(
    registerSkillArchive(server, skill, skillsDir).entry,
  );
}

// Register a sample mcp-resource-template entry. A real server would resolve
// these from a backing data source (docs DB, marketplace, etc.).
templateEntries.push(
  registerSkillTemplate(server, {
    description: "Per-product documentation skill (illustrative template entry)",
    uriTemplate: "skill://docs/{product}/SKILL.md",
    resolve: async ({ variables }) => {
      const product = String(
        Array.isArray(variables.product) ? variables.product[0] : variables.product,
      );
      return {
        contents: [
          {
            uri: `skill://docs/${product}/SKILL.md`,
            mimeType: "text/markdown",
            text:
              `---\nname: ${product}\ndescription: Documentation for ${product}\n---\n# ${product}\n\nThis is a sample dynamically resolved skill.\n`,
          },
        ],
      };
    },
    complete: {
      product: (value) =>
        ["widget", "gadget", "gizmo"].filter((p) => p.startsWith(value)),
    },
  }).entry,
);

const subscriptions = createSubscriptionManager(
  skillMap,
  skillsDir,
  (uri) => {
    server.server.sendResourceUpdated({ uri });
  },
);

server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  subscriptions.subscribe(request.params.uri);
  return {};
});

server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  subscriptions.unsubscribe(request.params.uri);
  return {};
});

const directoryWatcher = createSkillDirectoryWatcher(skillsDir, () => {
  const newSkillMap = discoverSkills(skillsDir);

  for (const skillPath of skillMap.keys()) {
    if (!newSkillMap.has(skillPath)) {
      const handles = resourceHandles.get(skillPath);
      if (handles) {
        handles.skill.remove();
        resourceHandles.delete(skillPath);
      }
      subscriptions.unsubscribeByPrefix(`skill://${skillPath}/`);
      skillMap.delete(skillPath);
      console.error(`[skills-as-resources] Skill removed: ${skillPath}`);
    }
  }

  for (const [skillPath, metadata] of newSkillMap) {
    if (!skillMap.has(skillPath)) {
      skillMap.set(skillPath, metadata);
      const singleMap = new Map([[skillPath, metadata]]);
      const newHandles = registerSkillResources(server, singleMap, skillsDir, {
        templates: true,
        index: false,
      });
      resourceHandles.set(skillPath, newHandles.get(skillPath)!);
      console.error(
        `[skills-as-resources] Skill added: ${skillPath} (${metadata.documents.length} supporting file(s))`,
      );
    }
  }
});

process.on("SIGINT", () => {
  directoryWatcher.close();
  subscriptions.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-as-resources] Server connected via stdio");
