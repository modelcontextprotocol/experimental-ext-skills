/**
 * Type definitions for the Skills as Resources reference implementation.
 *
 * URI scheme aligned with skillsdotnet conventions:
 *   - skill://{name}/SKILL.md   — listed resource for skill content
 *   - skill://{name}/_manifest  — listed resource for file inventory
 *   - skill://{name}/{+path}    — template for supporting files
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 * - SkillsDotNet by Brad Wilson (https://github.com/bradwilson/skillsdotnet)
 */

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
  documents: SkillDocument[]; // Supplementary files found in subdirectories
  manifest: SkillManifest; // Pre-computed file manifest
  manifestJson: string; // Pre-serialized manifest JSON (avoids I/O on request)
}
