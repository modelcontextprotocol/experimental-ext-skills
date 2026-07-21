// Minimal MCP server implementing the SEP-2640 "Skills Extension" resource
// mapping (docs/sep-draft-skills-extension.md in this repo), used as the test
// fixture for issue #66 (client-side skill:// resource discovery/loading).
//
// Serves three skills from ./skills:
//   - git-workflow                 (flat skill-path, listed + enumerated)
//   - acme/billing/refunds          (nested skill-path + one sub-resource,
//                                    listed + enumerated)
//   - hidden-skill                  (deliberately absent from BOTH
//                                    resources/list AND skill://index.json,
//                                    to prove direct resources/read still
//                                    works for a URI the client never saw
//                                    enumerated anywhere)
//
// Uses the low-level Server (not McpServer's registerResource helper)
// specifically so listing and reading can be controlled independently --
// registerResource() would auto-list anything registered through it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

const SKILLS_CAPABILITY = "io.modelcontextprotocol/skills";
const HIDDEN_SKILL_PATHS = new Set(["hidden-skill"]);

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = join(here, "skills");

function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(markdown);
  if (!match) return {};
  const result = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs, base));
    else if (entry.isFile()) out.push(relative(base, abs).split("\\").join("/"));
  }
  return out;
}

// Find every directory (at any depth under skillsRoot) that directly
// contains a SKILL.md; its path relative to skillsRoot is the skill-path.
function findSkillDirs(dir) {
  const found = [];
  if (readdirSync(dir).includes("SKILL.md") && statSync(join(dir, "SKILL.md")).isFile()) {
    found.push(dir);
    return found; // skills must not nest inside skills
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...findSkillDirs(join(dir, entry.name)));
  }
  return found;
}

function mimeTypeFor(path) {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  return "text/plain";
}

function loadSkills() {
  const skills = [];
  for (const skillDir of findSkillDirs(skillsRoot)) {
    const skillPath = relative(skillsRoot, skillDir).split("\\").join("/");
    const finalSegment = skillPath.split("/").pop();
    const skillMdText = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(skillMdText);
    if (frontmatter.name !== finalSegment) {
      throw new Error(
        `Skill at "${skillPath}" has frontmatter name "${frontmatter.name}", ` +
          `but the final skill-path segment MUST equal it (SEP-2640 §Resource Mapping).`
      );
    }
    const files = walkFiles(skillDir).map((relPath) => ({
      path: relPath,
      uri: `skill://${skillPath}/${relPath}`,
      mimeType: mimeTypeFor(relPath),
      text: readFileSync(join(skillDir, relPath), "utf8"),
    }));
    skills.push({ skillPath, name: frontmatter.name, description: frontmatter.description, files });
  }
  return skills;
}

function buildIndex(skills) {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: skills
      .filter((skill) => !HIDDEN_SKILL_PATHS.has(skill.skillPath))
      .map((skill) => ({
        name: skill.name,
        type: "skill-md",
        description: skill.description,
        url: `skill://${skill.skillPath}/SKILL.md`,
      })),
  };
}

async function main() {
  const skills = loadSkills();
  const index = buildIndex(skills);
  const indexJson = JSON.stringify(index, null, 2);

  // Every file, by URI -- including hidden-skill's. This is what
  // resources/read consults; it is NOT what resources/list advertises.
  const filesByUri = new Map();
  for (const skill of skills) {
    for (const file of skill.files) filesByUri.set(file.uri, file);
  }
  filesByUri.set("skill://index.json", {
    uri: "skill://index.json",
    mimeType: "application/json",
    text: indexJson,
  });

  // Only non-hidden skills' files (+ the index) are advertised via
  // resources/list.
  const listedResources = [];
  for (const skill of skills) {
    if (HIDDEN_SKILL_PATHS.has(skill.skillPath)) continue;
    for (const file of skill.files) {
      listedResources.push({
        uri: file.uri,
        name: `${skill.name} — ${file.path}`,
        mimeType: file.mimeType,
      });
    }
  }
  listedResources.push({ uri: "skill://index.json", name: "Skill index", mimeType: "application/json" });

  const server = new Server(
    { name: "issue-66-skills-fixture", version: "0.1.0" },
    { capabilities: { resources: {}, extensions: { [SKILLS_CAPABILITY]: {} } } }
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listedResources }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const file = filesByUri.get(request.params.uri);
    if (!file) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${request.params.uri}`);
    }
    return { contents: [{ uri: file.uri, mimeType: file.mimeType, text: file.text }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
