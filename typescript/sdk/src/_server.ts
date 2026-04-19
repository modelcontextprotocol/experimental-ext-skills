/**
 * Server-side skill discovery, content loading, and MCP resource registration.
 *
 * Discovers Agent Skills by recursively scanning a directory for SKILL.md
 * files at any depth, parses YAML frontmatter for metadata, scans for
 * supplementary documents, and provides secure content loading.
 *
 * Key evolution from previous version:
 *   - Recursive discovery (not just immediate subdirectories)
 *   - Multi-segment skill paths (PR #70): path ≠ name
 *   - No-nesting constraint enforcement
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parse as parseYaml } from "yaml";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SkillMetadata,
  SkillDocument,
  SkillManifest,
  SkillIndex,
  SkillTemplateDeclaration,
  RegisterSkillResourcesOptions,
} from "./types.js";
import { SKILL_INDEX_SCHEMA } from "./types.js";
import { getMimeType, isTextMimeType } from "./mime.js";
import { generateSkillsXML } from "./xml.js";
import { buildSkillUri, INDEX_JSON_URI } from "./uri.js";

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
 * Recursively find all SKILL.md files under a directory.
 * Returns an array of { skillMdPath, skillDir, skillPath } objects.
 *
 * The `skillPath` is the relative directory path from skillsDir to the
 * directory containing SKILL.md, using forward slashes. This becomes the
 * multi-segment URI locator.
 *
 * Enforces the no-nesting constraint from PR #70: a SKILL.md cannot be
 * an ancestor directory of another SKILL.md.
 */
function findSkillFiles(
  dir: string,
  skillsDir: string,
  ancestorHasSkill: boolean,
): Array<{ skillMdPath: string; skillDir: string; skillPath: string }> {
  const results: Array<{
    skillMdPath: string;
    skillDir: string;
    skillPath: string;
  }> = [];

  if (!fs.existsSync(dir)) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Check if this directory contains a SKILL.md
  let skillMdPath: string | null = null;
  for (const name of ["SKILL.md", "skill.md"]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      skillMdPath = candidate;
      break;
    }
  }

  const hasSkill = skillMdPath !== null;

  if (hasSkill && ancestorHasSkill) {
    // No-nesting constraint: skip this SKILL.md (ancestor already has one)
    console.error(
      `[skills] Skipping nested SKILL.md at ${skillMdPath} — ancestor directory already contains a skill`,
    );
  } else if (hasSkill && skillMdPath) {
    const skillPath = path.relative(skillsDir, dir).replace(/\\/g, "/") || ".";
    results.push({
      skillMdPath,
      skillDir: dir,
      skillPath: skillPath === "." ? path.basename(dir) : skillPath,
    });
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subdir = path.join(dir, entry.name);
    if (!isPathWithinBase(subdir, skillsDir)) continue;
    results.push(...findSkillFiles(subdir, skillsDir, ancestorHasSkill || hasSkill));
  }

  return results;
}

