/**
 * Client-side utilities for discovering, reading, and summarizing skills
 * exposed as MCP resources by a skills server.
 *
 * Each MCP Client instance is inherently server-scoped — it represents a
 * connection to a single MCP server. This is the architectural basis for
 * excluding server names from skill:// URIs: disambiguation happens at
 * the call site, not in the URI. Claude Code's built-in read_resource
 * tool follows this pattern with (uri, server_name) parameters, routing
 * each call to the correct Client instance.
 *
 * See: https://github.com/modelcontextprotocol/experimental-ext-skills/pull/53
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { SkillManifest, SkillSummary } from "./types.js";
import { buildSkillUri, MANIFEST_PATH, parseSkillUri, SKILL_FILENAME } from "./uri.js";

/**
 * MCP Tool definition for a generic read_resource tool.
 *
 * The model calls read_resource(uri, server_name) and the host routes
 * to the correct MCP Client instance based on server_name.
 *
 * Clients should register this tool with their AI provider and wire the
 * handler to route calls to the appropriate Client's readResource() method.
 *
 * Example wiring (pseudocode):
 * ```typescript
 * registerTool(READ_RESOURCE_TOOL, async (params) => {
 *   const client = getClientForServer(params.server_name);
 *   return client.readResource({ uri: params.uri });
 * });
 * ```
 *
 * Note: Some clients this tool natively — this schema is for
 * other clients that need to expose read_resource to the model.
 *
 * See: https://github.com/modelcontextprotocol/experimental-ext-skills/pull/53
 */
export const READ_RESOURCE_TOOL: Tool = {
  name: "read_resource",
  description:
    "Read a resource from an MCP server by its URI. " +
    "Use this to load skill content, manifests, and supporting files.",
  inputSchema: {
    type: "object",
    properties: {
      uri: {
        type: "string",
        description: "The resource URI (e.g., skill://code-review/SKILL.md)",
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

      skills.push({
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
    lines.push(`- ${skill.name} (${skill.uri})${desc}`);
  }
  return lines.join("\n");
}

/**
 * Read a skill's SKILL.md content from an MCP server.
 *
 * Constructs the skill:// URI and calls client.readResource().
 * Returns the full SKILL.md text including YAML frontmatter.
 */
export async function readSkillContent(
  client: Client,
  skillName: string,
): Promise<string> {
  const uri = buildSkillUri(skillName);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (content && "text" in content) return content.text;
  throw new Error(`Expected text content for ${uri}`);
}

/**
 * Read a skill's file manifest from an MCP server.
 *
 * Returns the parsed SkillManifest with file paths, sizes, and SHA256 hashes.
 * Useful for discovering supporting files and verifying content integrity.
 */
export async function readSkillManifest(
  client: Client,
  skillName: string,
): Promise<SkillManifest> {
  const uri = buildSkillUri(skillName, MANIFEST_PATH);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (content && "text" in content)
    return JSON.parse(content.text) as SkillManifest;
  throw new Error(`Expected JSON content for ${uri}`);
}

/**
 * Read a supporting file from a skill directory.
 *
 * The documentPath is relative to the skill root (e.g., "references/REFERENCE.md").
 * Returns text content for text MIME types and base64-encoded blob for binary files.
 */
export async function readSkillDocument(
  client: Client,
  skillName: string,
  documentPath: string,
): Promise<{ text?: string; blob?: string; mimeType?: string }> {
  const uri = buildSkillUri(skillName, documentPath);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (!content) throw new Error(`No content returned for ${uri}`);
  return {
    text: "text" in content ? content.text : undefined,
    blob: "blob" in content ? content.blob : undefined,
    mimeType: content.mimeType,
  };
}
