/**
 * Server-side skill discovery, content loading, and MCP resource registration.
 *
 * Discovers Agent Skills by scanning a directory for subdirectories
 * containing SKILL.md files, parses YAML frontmatter for metadata,
 * scans for supplementary documents, and provides secure content loading.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parse as parseYaml } from "yaml";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SkillMetadata,
  SkillDocument,
  SkillManifest,
  RegisterSkillResourcesOptions,
  SkillResourceHandles,
} from "./types.js";
import { getMimeType, isTextMimeType } from "./mime.js";
import { generateSkillsXML } from "./xml.js";

/** Maximum file size for skill files (1MB). */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/**
 * Compute SHA256 hash of a file's contents.
 * Returns a string in the format "sha256:<hex>".
 */
function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Expects content to start with --- and have a closing ---.
 */
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

/**
 * Check if a resolved path is within the allowed base directory.
 * Uses fs.realpathSync to resolve symlinks and prevent escape attacks.
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
    // Fall back to resolve check if realpathSync fails
    const normalizedBase = path.resolve(baseDir) + path.sep;
    const normalizedPath = path.resolve(targetPath);
    return normalizedPath.startsWith(normalizedBase);
  }
}

/**
 * Recursively scan a directory for files, returning SkillDocument entries.
 * Security: applies path traversal checks and file size limits.
 */
function scanDir(
  dirPath: string,
  relativeTo: string,
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

    // Security: verify path stays within the skills directory
    if (!isPathWithinBase(fullPath, baseDir)) continue;

    if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;

        const relativePath = path
          .relative(relativeTo, fullPath)
          .replace(/\\/g, "/");
        documents.push({
          path: relativePath,
          mimeType: getMimeType(entry.name),
          size: stat.size,
          hash: computeFileHash(fullPath),
        });
      } catch {
        // Skip files we can't stat or hash
      }
    } else if (entry.isDirectory()) {
      // Recurse into subdirectories
      documents.push(...scanDir(fullPath, relativeTo, baseDir));
    }
  }

  return documents;
}

/**
 * Scan a skill directory for all supplementary files.
 * Finds all files in the skill directory (including root-level files
 * and subdirectories), excluding SKILL.md / skill.md itself.
 */
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
          hash: computeFileHash(fullPath),
        });
      } catch {
        // Skip files we can't stat or hash
      }
    }
  }

  return documents;
}

/**
 * Discover all skills in a directory.
 * Scans for immediate subdirectories containing SKILL.md (or skill.md) files,
 * and scans for supplementary documents in each skill directory.
 *
 * Security: Skips files larger than MAX_FILE_SIZE, validates frontmatter fields.
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

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(resolvedDir, entry.name);

    // Find SKILL.md (prefer uppercase, accept lowercase)
    let skillMdPath: string | null = null;
    for (const name of ["SKILL.md", "skill.md"]) {
      const candidate = path.join(skillDir, name);
      if (fs.existsSync(candidate)) {
        skillMdPath = candidate;
        break;
      }
    }

    if (!skillMdPath) continue;

    // Security: check file size before reading
    const stat = fs.statSync(skillMdPath);
    if (stat.size > MAX_FILE_SIZE) {
      console.error(
        `Skipping ${skillMdPath}: file size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds limit`,
      );
      continue;
    }

    // Security: verify path is within skills directory
    if (!isPathWithinBase(skillMdPath, resolvedDir)) {
      console.error(`Skipping ${skillMdPath}: path escapes skills directory`);
      continue;
    }

    try {
      const content = fs.readFileSync(skillMdPath, "utf-8");
      const { frontmatter } = parseFrontmatter(content);

      const name = frontmatter.name;
      const description = frontmatter.description;

      if (typeof name !== "string" || !name.trim()) {
        console.error(`Skill at ${skillDir}: missing or invalid 'name' field`);
        continue;
      }
      if (typeof description !== "string" || !description.trim()) {
        console.error(
          `Skill at ${skillDir}: missing or invalid 'description' field`,
        );
        continue;
      }

      // Extract optional metadata fields
      const metadata: Record<string, string> = {};
      if (frontmatter.metadata && typeof frontmatter.metadata === "object") {
        for (const [k, v] of Object.entries(
          frontmatter.metadata as Record<string, unknown>,
        )) {
          if (typeof v === "string") {
            metadata[k] = v;
          }
        }
      }

      // Extract optional MCP server dependencies
      let dependencies: string[] | undefined;
      if (Array.isArray(frontmatter.dependencies)) {
        const valid = frontmatter.dependencies.filter(
          (d): d is string => typeof d === "string" && d.trim().length > 0,
        );
        if (valid.length > 0) {
          dependencies = valid.map((d) => d.trim());
        }
      }

      const trimmedName = name.trim();
      if (skillMap.has(trimmedName)) {
        console.error(
          `Warning: Duplicate skill name "${trimmedName}" at ${skillMdPath} — keeping first`,
        );
        continue;
      }

      // Scan for supplementary documents
      const documents = scanDocuments(skillDir, resolvedDir);

      // Build pre-computed manifest with file hashes
      const skillMdHash = computeFileHash(skillMdPath);
      const manifest: SkillManifest = {
        skill: trimmedName,
        files: [
          { path: "SKILL.md", size: stat.size, hash: skillMdHash },
          ...documents.map((doc) => ({
            path: doc.path,
            size: doc.size,
            hash: doc.hash,
          })),
        ],
      };
      skillMap.set(trimmedName, {
        name: trimmedName,
        description: description.trim(),
        path: skillMdPath,
        skillDir,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        dependencies,
        documents,
        manifest,
        lastModified: stat.mtime.toISOString(),
      });
    } catch (error) {
      console.error(`Failed to parse skill at ${skillDir}:`, error);
    }
  }

  return skillMap;
}

/**
 * Load the full content of a SKILL.md file.
 *
 * Security: Validates that the path is within the skills directory,
 * only reads .md files, and enforces a file size limit.
 */
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

