/**
 * Server-side skill discovery and resource registration for SEP-2640.
 *
 * Walks a skills directory recursively, locating SKILL.md files at any depth,
 * parses frontmatter, validates that the final path segment matches the
 * frontmatter `name`, scans supplementary documents, and registers each skill
 * as MCP resources under the `skill://` scheme.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ArchiveIndexEntry,
  RegisterSkillArchiveOptions,
  RegisterSkillArchiveResult,
  RegisterSkillResourcesOptions,
  RegisterSkillTemplateOptions,
  RegisterSkillTemplateResult,
  ResourceTemplateIndexEntry,
  SkillDocument,
  SkillIndex,
  SkillIndexEntry,
  SkillMetadata,
  SkillResourceHandles,
} from "./types.js";
import { getMimeType, isTextMimeType } from "./mime.js";
import {
  buildSkillContentUri,
  buildSkillUri,
  extractSkillName,
  SKILL_INDEX_URI,
} from "./uri.js";
import { packSkillTarGz } from "./archive.js";

/** Default `$schema` URL for skill://index.json (per agentskills.io). */
export const SKILL_INDEX_SCHEMA =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** Reverse-domain prefix for skill `_meta` keys (SEP-2640 §Resource Metadata). */
export const SKILL_META_PREFIX = "io.modelcontextprotocol.skills/";

/** MCP extension capability identifier. */
export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";

/**
 * Agent Skills naming rule: lowercase letters, digits, and hyphens; must
 * begin with a letter. Per SEP-2640 §Resource Mapping, the final segment of
 * `<skill-path>` MUST satisfy this.
 */
export const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/** Maximum file size for skill files (1MB). */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/* -------------------- path safety -------------------- */

/**
 * Check that a resolved path lies within a base directory after symlink resolution.
 */
export function isPathWithinBase(
  targetPath: string,
  baseDir: string,
): boolean {
  try {
    const realBase = fs.realpathSync(baseDir);
    const realTarget = fs.realpathSync(targetPath);
    const normalizedBase = realBase + path.sep;
    return realTarget === realBase || realTarget.startsWith(normalizedBase);
  } catch {
    const normalizedBase = path.resolve(baseDir) + path.sep;
    const normalizedPath = path.resolve(targetPath);
    return normalizedPath.startsWith(normalizedBase);
  }
}

/* -------------------- frontmatter -------------------- */

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---")) {
    throw new Error("SKILL.md must start with YAML frontmatter (---)");
  }

  const parts = content.split("---");
  if (parts.length < 3) {
    throw new Error("SKILL.md frontmatter not properly closed with ---");
  }

  const frontmatter = parseYaml(parts[1]) as Record<string, unknown>;
  if (typeof frontmatter !== "object" || frontmatter === null) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping");
  }

  const body = parts.slice(2).join("---").trim();
  return { frontmatter, body };
}

/* -------------------- document scanning -------------------- */

function scanDir(
  dirPath: string,
  skillRoot: string,
  baseDir: string,
): SkillDocument[] {
  const documents: SkillDocument[] = [];

  if (!fs.existsSync(dirPath)) return documents;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return documents;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (!isPathWithinBase(fullPath, baseDir)) continue;

    if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        const relativePath = path
          .relative(skillRoot, fullPath)
          .replace(/\\/g, "/");
        documents.push({
          path: relativePath,
          mimeType: getMimeType(entry.name),
          size: stat.size,
        });
      } catch {
        // skip
      }
    } else if (entry.isDirectory()) {
      documents.push(...scanDir(fullPath, skillRoot, baseDir));
    }
  }

  return documents;
}

export function scanDocuments(
  skillDir: string,
  baseDir: string,
): SkillDocument[] {
  const documents: SkillDocument[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillDir, { withFileTypes: true });
  } catch {
    return documents;
  }

  const skipFiles = new Set(["SKILL.md", "skill.md"]);

  for (const entry of entries) {
    const fullPath = path.join(skillDir, entry.name);

    if (entry.isDirectory()) {
      documents.push(...scanDir(fullPath, skillDir, baseDir));
    } else if (entry.isFile() && !skipFiles.has(entry.name)) {
      if (!isPathWithinBase(fullPath, baseDir)) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        const relativePath = path
          .relative(skillDir, fullPath)
          .replace(/\\/g, "/");
        documents.push({
          path: relativePath,
          mimeType: getMimeType(entry.name),
          size: stat.size,
        });
      } catch {
        // skip
      }
    }
  }

  return documents;
}

