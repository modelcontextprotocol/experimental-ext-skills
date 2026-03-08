/**
 * Client-side utilities for discovering and summarizing skills
 * exposed as MCP resources by a skills server.
 *
 * These functions help MCP clients enumerate available skills,
 * parse frontmatter from skill content, and build context summaries
 * for injection into system prompts or model context.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SkillSummary } from "./types.js";
import { parseSkillUri, SKILL_FILENAME } from "./uri.js";

/**
 * List all skill resources available from an MCP client.
 *
 * Calls resources/list, filters for skill://{name}/SKILL.md URIs,
 * and returns lightweight SkillSummary objects. Handles pagination
 * automatically if the server returns a nextCursor.
 */
export async function listSkillResources(
  client: Client,
): Promise<SkillSummary[]> {
  const skills: SkillSummary[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listResources(
      cursor ? { cursor } : undefined,
    );

    for (const resource of result.resources) {
      const parsed = parseSkillUri(resource.uri);
      if (!parsed || parsed.path !== SKILL_FILENAME) continue;

      // Parse dependencies from "(requires: a, b)" suffix in description
      let description = resource.description;
      let dependencies: string[] | undefined;
      if (description) {
        const reqMatch = description.match(/\s*\(requires:\s*(.+)\)$/);
        if (reqMatch) {
          dependencies = reqMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          description = description.slice(0, reqMatch.index);
        }
      }

      skills.push({
        name: parsed.name,
        uri: resource.uri,
        description,
        mimeType: resource.mimeType,
        dependencies,
      });
    }

    cursor = result.nextCursor;
  } while (cursor);

  return skills;
}

/**
 * Parse name and description from SKILL.md YAML frontmatter content.
 *
 * Uses a simple regex approach — no yaml dependency required on the client side.
 * Handles the common case of `name: value` and `description: value` in frontmatter.
 *
 * Returns null if the content doesn't contain valid frontmatter.
 */
export function parseSkillFrontmatter(
  content: string,
): { name: string; description: string; dependencies?: string[] } | null {
  if (!content.startsWith("---")) return null;

  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return null;

  const frontmatter = content.slice(3, endIndex);

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch) return null;

  const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
  const description = descMatch
    ? descMatch[1].trim().replace(/^["']|["']$/g, "")
    : "";

  // Parse optional dependencies: [server-a, server-b]
  let dependencies: string[] | undefined;
  const depsMatch = frontmatter.match(/^dependencies:\s*\[([^\]]*)\]$/m);
  if (depsMatch) {
    const items = depsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);
    if (items.length > 0) {
      dependencies = items;
    }
  }

  return { name, description, dependencies };
}

/**
 * Build a plain-text summary of available skills for context injection.
 *
 * Format:
 * ```
 * Available skills:
 * - code-review (skill://code-review/SKILL.md): Perform structured code reviews
 * - test-writer (skill://test-writer/SKILL.md): Generate unit tests
 * ```
 */
export function buildSkillsSummary(skills: SkillSummary[]): string {
  if (skills.length === 0) return "No skills available.";

  const lines = ["Available skills:"];
  for (const skill of skills) {
    const desc = skill.description ? `: ${skill.description}` : "";
    const deps =
      skill.dependencies && skill.dependencies.length > 0
        ? ` [requires: ${skill.dependencies.join(", ")}]`
        : "";
    lines.push(`- ${skill.name} (${skill.uri})${desc}${deps}`);
  }
  return lines.join("\n");
}
