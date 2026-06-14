/**
 * Server-side skill discovery, content loading, and MCP resource registration.
 *
 * Discovers Agent Skills by recursively scanning a directory for SKILL.md
 * files at any depth, parses YAML frontmatter for metadata, scans for
 * supplementary documents, and provides secure content loading.
 *
 * Multi-segment skill paths are supported (path ≠ name) per SEP-2640;
 * the no-nesting constraint (a SKILL.md cannot be an ancestor of another)
 * is enforced at discovery time.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SkillMetadata,
  SkillDocument,
  SkillIndex,
  SkillIndexEntry,
  SkillArchiveDeclaration,
  ArchiveFormat,
  RegisterSkillResourcesOptions,
} from "./types.js";
import { getMimeType, isTextMimeType } from "./mime.js";
import {
  buildSkillUri,
  INDEX_JSON_URI,
  SKILL_URI_SCHEME,
  isValidSkillName,
} from "./uri.js";
import { archiveMimeType, archiveSuffix } from "./archive.js";
import {
  DirectoryReadRequestSchema,
  makeDirectoryReadHandler,
} from "./directory.js";

/** Maximum file size for skill files (1MB). */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

/**
 * Compute a SHA-256 digest of raw bytes, formatted `sha256:{hex}` (64
 * lowercase hex), as required for `skill://index.json` entries by SEP-2640.
 */
