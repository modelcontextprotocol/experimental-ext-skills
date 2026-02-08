/**
 * Type definitions for the Skills as Resources reference implementation.
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 */

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
}

/**
 * Metadata extracted from a skill's SKILL.md YAML frontmatter,
 * extended with document scanning results.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  path: string; // Absolute path to the SKILL.md file
  skillDir: string; // Absolute path to the skill's directory
  metadata?: Record<string, string>; // Optional extra frontmatter fields
  documents: SkillDocument[]; // Supplementary files found in subdirectories
}

/**
 * Summary returned in the skill://index resource (progressive disclosure).
 */
export interface SkillSummary {
  name: string;
  description: string;
  uri: string; // skill://{name}
  documentsUri?: string; // skill://{name}/documents (only if documents exist)
  documentCount: number;
  metadata?: Record<string, string>;
}