/* -------------------- skill discovery -------------------- */

function findSkillMd(dir: string): string | null {
  for (const candidate of ["SKILL.md", "skill.md"]) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function parseSkillAt(
  skillDir: string,
  skillMdPath: string,
  baseDir: string,
): SkillMetadata | null {
  const stat = fs.statSync(skillMdPath);
  if (stat.size > MAX_FILE_SIZE) {
    console.error(
      `Skipping ${skillMdPath}: file size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds limit`,
    );
    return null;
  }
  if (!isPathWithinBase(skillMdPath, baseDir)) {
    console.error(`Skipping ${skillMdPath}: path escapes skills directory`);
    return null;
  }

  let frontmatter: Record<string, unknown>;
  try {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    ({ frontmatter } = parseFrontmatter(content));
  } catch (error) {
    console.error(`Failed to parse skill at ${skillDir}:`, error);
    return null;
  }

  const name = frontmatter.name;
  const description = frontmatter.description;

  if (typeof name !== "string" || !name.trim()) {
    console.error(`Skill at ${skillDir}: missing or invalid 'name' field`);
    return null;
  }
  if (typeof description !== "string" || !description.trim()) {
    console.error(
      `Skill at ${skillDir}: missing or invalid 'description' field`,
    );
    return null;
  }

  const trimmedName = name.trim();

  if (!SKILL_NAME_REGEX.test(trimmedName)) {
    console.error(
      `Skill at ${skillDir}: name "${trimmedName}" violates Agent Skills naming rules (lowercase letters, digits, hyphens; must start with a letter)`,
    );
    return null;
  }

  const relative = path.relative(baseDir, skillDir).replace(/\\/g, "/");
  if (!relative) {
    console.error(`Skill at ${skillDir}: cannot serve a skill at the skills directory root`);
    return null;
  }
  const finalSegment = extractSkillName(relative);
  if (finalSegment !== trimmedName) {
    console.error(
      `Skill at ${skillDir}: directory final segment "${finalSegment}" does not match frontmatter name "${trimmedName}"`,
    );
    return null;
  }

  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (k === "name" || k === "description") continue;
    if (typeof v === "string") metadata[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") metadata[k] = String(v);
  }

  const documents = scanDocuments(skillDir, baseDir);

  return {
    skillPath: relative,
    name: trimmedName,
    description: description.trim(),
    path: skillMdPath,
    skillDir,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    documents,
    lastModified: stat.mtime.toISOString(),
  };
}

/**
 * Walk a directory tree, treating any directory containing SKILL.md as a skill.
 * Per SEP-2640, skills do not nest: once a SKILL.md is found, recursion stops.
 */
function walkForSkills(
  dir: string,
  baseDir: string,
  out: Map<string, SkillMetadata>,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const skillMdPath = findSkillMd(dir);
  if (skillMdPath) {
    const meta = parseSkillAt(dir, skillMdPath, baseDir);
    if (meta) {
      if (out.has(meta.skillPath)) {
        console.error(
          `Warning: Duplicate skill path "${meta.skillPath}" — keeping first`,
        );
      } else {
        out.set(meta.skillPath, meta);
      }
    }
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const sub = path.join(dir, entry.name);
    if (!isPathWithinBase(sub, baseDir)) continue;
    walkForSkills(sub, baseDir, out);
  }
}

/**
 * Discover skills under a directory.
 *
 * Recursively walks `skillsDir`; any directory containing SKILL.md (or skill.md)
 * is treated as a skill, with its skill path = path relative to `skillsDir`.
 * The skill's frontmatter `name` MUST equal the final segment of that relative
 * path (per SEP-2640); skills failing this check are skipped with a warning.
 */
export function discoverSkills(
  skillsDir: string,
): Map<string, SkillMetadata> {
  const skillMap = new Map<string, SkillMetadata>();
  const resolvedDir = path.resolve(skillsDir);

  if (!fs.existsSync(resolvedDir)) {
    console.error(`Skills directory not found: ${resolvedDir}`);
    return skillMap;
  }

  walkForSkills(resolvedDir, resolvedDir, skillMap);
  return skillMap;
}

/* -------------------- content loading -------------------- */

export function loadSkillContent(
  skillPath: string,
  skillsDir: string,
): string {
  if (!skillPath.endsWith(".md")) {
    throw new Error("Only .md files can be read");
  }

  if (!isPathWithinBase(skillPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  const stat = fs.statSync(skillPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`,
    );
  }

  return fs.readFileSync(skillPath, "utf-8");
}

export function loadDocument(
  skill: SkillMetadata,
  documentPath: string,
  skillsDir: string,
  isText: boolean,
): { text: string } | { blob: string } {
  if (documentPath.includes("..")) {
    throw new Error("Path traversal not allowed");
  }

  if (path.isAbsolute(documentPath)) {
    throw new Error("Absolute paths not allowed");
  }

  const fullPath = path.join(skill.skillDir, documentPath);

  if (!isPathWithinBase(fullPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  const stat = fs.statSync(fullPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`,
    );
  }

  if (isText) {
    return { text: fs.readFileSync(fullPath, "utf-8") };
  } else {
    return { blob: fs.readFileSync(fullPath).toString("base64") };
  }
}

/* -------------------- index generation -------------------- */

/**
 * Build the JSON content for `skill://index.json` from a discovered skill map.
 */
export function generateSkillIndex(
  skillMap: Map<string, SkillMetadata>,
  options?: { schemaUrl?: string; extraEntries?: SkillIndexEntry[] },
): SkillIndex {
  const schemaUrl = options?.schemaUrl ?? SKILL_INDEX_SCHEMA;
  const skills: SkillIndexEntry[] = [];
  for (const skill of skillMap.values()) {
    skills.push({
      type: "skill-md",
      name: skill.name,
      description: skill.description,
      url: buildSkillContentUri(skill.skillPath),
    });
  }
  if (options?.extraEntries) skills.push(...options.extraEntries);
  return { $schema: schemaUrl, skills };
}

/* -------------------- resource registration -------------------- */

/**
 * Register MCP resources for all discovered skills.
 *
 * For each skill: registers `skill://<skillPath>/SKILL.md` (exact resource)
 * and a `skill://<skillPath>/{+filePath}` template for supporting files.
 *
 * Also registers (by default) `skill://index.json` listing all skills,
 * per SEP-2640 §Discovery.
 */
export function registerSkillResources(
  server: McpServer,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  options?: RegisterSkillResourcesOptions,
): SkillResourceHandles {
  const handles: SkillResourceHandles = new Map();
  const {
    templates = true,
    index = true,
    indexSchema = SKILL_INDEX_SCHEMA,
    extraIndexEntries,
  } = options ?? {};

  const resolveExtras = (): SkillIndexEntry[] => {
    if (!extraIndexEntries) return [];
    return typeof extraIndexEntries === "function"
      ? extraIndexEntries()
      : extraIndexEntries;
  };

  for (const [skillPath, skill] of skillMap) {
    const meta = buildSkillMeta(skill);
    const skillHandle = server.registerResource(
      skill.name,
      buildSkillContentUri(skillPath),
      {
        description: skill.description,
        mimeType: "text/markdown",
        ...(meta ? { _meta: meta } : {}),
        annotations: {
          audience: ["user", "assistant"],
          priority: 1.0,
          lastModified: skill.lastModified,
        },
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (uri) => {
        try {
          const content = loadSkillContent(skill.path, skillsDir);
          return { contents: [{ uri: uri.href, text: content }] };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nFailed to load skill "${skill.name}": ${message}`,
              },
            ],
          };
        }
      },
    );

    if (templates) {
      const templateName = `skill-${skillPath.replace(/\//g, "-")}-files`;
      server.registerResource(
        templateName,
        new ResourceTemplate(`skill://${skillPath}/{+filePath}`, {
          list: undefined,
          complete: {
            filePath: (value) =>
              skill.documents
                .map((d) => d.path)
                .filter((p) => p.startsWith(value)),
          },
        }),
        {
          description: `Files in skill "${skill.name}"`,
          mimeType: "text/plain",
          annotations: {
            audience: ["user", "assistant"],
            priority: 0.2,
          },
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async (uri, variables) => {
          const rawFilePath = Array.isArray(variables.filePath)
            ? variables.filePath[0]
            : variables.filePath;
          const filePath = String(rawFilePath ?? "");

          if (filePath === "SKILL.md") {
            try {
              const content = loadSkillContent(skill.path, skillsDir);
              return {
                contents: [
                  { uri: uri.href, mimeType: "text/markdown", text: content },
                ],
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              return {
                contents: [
                  {
                    uri: uri.href,
                    text: `# Error\n\nFailed to load SKILL.md: ${message}`,
                  },
                ],
              };
            }
          }

          const doc = skill.documents.find((d) => d.path === filePath);
          if (!doc) {
            const available = skill.documents.map((d) => `- ${d.path}`).join("\n");
            return {
              contents: [
                {
                  uri: uri.href,
                  text: `# Error\n\nFile "${filePath}" not found in skill "${skill.name}".\n\n## Available Files\n\n${available || "No supporting files available."}`,
                },
              ],
            };
          }

          try {
            const isText = isTextMimeType(doc.mimeType);
            const content = loadDocument(skill, filePath, skillsDir, isText);
            return {
              contents: [{ uri: uri.href, mimeType: doc.mimeType, ...content }],
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return {
              contents: [
                { uri: uri.href, text: `# Error\n\nFailed to read file: ${message}` },
              ],
            };
          }
        },
      );
    }

    handles.set(skillPath, { skill: skillHandle });
  }

  if (index) {
    server.registerResource(
      "skill-index",
      SKILL_INDEX_URI,
      {
        description: "Discovery index of skills served by this server (SEP-2640)",
        mimeType: "application/json",
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.5,
        },
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              generateSkillIndex(skillMap, {
                schemaUrl: indexSchema,
                extraEntries: resolveExtras(),
              }),
              null,
              2,
            ),
          },
        ],
      }),
    );
  }

  return handles;
}

/* -------------------- archive registration -------------------- */

/**
 * Register a skill for archive distribution at `skill://<skillPath>.tar.gz`.
 *
 * The archive is generated lazily on each `resources/read` call from the
 * current contents of the skill directory (subject to file-size limits).
 *
 * Returns the archive's URI, the `ArchiveIndexEntry` to merge into
 * `skill://index.json`, and the SDK resource handle.
 */
export function registerSkillArchive(
  server: McpServer,
  skill: SkillMetadata,
  skillsDir: string,
  options?: RegisterSkillArchiveOptions,
): RegisterSkillArchiveResult {
  const format = options?.format ?? "tar.gz";
  if (format !== "tar.gz") {
    throw new Error(
      `Unsupported archive format "${format}" — this SDK currently emits tar.gz only`,
    );
  }
  const uri = `skill://${skill.skillPath}.${format}`;
  const mimeType = "application/gzip";

  const handle = server.registerResource(
    `${skill.name}-archive`,
    uri,
    {
      description: `Archive of skill "${skill.name}" (${format})`,
      mimeType,
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.5,
        lastModified: skill.lastModified,
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (resourceUri) => {
      const buf = packSkillTarGz(skill, skillsDir);
      return {
        contents: [
          {
            uri: resourceUri.href,
            mimeType,
            blob: buf.toString("base64"),
          },
        ],
      };
    },
  );

  const entry: ArchiveIndexEntry = {
    type: "archive",
    name: skill.name,
    description: skill.description,
    url: uri,
  };

  return { uri, entry, handle };
}

/* -------------------- template registration -------------------- */

/**
 * Register a parameterized skill namespace as an MCP resource template.
 *
 * The template's URI (e.g. `skill://docs/{product}/SKILL.md`) is registered
 * with the MCP server so hosts can wire variable completion. The same URI
 * appears in `skill://index.json` as a `type: "mcp-resource-template"` entry,
 * surfacing the addressable space to discovery clients.
 *
 * Caller is responsible for resolving concrete URIs to skill content via
 * `options.resolve`.
 */
export function registerSkillTemplate(
  server: McpServer,
  options: RegisterSkillTemplateOptions,
): RegisterSkillTemplateResult {
  const resourceName =
    options.resourceName ??
    `skill-template-${options.uriTemplate.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;

  server.registerResource(
    resourceName,
    new ResourceTemplate(options.uriTemplate, {
      list: undefined,
      complete: options.complete,
    }),
    {
      description: options.description,
      mimeType: "text/markdown",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.7,
      },
    },
    async (uri, variables) =>
      options.resolve({ uri, variables }),
  );

  const entry: ResourceTemplateIndexEntry = {
    type: "mcp-resource-template",
    description: options.description,
    url: options.uriTemplate,
  };

  return { entry };
}

/** Build the `_meta` object for a skill's SKILL.md resource from extra frontmatter. */
function buildSkillMeta(skill: SkillMetadata): Record<string, string> | null {
  if (!skill.metadata) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(skill.metadata)) {
    out[`${SKILL_META_PREFIX}${k}`] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Re-export for convenience. */
export { buildSkillUri };