export function sha256Digest(data: Buffer | string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Expects content to start with --- and have a closing --- on its own line.
 *
 * Uses a line-anchored match so a `---` inside the body (e.g. a markdown
 * horizontal rule, or `---` within a multi-line YAML value) doesn't terminate
 * the frontmatter early. This mirrors the client-side parseSkillFrontmatter()
 * so the server and client agree on exactly where the frontmatter ends.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---")) {
    throw new Error("SKILL.md must start with YAML frontmatter (---)");
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error("SKILL.md frontmatter not properly closed with ---");
  }

  const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
  if (typeof frontmatter !== "object" || frontmatter === null) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping");
  }

  const body = content.slice(match[0].length).trim();
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
        });
      } catch {
        // Skip files we can't stat
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
        });
      } catch {
        // Skip files we can't stat
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
 * Enforces the no-nesting constraint: a SKILL.md cannot be an ancestor
 * directory of another SKILL.md.
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
      // Read raw bytes once: the digest is over the raw file bytes (SEP-2640),
      // while parsing needs the UTF-8 decoding.
      const fileBytes = fs.readFileSync(skillMdPath);
      const content = fileBytes.toString("utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const digest = sha256Digest(fileBytes);

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

      // SEP constraint: final segment of skillPath MUST equal frontmatter name
      const finalSegment = skillPath.split("/").pop()!;
      const trimmedName = name.trim();
      if (finalSegment !== trimmedName) {
        console.error(
          `Skill at ${skillDir}: frontmatter name "${trimmedName}" does not match final path segment "${finalSegment}". ` +
            `Per the SEP, the final segment of the skill path must equal the frontmatter name.`,
        );
        continue;
      }

      // SEP constraint: the final segment (= frontmatter name) MUST satisfy
      // the Agent Skills naming rule (lowercase letters, digits, hyphens).
      if (!isValidSkillName(trimmedName)) {
        console.error(
          `Skill at ${skillDir}: name "${trimmedName}" violates the Agent Skills naming rule. ` +
            `Names must contain only lowercase letters, digits, and hyphens.`,
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

      skillMap.set(skillPath, {
        name: name.trim(),
        skillPath,
        description: description.trim(),
        frontmatter,
        digest,
        absolutePath: skillMdPath,
        skillDir,
        documents,
        size: stat.size,
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
 * Options for generateSkillIndex().
 */
export interface GenerateSkillIndexOptions {
  /** Archive declarations → per-skill `archives` entries. */
  archives?: SkillArchiveDeclaration[];
}

/**
 * Resolve an archive declaration's format, defaulting from the file
 * extension when not explicitly set.
 */
function resolveArchiveFormat(decl: SkillArchiveDeclaration): ArchiveFormat {
  if (decl.format) return decl.format;
  const lower = decl.archivePath.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".zip")) return "zip";
  throw new Error(
    `Cannot infer archive format from path "${decl.archivePath}". Set format: "tar.gz" | "zip" explicitly.`,
  );
}

/**
 * Build the resource URI an archive is served under, per SEP-2640
 * (`skill://<skillPath>.<format>`).
 */
function archiveResourceUri(decl: SkillArchiveDeclaration): string {
  const format = resolveArchiveFormat(decl);
  return `${SKILL_URI_SCHEME}${decl.skillPath}${archiveSuffix(format)}`;
}

/**
 * Validate an archive declaration against the SEP path/name rules and read
 * its bytes, returning the index `archives[]` reference for it.
 */
function archiveIndexRef(decl: SkillArchiveDeclaration): {
  url: string;
  mimeType: string;
  digest: string;
} {
  // SEP constraint: final segment of skillPath MUST equal frontmatter name.
  const finalSegment = decl.skillPath.split("/").pop()!;
  if (finalSegment !== decl.name) {
    throw new Error(
      `Archive declaration: skillPath "${decl.skillPath}" final segment "${finalSegment}" does not match name "${decl.name}". Per SEP-2640, the final segment of the skill path MUST equal the frontmatter name.`,
    );
  }
  // SEP constraint: the name MUST satisfy the Agent Skills naming rule.
  if (!isValidSkillName(decl.name)) {
    throw new Error(
      `Archive declaration: name "${decl.name}" violates the Agent Skills naming rule. Names must contain only lowercase letters, digits, and hyphens.`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(decl.archivePath);
  } catch (err) {
    throw new Error(
      `Failed to read archive "${decl.archivePath}" for skill "${decl.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    url: archiveResourceUri(decl),
    mimeType: archiveMimeType(resolveArchiveFormat(decl)),
    digest: sha256Digest(bytes),
  };
}

/**
 * Generate the `skill://index.json` discovery index (SEP-2640).
 *
 * Emits one type-less entry per skill in `skillMap` — `{ frontmatter, url,
 * digest }`, where `frontmatter` is the skill's full SKILL.md frontmatter
 * copied verbatim — and one entry per archive declaration —
 * `{ frontmatter, archives: [{ url, mimeType, digest }] }`. The index has no
 * `$schema`/version marker.
 */
export function generateSkillIndex(
  skillMap: Map<string, SkillMetadata>,
  options?: GenerateSkillIndexOptions,
): SkillIndex {
  const opts = options ?? {};

  const skillEntries: SkillIndexEntry[] = Array.from(skillMap.values()).map(
    (skill) => ({
      frontmatter: skill.frontmatter,
      url: buildSkillUri(skill.skillPath),
      digest: skill.digest,
    }),
  );

  const archiveEntries: SkillIndexEntry[] = (opts.archives ?? []).map((a) => ({
    frontmatter: a.frontmatter ?? { name: a.name, description: a.description },
    archives: [archiveIndexRef(a)],
  }));

  return { skills: [...skillEntries, ...archiveEntries] };
}

/**
 * Register MCP resources for all discovered skills on an McpServer.
 *
 * Registers per-skill (using multi-segment skill paths):
 *   - skill://{skillPath}/SKILL.md — skill content (listed resource)
 *
 * Always registers:
 *   - skill://index.json — well-known discovery index (SEP enumeration)
 *
 * Optionally registers:
 *   - skill://{+skillFilePath} — catch-all template for supporting files.
 *   - A `resources/directory/read` handler (when `directoryRead: true`) so
 *     hosts can enumerate the files under each individually-served skill.
 */
export function registerSkillResources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  options?: RegisterSkillResourcesOptions,
): void {
  const {
    template = true,
    index = true,
    audience = ["assistant"],
    archives = [],
    directoryRead = false,
  } = options ?? {};

  // Compute the most recent lastModified across all skills for aggregate resources
  const latestModified = skillMap.size > 0
    ? Array.from(skillMap.values())
        .map((s) => s.lastModified)
        .sort()
        .pop()
    : undefined;

  // Register archive resources before the index, so the index can reference them.
  for (const archive of archives) {
    const format = resolveArchiveFormat(archive);
    const uri = archiveResourceUri(archive);
    const mimeType = archiveMimeType(format);

    let archiveBytes: Buffer;
    try {
      archiveBytes = fs.readFileSync(archive.archivePath);
    } catch (err) {
      throw new Error(
        `Failed to read archive "${archive.archivePath}" for skill "${archive.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const archiveBase64 = archiveBytes.toString("base64");
    let archiveModified: string;
    try {
      archiveModified = fs.statSync(archive.archivePath).mtime.toISOString();
    } catch {
      archiveModified = new Date().toISOString();
    }

    server.resource(
      `${archive.name}-archive`,
      uri,
      {
        description: `${archive.description} (archive distribution)`,
        mimeType,
        size: archiveBytes.length,
        annotations: {
          audience,
          priority: 0.9,
          lastModified: archiveModified,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (resourceUri: URL): Promise<any> => ({
        contents: [
          {
            uri: resourceUri.href,
            mimeType,
            blob: archiveBase64,
          },
        ],
      }),
    );
  }

  // Register per-skill resources
  for (const [skillPath, skill] of skillMap) {
    const skillAudience = skill.audience ?? audience;

    server.resource(
      skill.name,
      `skill://${skillPath}/SKILL.md`,
      {
        description: skill.description,
        mimeType: "text/markdown",
        size: skill.size,
        annotations: {
          audience: skillAudience,
          priority: 1.0,
          lastModified: skill.lastModified,
        },
        ...(skill.meta ? { _meta: skill.meta } : {}),
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
  }

  // Well-known discovery index (SEP enumeration mechanism). Optional —
  // servers with unenumerable catalogs can pass `index: false`.
  if (index) {
    const indexJson = generateSkillIndex(skillMap, { archives });
    const indexJsonStr = JSON.stringify(indexJson, null, 2);
    server.resource(
      "skills-index",
      INDEX_JSON_URI,
      {
        description:
          "Discovery index of available skills served by this server (skill://index.json)",
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
  }

  // SEP-2640 `resources/directory/read`: enumerate the files under each
  // individually-served skill directory. Registered on the low-level request
  // router (this is an extension method, not part of the high-level resource
  // API). The server MUST also advertise the capability via
  // `declareSkillsExtension(server, { directoryRead: true })` before connect.
  if (directoryRead) {
    const handler = makeDirectoryReadHandler(skillMap);
    // McpServer exposes the underlying low-level Server as `.server`.
    const lowLevel = server.server ?? server;
    lowLevel.setRequestHandler(DirectoryReadRequestSchema, handler);
  }

  // Catch-all resource template for supporting files.
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
}