/**
 * Load a supplementary document from a skill directory.
 * Returns text content for text MIME types and base64-encoded content for binary.
 *
 * Security: Validates path within skills directory, rejects path traversal,
 * enforces file size limit.
 */
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

/**
 * Register MCP resources for all discovered skills on an McpServer.
 *
 * Registers per-skill:
 *   - skill://{name}/SKILL.md — skill content (listed resource)
 *   - skill://{name}/_manifest — file manifest (listed resource)
 *
 * Optionally registers:
 *   - skill://{name}/{+path} — resource template for supporting files
 *   - skill://prompt-xml — XML for system prompt injection
 *
 * Returns a map of skill name → resource handles for later removal.
 */
export function registerSkillResources(
  server: McpServer,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  options?: RegisterSkillResourcesOptions,
): SkillResourceHandles {
  const handles: SkillResourceHandles = new Map();
  const { template = true, promptXml = false } = options ?? {};

  // Register per-skill resources
  for (const [name, skill] of skillMap) {
    // Append dependency info to description so clients can see it via resources/list
    const skillDescription =
      skill.dependencies && skill.dependencies.length > 0
        ? `${skill.description} (requires: ${skill.dependencies.join(", ")})`
        : skill.description;

    const skillHandle = server.registerResource(
      `skill-${name}`,
      `skill://${name}/SKILL.md`,
      {
        description: skillDescription,
        mimeType: "text/markdown",
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
          return {
            contents: [{ uri: uri.href, text: content }],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nFailed to load skill "${name}": ${message}`,
              },
            ],
          };
        }
      },
    );

    const manifestHandle = server.registerResource(
      `skill-${name}-manifest`,
      `skill://${name}/_manifest`,
      {
        description: `File manifest for skill '${name}' with content hashes`,
        mimeType: "application/json",
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.5,
          lastModified: skill.lastModified,
        },
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(skill.manifest),
          },
        ],
      }),
    );

    handles.set(name, { skill: skillHandle, manifest: manifestHandle });
  }

  // Resource template for supporting files
  if (template) {
    server.registerResource(
      "skill-file",
      new ResourceTemplate("skill://{skillName}/{+path}", {
        list: undefined,
        complete: {
          skillName: (value) => {
            return Array.from(skillMap.values())
              .filter((s) => s.documents.length > 0)
              .map((s) => s.name)
              .filter((n) => n.startsWith(value));
          },
          path: (value, context) => {
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
        description: "Fetch a supporting file from a skill directory",
        mimeType: "text/plain",
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.2,
        },
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (uri, variables) => {
        const skillName = Array.isArray(variables.skillName)
          ? variables.skillName[0]
          : variables.skillName;
        const filePath = Array.isArray(variables.path)
          ? variables.path[0]
          : variables.path;

        const skill = skillMap.get(skillName);
        if (!skill) {
          const names = Array.from(skillMap.keys()).join(", ") || "none";
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nSkill "${skillName}" not found. Available: ${names}`,
              },
            ],
          };
        }

        const doc = skill.documents.find((d) => d.path === filePath);
        if (!doc) {
          const available =
            skill.documents.map((d) => `- ${d.path}`).join("\n");
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
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nFailed to read file: ${message}`,
              },
            ],
          };
        }
      },
    );
  }

  // Optional prompt-xml convenience resource
  if (promptXml) {
    server.registerResource(
      "skills-prompt-xml",
      "skill://prompt-xml",
      {
        description:
          "XML representation of available skills for injecting into system prompts",
        mimeType: "application/xml",
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.3,
        },
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: generateSkillsXML(skillMap),
          },
        ],
      }),
    );
  }

  return handles;
}
