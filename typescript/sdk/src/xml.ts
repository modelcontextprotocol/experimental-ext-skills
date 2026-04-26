/**
 * XML generation utilities for system prompt injection.
 *
 * Provides functions to generate <available_skills> XML from both
 * server-side SkillMetadata maps and client-side SkillSummary arrays.
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
 * Uses skillPath for URIs (multi-segment) and name for identity.
 *
 * Format:
 * ```xml
 * <available_skills>
 *   <skill>
 *     <name>billing-refunds</name>
 *     <path>acme/billing/refunds</path>
 *     <description>Process customer refund requests...</description>
 *     <uri>skill://acme/billing/refunds/SKILL.md</uri>
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
    lines.push(`    <path>${escapeXml(skill.skillPath)}</path>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push(
      `    <uri>skill://${escapeXml(skill.skillPath)}/SKILL.md</uri>`,
    );
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * Generate <available_skills> XML from client-side SkillSummary array.
 * Includes both name (identity) and skillPath (locator).
 */
export function generateSkillsXMLFromSummaries(
  skills: SkillSummary[],
): string {
  const lines: string[] = ["<available_skills>"];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <path>${escapeXml(skill.skillPath)}</path>`);
    if (skill.description) {
      lines.push(
        `    <description>${escapeXml(skill.description)}</description>`,
      );
    }
    lines.push(`    <uri>${escapeXml(skill.uri)}</uri>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
