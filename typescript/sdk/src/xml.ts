/**
 * XML generation utilities for system prompt injection.
 *
 * Provides functions to generate <available_skills> XML from both
 * server-side SkillMetadata maps and client-side SkillSummary arrays.
 *
 * Inspired by:
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 */

import type { SkillMetadata, SkillSummary } from "./types.js";

/**
 * Escape XML special characters.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate <available_skills> XML from a server-side skill map.
 *
 * Format:
 * ```xml
 * <available_skills>
 *   <skill>
 *     <name>code-review</name>
 *     <description>Perform structured code reviews...</description>
 *     <uri>skill://code-review/SKILL.md</uri>
 *   </skill>
 * </available_skills>
 * ```
 */
export function generateSkillsXML(
  skillMap: Map<string, SkillMetadata>,
): string {
  const lines: string[] = ["<available_skills>"];

  for (const skill of skillMap.values()) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push(`    <uri>skill://${escapeXml(skill.name)}/SKILL.md</uri>`);
    if (skill.dependencies && skill.dependencies.length > 0) {
      lines.push(
        `    <dependencies>${skill.dependencies.map((d) => escapeXml(d)).join(", ")}</dependencies>`,
      );
    }
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * Generate <available_skills> XML from client-side SkillSummary array.
 *
 * Same format as generateSkillsXML but works with the lightweight
 * SkillSummary type used on the client side.
 */
export function generateSkillsXMLFromSummaries(
  skills: SkillSummary[],
): string {
  const lines: string[] = ["<available_skills>"];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    if (skill.description) {
      lines.push(
        `    <description>${escapeXml(skill.description)}</description>`,
      );
    }
    lines.push(`    <uri>${escapeXml(skill.uri)}</uri>`);
    if (skill.dependencies && skill.dependencies.length > 0) {
      lines.push(
        `    <dependencies>${skill.dependencies.map((d) => escapeXml(d)).join(", ")}</dependencies>`,
      );
    }
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
