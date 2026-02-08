/**
 * Skill discovery, content loading, and document scanning module.
 *
 * Discovers Agent Skills by scanning a directory for subdirectories
 * containing SKILL.md files, parses YAML frontmatter for metadata,
 * scans for supplementary documents, and provides secure content loading.
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillMetadata, SkillDocument } from "./types.js";
import { getMimeType } from "./resource-helpers.js";

/** Maximum file size for skill files (1MB). */
const MAX_FILE_SIZE = 1 * 1024 * 1024;

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
  baseDir: string
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
  baseDir: string
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

        const relativePath = path.relative(relativeTo, fullPath).replace(/\\/g, "/");
        documents.push({
          path: relativePath,
          mimeType: getMimeType(entry.name),
          size: stat.size,
        });
      } catch {
        // Skip files we can't stat
      }
    } else if (entry.isDirectory()) {
      // Recurse into subdirectories
      documents.push(...scanDir(fullPath, relativeTo, baseDir));
    }
  }

  return documents;
}

/**
 * Scan a skill directory for supplementary documents.
 * Finds all files in subdirectories of the skill directory,
 * excluding SKILL.md itself.
 */
export function scanDocuments(
  skillDir: string,
  baseDir: string
): SkillDocument[] {
  const documents: SkillDocument[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillDir, { withFileTypes: true });
  } catch {
    return documents;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDirPath = path.join(skillDir, entry.name);
    documents.push(...scanDir(subDirPath, skillDir, baseDir));
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
export function discoverSkills(skillsDir: string): Map<string, SkillMetadata> {
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
        `Skipping ${skillMdPath}: file size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds limit`
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
          `Skill at ${skillDir}: missing or invalid 'description' field`
        );
        continue;
      }

      // Extract optional metadata fields
      const metadata: Record<string, string> = {};
      if (
        frontmatter.metadata &&
        typeof frontmatter.metadata === "object"
      ) {
        for (const [k, v] of Object.entries(
          frontmatter.metadata as Record<string, unknown>
        )) {
          if (typeof v === "string") {
            metadata[k] = v;
          }
        }
      }

      const trimmedName = name.trim();
      if (skillMap.has(trimmedName)) {
        console.error(
          `Warning: Duplicate skill name "${trimmedName}" at ${skillMdPath} — keeping first`
        );
        continue;
      }

      // Scan for supplementary documents
      const documents = scanDocuments(skillDir, resolvedDir);

      skillMap.set(trimmedName, {
        name: trimmedName,
        description: description.trim(),
        path: skillMdPath,
        skillDir,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        documents,
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
  skillsDir: string
): string {
  // Security: only allow .md files
  if (!skillPath.endsWith(".md")) {
    throw new Error("Only .md files can be read");
  }

  // Security: verify path is within skills directory
  if (!isPathWithinBase(skillPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  // Security: check file size
  const stat = fs.statSync(skillPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`
    );
  }

  return fs.readFileSync(skillPath, "utf-8");
}

/**
 * Load a supplementary document from a skill directory.
 *
 * Security: Validates that the path is within the skills directory,
 * rejects path traversal attempts, and enforces a file size limit.
 */
export function loadDocument(
  skill: SkillMetadata,
  documentPath: string,
  skillsDir: string
): string {
  // Security: reject path traversal attempts
  if (documentPath.includes("..")) {
    throw new Error("Path traversal not allowed");
  }

  const fullPath = path.join(skill.skillDir, documentPath);

  // Security: verify path is within skills directory
  if (!isPathWithinBase(fullPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  // Security: check file size
  const stat = fs.statSync(fullPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`
    );
  }

  return fs.readFileSync(fullPath, "utf-8");
}
