/**
 * Client-side helpers for SEP-2640.
 *
 * Each MCP Client is server-scoped — it represents a connection to a single
 * server. Skill URIs are not prefixed with a server name; disambiguation
 * happens at the call site by routing to the correct Client.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { SkillIndex, SkillSummary } from "./types.js";
import {
  buildSkillContentUri,
  buildSkillUri,
  parseSkillContentUri,
  SKILL_INDEX_URI,
} from "./uri.js";

/**
 * MCP Tool definition for a generic read_resource tool.
 *
 * The model calls read_resource(uri, server_name); the host routes
 * to the correct MCP Client based on server_name.
 */
export const READ_RESOURCE_TOOL: Tool = {
  name: "read_resource",
  description:
    "Read a resource from an MCP server by its URI. " +
    "Use this to load skill content and supporting files.",
  inputSchema: {
    type: "object",
    properties: {
      uri: {
        type: "string",
        description: "The resource URI (e.g., skill://git-workflow/SKILL.md)",
      },
      server_name: {
        type: "string",
        description: "The name of the MCP server that provides this resource",
      },
    },
    required: ["uri", "server_name"],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/* -------------------- discovery -------------------- */

/**
 * Read `skill://index.json` if available.
 * Returns null when the resource is not served (server doesn't expose an index).
 */
export async function readSkillIndex(
  client: Client,
): Promise<SkillIndex | null> {
  try {
    const result = await client.readResource({ uri: SKILL_INDEX_URI });
    const content = result.contents[0];
    if (content && "text" in content) {
      return JSON.parse(content.text) as SkillIndex;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Discover skills served by an MCP server.
 *
 * Tries `skill://index.json` first (SEP-2640 §Discovery). Falls back to
 * `resources/list` filtering when the index is absent.
 */
export async function listSkills(client: Client): Promise<SkillSummary[]> {
  const index = await readSkillIndex(client);
  if (index?.skills) {
    const summaries: SkillSummary[] = [];
    for (const entry of index.skills) {
      if (entry.type !== "skill-md") continue;
      const parsed = parseSkillContentUri(entry.url);
      if (!parsed) continue;
      summaries.push({
        skillPath: parsed.skillPath,
        name: entry.name,
        uri: entry.url,
        description: entry.description,
        mimeType: "text/markdown",
      });
    }
    return summaries;
  }
  return listSkillResources(client);
}

/**
 * Fallback discovery: list all resources and filter for skill SKILL.md URIs.
 * Handles pagination automatically.
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
      const parsed = parseSkillContentUri(resource.uri);
      if (!parsed) continue;
      skills.push({
        skillPath: parsed.skillPath,
        name: parsed.name,
        uri: resource.uri,
        description: resource.description,
        mimeType: resource.mimeType,
      });
    }

    cursor = result.nextCursor;
  } while (cursor);

  return skills;
}

/* -------------------- frontmatter parsing -------------------- */

/**
 * Parse `name` and `description` from SKILL.md YAML frontmatter.
 * Returns null when the content has no closed frontmatter or no `name` field.
 */
export function parseSkillFrontmatter(
  content: string,
): { name: string; description: string } | null {
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

  return { name, description };
}

/* -------------------- summary helpers -------------------- */

/** Build a plain-text summary of available skills for context injection. */
export function buildSkillsSummary(skills: SkillSummary[]): string {
  if (skills.length === 0) return "No skills available.";

  const lines = ["Available skills:"];
  for (const skill of skills) {
    const desc = skill.description ? `: ${skill.description}` : "";
    lines.push(`- ${skill.name} (${skill.uri})${desc}`);
  }
  return lines.join("\n");
}

/* -------------------- read helpers -------------------- */

/** Read a skill's SKILL.md content given its skill path. */
export async function readSkillContent(
  client: Client,
  skillPath: string,
): Promise<string> {
  const uri = buildSkillContentUri(skillPath);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (content && "text" in content) return content.text;
  throw new Error(`Expected text content for ${uri}`);
}

/** Read a supporting file from a skill directory (text or base64 blob). */
export async function readSkillDocument(
  client: Client,
  skillPath: string,
  filePath: string,
): Promise<{ text?: string; blob?: string; mimeType?: string }> {
  const uri = buildSkillUri(skillPath, filePath);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (!content) throw new Error(`No content returned for ${uri}`);
  return {
    text: "text" in content ? content.text : undefined,
    blob: "blob" in content ? content.blob : undefined,
    mimeType: content.mimeType,
  };
}
