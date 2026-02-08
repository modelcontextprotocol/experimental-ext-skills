/**
 * Resource helper utilities for the Skills as Resources implementation.
 *
 * Provides XML generation for system prompt injection and MIME type mapping
 * for skill documents.
 *
 * Inspired by:
 * - skills-over-mcp by Keith Groves (https://github.com/keithagroves/skills-over-mcp)
 */

import * as path from "node:path";
import type { SkillMetadata } from "./types.js";

/** Map file extensions to MIME types. */
const MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".py": "text/x-python",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".sql": "text/x-sql",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/**
 * Get the MIME type for a file based on its extension.
 */
export function getMimeType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate <available_skills> XML for injecting into system prompts.
 *
 * Format:
 * ```xml
 * <available_skills>
 *   <skill>
 *     <name>code-review</name>
 *     <description>Perform structured code reviews...</description>
 *     <uri>skill://code-review</uri>
 *   </skill>
 * </available_skills>
 * ```
 */
export function generateSkillsXML(
  skillMap: Map<string, SkillMetadata>
): string {
  const lines: string[] = ["<available_skills>"];

  for (const skill of skillMap.values()) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <uri>skill://${escapeXml(skill.name)}</uri>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