/**
 * Discover all skills in a directory tree.
 *
 * Recursively scans for SKILL.md files at any depth (not just immediate
 * subdirectories). The relative directory path from skillsDir becomes the
 * multi-segment `skillPath` used in skill:// URIs.
 *
 * Returns a Map keyed by skillPath (not name), since the path is the
 * unique locator within a server.
 *
 * Security: Skips files larger than MAX_FILE_SIZE, validates frontmatter,
 * enforces path containment and no-nesting constraint.
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

  const skillFiles = findSkillFiles(resolvedDir, resolvedDir, false);

  for (const { skillMdPath, skillDir, skillPath } of skillFiles) {
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

      // SEP constraint: final segment of skillPath MUST equal frontmatter name
      const finalSegment = skillPath.split("/").pop()!;
      if (finalSegment !== name.trim()) {
        console.error(
          `Skill at ${skillDir}: frontmatter name "${name.trim()}" does not match final path segment "${finalSegment}". ` +
            `Per the SEP, the final segment of the skill path must equal the frontmatter name.`,
        );
        continue;
      }

      if (skillMap.has(skillPath)) {
        console.error(
          `Warning: Duplicate skill path "${skillPath}" at ${skillMdPath} — keeping first`,
        );
        continue;
      }

      // Scan for supplementary documents
      const documents = scanDocuments(skillDir, resolvedDir);

      // Build pre-computed manifest with file hashes
      const skillMdHash = computeFileHash(skillMdPath);
      const trimmedName = name.trim();
      const manifest: SkillManifest = {
        skill: trimmedName,
        skillPath,
        files: [
          { path: "SKILL.md", size: stat.size, hash: skillMdHash },
          ...documents.map((doc) => ({
            path: doc.path,
            size: doc.size,
            hash: doc.hash,
          })),
        ],
      };

      skillMap.set(skillPath, {
        name: trimmedName,
        skillPath,
        description: description.trim(),
        absolutePath: skillMdPath,
        skillDir,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
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
 * Generate the skill://index.json discovery index.
 *
 * Follows the Agent Skills well-known URI discovery index format.
 * Each entry contains the skill name, description, type ("skill-md"),
 * and the full skill:// URI for the SKILL.md resource.
 *
 * Optionally includes "mcp-resource-template" entries for parameterized
 * skill namespaces (e.g., skill://docs/{product}/SKILL.md).
 */
export function generateSkillIndex(
  skillMap: Map<string, SkillMetadata>,
  templates?: SkillTemplateDeclaration[],
): SkillIndex {
  const skillEntries = Array.from(skillMap.entries()).map(([skillPath, skill]) => ({
    name: skill.name,
    type: "skill-md" as const,
    description: skill.description,
    url: buildSkillUri(skillPath),
  }));

  const templateEntries = (templates ?? []).map((t) => ({
    type: "mcp-resource-template" as const,
    description: t.description,
    url: t.uriTemplate,
  }));

  return {
    $schema: SKILL_INDEX_SCHEMA,
    skills: [...skillEntries, ...templateEntries],
  };
}

/**
 * Register MCP resources for all discovered skills on an McpServer.
 *
 * Registers per-skill (using multi-segment skill paths):
 *   - skill://{skillPath}/SKILL.md — skill content (listed resource)
 *   - skill://{skillPath}/_manifest — file manifest (listed resource)
 *
 * Always registers:
 *   - skill://index.json — well-known discovery index (SEP enumeration)
 *
 * Optionally registers:
 *   - skill://{+skillFilePath} — resource template for supporting files
 *   - skill://prompt-xml — XML for system prompt injection
 */
