/**
 * Type definitions for the Skills as Tools reference implementation.
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 */

/**
 * Metadata extracted from a skill's SKILL.md YAML frontmatter.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  path: string; // Absolute path to the SKILL.md file
  metadata?: Record<string, string>; // Optional extra frontmatter fields
}

/**
 * Summary returned by the list_skills tool (progressive disclosure).
 */
export interface SkillSummary {
  name: string;
  description: string;
}
