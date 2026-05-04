/**
 * XML generation for the client-side system-prompt skills catalog.
 */

import type { SkillSummary } from "./types.js";

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
 * Options for generateSkillsXMLFromSummaries().
 */
export interface SkillsXmlOptions {
  /** Server name to inject when `serverInEntries` is true. */
  serverName?: string;
  /**
   * Inject `<server>{serverName}</server>` into each `<skill>` entry.
   * Default: false. The host SKILL.md flags this as a way to keep
   * first-call activation reliability ~90% for `(server, uri)` reader
   * tools — but it's not in SEP-2640, so the SDK leaves it off by default.
   */
  serverInEntries?: boolean;
}

/**
 * Generate <available_skills> XML from a client-side SkillSummary array.
 */
export function generateSkillsXMLFromSummaries(
  skills: SkillSummary[],
  options?: SkillsXmlOptions,
): string {
  const serverName = options?.serverName;
  const inEntries = options?.serverInEntries === true;
  const lines: string[] = ["<available_skills>"];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <path>${escapeXml(skill.skillPath)}</path>`);
    if (serverName && inEntries) {
      lines.push(`    <server>${escapeXml(serverName)}</server>`);
    }
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