export function registerSkillResources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  options?: RegisterSkillResourcesOptions,
): void {
  const { template = true, promptXml = false, audience = ["assistant"] } = options ?? {};

  // Compute the most recent lastModified across all skills for aggregate resources
  const latestModified = skillMap.size > 0
    ? Array.from(skillMap.values())
        .map((s) => s.lastModified)
        .sort()
        .pop()
    : undefined;

  // Register per-skill resources
  for (const [skillPath, skill] of skillMap) {
    // Use frontmatter name as the resource name (shown in resources/list)
    // Use skillPath-based key for internal uniqueness
    const registrationKey = `skill:${skillPath}`;
    const skillAudience = skill.audience ?? audience;

    server.resource(
      skill.name,
      `skill://${skillPath}/SKILL.md`,
      {
        description: skill.description,
        mimeType: "text/markdown",
        size: skill.manifest.files.find((f) => f.path === "SKILL.md")?.size,
        annotations: {
          audience: skillAudience,
          priority: 1.0,
          lastModified: skill.lastModified,
        },
      },
      async (uri: URL) => {
        try {
          const content = loadSkillContent(skill.absolutePath, skillsDir);
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
                text: `# Error\n\nFailed to load skill "${skill.name}": ${message}`,
              },
            ],
          };
        }
      },
    );

    const manifestJson = JSON.stringify(skill.manifest, null, 2);
    server.resource(
      `${skill.name}-manifest`,
      `skill://${skillPath}/_manifest`,
      {
        description: `File manifest for skill '${skill.name}' with content hashes`,
        mimeType: "application/json",
        size: Buffer.byteLength(manifestJson),
        annotations: {
          audience: skillAudience,
          priority: 0.5,
          lastModified: skill.lastModified,
        },
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: manifestJson,
          },
        ],
      }),
    );
  }

  // Well-known discovery index (SEP enumeration mechanism)
  const indexJson = generateSkillIndex(skillMap);
  const indexJsonStr = JSON.stringify(indexJson, null, 2);
  server.resource(
    "skills-index",
    INDEX_JSON_URI,
    {
      description:
        "Discovery index of available skills, following the Agent Skills well-known URI format",
      mimeType: "application/json",
      size: Buffer.byteLength(indexJsonStr),
      annotations: {
        audience: ["assistant"],
        priority: 0.8,
        lastModified: latestModified,
      },
    },
    async (uri: URL) => ({
      contents: [
        {
          uri: uri.href,
          text: indexJsonStr,
        },
      ],
    }),
  );

  // Resource template for supporting files
  if (template) {
    server.resource(
      "skill-file",
      new ResourceTemplate("skill://{+skillFilePath}", {
        list: undefined,
        complete: {
          skillFilePath: (value) => {
            // Provide completions: all known skill paths + their files
            const completions: string[] = [];
            for (const [sp, skill] of skillMap) {
              if (skill.documents.length === 0) continue;
              for (const doc of skill.documents) {
                const fullPath = `${sp}/${doc.path}`;
                if (fullPath.startsWith(value)) {
                  completions.push(fullPath);
                }
              }
            }
            return completions;
          },
        },
      }),
      {
        description: "Fetch a supporting file from a skill directory",
        mimeType: "text/plain",
        annotations: {
          audience,
          priority: 0.2,
          lastModified: latestModified,
        },
      },
      async (uri: URL, variables: Record<string, string | string[]>) => {
        const skillFilePath = Array.isArray(variables.skillFilePath)
          ? variables.skillFilePath[0]
          : variables.skillFilePath;

        // Resolve the skill path using longest-prefix match
        const knownPaths = Array.from(skillMap.keys()).sort(
          (a, b) => b.length - a.length,
        );
        let matchedSkill: SkillMetadata | undefined;
        let filePath: string | undefined;

        for (const sp of knownPaths) {
          if (skillFilePath.startsWith(sp + "/")) {
            matchedSkill = skillMap.get(sp);
            filePath = skillFilePath.slice(sp.length + 1);
            break;
          }
        }

        if (!matchedSkill || !filePath) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nCould not resolve skill path from "${skillFilePath}"`,
              },
            ],
          };
        }

        const doc = matchedSkill.documents.find((d) => d.path === filePath);
        if (!doc) {
          const available =
            matchedSkill.documents.map((d) => `- ${d.path}`).join("\n");
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Error\n\nFile "${filePath}" not found in skill "${matchedSkill.name}".\n\n## Available Files\n\n${available || "No supporting files available."}`,
              },
            ],
          };
        }

        try {
          const isText = isTextMimeType(doc.mimeType);
          const content = loadDocument(
            matchedSkill,
            filePath,
            skillsDir,
            isText,
          );
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
    const promptXmlContent = generateSkillsXML(skillMap);
    server.resource(
      "skills-prompt-xml",
      "skill://prompt-xml",
      {
        description:
          "XML representation of available skills for injecting into system prompts",
        mimeType: "application/xml",
        size: Buffer.byteLength(promptXmlContent),
        annotations: {
          audience,
          priority: 0.3,
          lastModified: latestModified,
        },
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            text: promptXmlContent,
          },
        ],
      }),
    );
  }
}
