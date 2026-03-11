/**
 * Type definitions for the Skills as Resources SDK.
 *
 * URI scheme:
 *   - skill://{name}/SKILL.md   — listed resource for skill content
 *   - skill://{name}/_manifest  — listed resource for file inventory
 *   - skill://{name}/{+path}    — template for supporting files
 */

import type { RegisteredResource } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * A file entry in the skill manifest, including content hash.
 * Used in the skill://{name}/_manifest resource.
 */
export interface ManifestFileEntry {
  /** Relative path from skill root (e.g., "SKILL.md", "references/REFERENCE.md") */
  path: string;
  /** File size in bytes */
  size: number;
  /** Content hash in format "sha256:<hex>" */
  hash: string;
}

/**
 * Pre-computed manifest for a skill, listing all files with hashes.
 * Served at skill://{name}/_manifest.
 */
export interface SkillManifest {
  /** Skill name */
  skill: string;
  /** All files in the skill directory, including SKILL.md */
  files: ManifestFileEntry[];
}

/**
 * A supplementary document found in a skill's subdirectories.
 */
export interface SkillDocument {
  /** Relative path from skill root (e.g., "references/REFERENCE.md") */
  path: string;
  /** MIME type based on file extension */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** SHA256 hash of file content in format "sha256:<hex>" */
  hash: string;
}

/**
 * Metadata extracted from a skill's SKILL.md YAML frontmatter,
 * extended with document scanning results and pre-computed manifest.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  path: string; // Absolute path to the SKILL.md file
  skillDir: string; // Absolute path to the skill's directory
  metadata?: Record<string, string>; // Optional extra frontmatter fields
  dependencies?: string[]; // MCP server dependencies declared in frontmatter
  documents: SkillDocument[]; // Supplementary files found in subdirectories
  manifest: SkillManifest; // Pre-computed file manifest
  lastModified: string; // ISO 8601 timestamp from SKILL.md file mtime
}

/**
 * Lightweight client-side summary of a discovered skill.
 * Built from resources/list results and optional frontmatter parsing.
 */
export interface SkillSummary {
  /** Skill name (parsed from URI or frontmatter) */
  name: string;
  /** Full skill:// URI for the SKILL.md resource */
  uri: string;
  /** Skill description (from resource metadata or frontmatter) */
  description?: string;
  /** MIME type of the resource */
  mimeType?: string;
  /** MCP server dependencies (parsed from resource description or frontmatter) */
  dependencies?: string[];
}

/**
 * Describes the MCP server dependencies required by a skill being loaded.
 * Passed to the SkillCatalog's onDependenciesRequired callback.
 *
 * Aligned with SkillsDotNet.Mcp.SkillDependencyRequest.
 */
export interface SkillDependencyRequest {
  /** The name of the skill being loaded */
  skillName: string;
  /** The MCP server names declared in the skill's dependencies frontmatter field */
  serverNames: string[];
}

/**
 * Options for registerSkillResources().
 */
export interface RegisterSkillResourcesOptions {
  /** Register the resource template for supporting files (skill://{name}/{+path}). Default: true */
  template?: boolean;
  /** Register the skill://prompt-xml convenience resource. Default: false */
  promptXml?: boolean;
}

/**
 * Return type for registerSkillResources() — maps skill name to resource handles.
 */
export type SkillResourceHandles = Map<
  string,
  {
    skill: RegisteredResource;
    manifest: RegisteredResource;
  }
>;
