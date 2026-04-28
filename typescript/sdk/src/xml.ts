/**
 * Helpers for system prompt injection.
 *
 * SEP-2640 hosts inject available skill metadata into the model's context so
 * the model can decide when to load a skill via `read_resource`. These helpers
 * generate an `<available_skills>` XML block from server-side or client-side
 * skill data.
 */

import type { SkillMetadata, SkillSummary } from "./types.js";
import { buildSkillContentUri } from "./uri.js";

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate `<available_skills>` XML from a server-side skill map.
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
    lines.push(
      `    <uri>${escapeXml(buildSkillContentUri(skill.skillPath))}</uri>`,
    );
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * Generate `<available_skills>` XML from client-side SkillSummary array.
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
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
