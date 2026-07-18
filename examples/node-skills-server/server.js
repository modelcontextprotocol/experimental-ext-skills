#!/usr/bin/env node
/**
 * Minimal reference implementation of SEP-2640 (Skills Extension) for MCP.
 *
 * Discovers skills from a local directory (default: ./skills, override with
 * SKILLS_DIR), parses each SKILL.md's YAML frontmatter, and serves them as
 * MCP resources under the skill:// URI scheme -- see:
 *   https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/sep-draft-skills-extension.md
 *
 * This targets the CURRENT SEP-2640 draft (resources-only transport binding).
 * An earlier sketch of this example (see the tracking issue) proposed
 * exposing skill "activation" as tools/list + tools/call; the ratified
 * design settled on Resources alone (see the SEP's own "Why Resources
 * Instead of a New Primitive?" rationale) -- this implementation follows
 * that, not the earlier sketch.
 *
 * Scope: text-based skill files (SKILL.md + markdown/text references), the
 * shape covered by every example in the SEP itself. Binary assets would use
 * the `blob` (base64) resource-content field instead of `text` -- not
 * implemented here to keep the example focused.
 */

// Uses the low-level `Server` class rather than the SDK's higher-level
// `McpServer` (which the SDK's own JSDoc marks preferred for typical cases,
// reserving `Server` for "advanced use cases"). This example is exactly that
// case: it declares a not-yet-typed capability (`extensions`, SEP-2133) and
// resolves a custom multi-segment URI scheme (skill-path and file-path are
// each independently multi-segment) that doesn't map cleanly onto a single
// ResourceTemplate. The explicit request handlers below also show the raw
// resources/list and resources/read shapes directly, which is useful for
// implementers porting this pattern to other SDKs/languages.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import matter from "gray-matter";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SKILLS_ROOT = process.env.SKILLS_DIR
  ? join(process.cwd(), process.env.SKILLS_DIR)
  : join(HERE, "skills");

// A skill's `name` (SEP-2640: "the final <skill-path> segment MUST equal the
// skill's `name`") is constrained to the Agent Skills naming rules: lowercase
// letters, digits, and hyphens only.
const VALID_SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function posix(p) {
  return p.split(sep).join("/");
}

async function walkFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(full)));
    else out.push(full);
  }
  return out;
}

/**
 * Discover skills under SKILLS_ROOT. A skill is any directory containing a
 * SKILL.md; the skill-path is that directory's path relative to SKILLS_ROOT.
 * Returns a Map<skillPath, { name, description, files: Map<relFilePath, absPath> }>.
 */
async function loadSkills(root) {
  const allFiles = await walkFiles(root);
  const skillMdFiles = allFiles.filter((f) => f.endsWith(`${sep}SKILL.md`));
  const skillDirs = skillMdFiles.map((f) => f.slice(0, -`${sep}SKILL.md`.length));

  // SEP-2640: "A SKILL.md MUST NOT appear in any descendant directory of a
  // skill" -- skills do not nest. Catch this early with a clear error rather
  // than silently mis-resolving skill:// URIs later.
  for (const a of skillDirs) {
    for (const b of skillDirs) {
      if (a !== b && b.startsWith(a + sep)) {
        throw new Error(
          `invalid skill layout: "${posix(relative(root, b))}" is nested inside ` +
            `"${posix(relative(root, a))}" -- SEP-2640 skills must not nest`,
        );
      }
    }
  }

  const skills = new Map();
  for (const mdPath of skillMdFiles) {
    const skillDir = mdPath.slice(0, -`${sep}SKILL.md`.length);
    const skillPath = posix(relative(root, skillDir));
    const raw = await readFile(mdPath, "utf8");
    const { data } = matter(raw);

    if (!data.name || !data.description) {
      console.error(`skipping "${skillPath}": SKILL.md frontmatter missing required name/description`);
      continue;
    }
    if (!VALID_SKILL_NAME.test(data.name)) {
      console.error(`skipping "${skillPath}": frontmatter name "${data.name}" is not lowercase-letters/digits/hyphens`);
      continue;
    }
    const dirLeaf = skillPath.split("/").pop();
    if (data.name !== dirLeaf) {
      console.error(
        `skipping "${skillPath}": frontmatter name "${data.name}" must equal the final ` +
          `path segment "${dirLeaf}" (SEP-2640 requires these to match)`,
      );
      continue;
    }

    const files = new Map();
    for (const f of allFiles.filter((f) => f === mdPath || f.startsWith(skillDir + sep))) {
      files.set(posix(relative(skillDir, f)), f);
    }
    skills.set(skillPath, { name: data.name, description: data.description, files });
  }
  return skills;
}

function mimeTypeFor(relFilePath) {
  if (relFilePath.endsWith(".md")) return "text/markdown";
  if (relFilePath.endsWith(".json")) return "application/json";
  return "text/plain";
}

/** skill://index.json content -- the Agent Skills discovery-index shape (SEP-2640 §Enumeration). */
function buildIndex(skills) {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [...skills.entries()].map(([skillPath, skill]) => ({
      name: skill.name,
      type: "skill-md",
      description: skill.description,
      url: `skill://${skillPath}/SKILL.md`,
    })),
  };
}

/** Resolve a skill:// URI to its absolute file path, or null if not found. */
function resolveSkillUri(skills, uri) {
  if (!uri.startsWith("skill://")) return null;
  const path = uri.slice("skill://".length);
  for (const [skillPath, skill] of skills) {
    const prefix = `${skillPath}/`;
    if (path.startsWith(prefix)) {
      const relFile = path.slice(prefix.length);
      const abs = skill.files.get(relFile);
      if (abs) return { abs, mimeType: mimeTypeFor(relFile) };
    }
  }
  return null;
}

async function main() {
  const skills = await loadSkills(SKILLS_ROOT);

  const server = new Server(
    { name: "node-skills-server-example", version: "0.1.0" },
    {
      capabilities: {
        resources: {},
        // SEP-2640 capability declaration (io.modelcontextprotocol/skills).
        // As of @modelcontextprotocol/sdk 1.29.0, ServerCapabilities has no
        // `extensions` field yet (SEP-2133 hasn't landed in the SDK's types) --
        // this still round-trips correctly since the SDK does not validate or
        // strip unknown capability keys at runtime, it just forwards whatever
        // object is passed here. Update this once the SDK adds first-class
        // extensions support.
        extensions: {
          "io.modelcontextprotocol/skills": {},
        },
      },
    },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      {
        uri: "skill://index.json",
        name: "index.json",
        mimeType: "application/json",
        description: "Index of skills served by this server (SEP-2640 discovery).",
      },
    ];
    for (const [skillPath, skill] of skills) {
      for (const [relFile] of skill.files) {
        resources.push({
          uri: `skill://${skillPath}/${relFile}`,
          name: relFile === "SKILL.md" ? skill.name : relFile,
          mimeType: mimeTypeFor(relFile),
          ...(relFile === "SKILL.md" ? { description: skill.description } : {}),
        });
      }
    }
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "skill://index.json") {
      return {
        contents: [
          { uri, mimeType: "application/json", text: JSON.stringify(buildIndex(skills), null, 2) },
        ],
      };
    }

    const resolved = resolveSkillUri(skills, uri);
    if (!resolved) {
      throw new Error(`resource not found: ${uri}`);
    }
    const text = await readFile(resolved.abs, "utf8");
    return { contents: [{ uri, mimeType: resolved.mimeType, text }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`node-skills-server-example: serving ${skills.size} skill(s) from ${SKILLS_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
