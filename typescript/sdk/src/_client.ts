/**
 * Client-side utilities for discovering, reading, and summarizing skills
 * exposed as MCP resources by a skills server.
 *
 * Each MCP Client instance is inherently server-scoped — it represents a
 * connection to a single MCP server. This is the architectural basis for
 * excluding server names from skill:// URIs: disambiguation happens at
 * the call site, not in the URI.
 *
 * Key evolution from previous version:
 *   - Multi-segment skill paths: skillPath may have a prefix before name
 *     (per the SEP, the final segment of skillPath equals frontmatter name)
 *   - SEP-2093: fetchSkillMetadata() for metadata-only access
 *   - SDK wrappers per the SEP: listSkills(), readSkillUri()
 */

import type { SkillManifest, SkillSummary } from "./types.js";
import {
  buildSkillUri,
  MANIFEST_PATH,
  parseSkillUri,
  SKILL_FILENAME,
} from "./uri.js";
import { ResourcesMetadataResultSchema, ScopedListResultSchema } from "./resource-extensions.js";

/**
 * Minimal structural interface for an MCP Client.
 * Using a structural type avoids issues with duplicate SDK installations
 * causing private-property type incompatibilities.
 */
export interface SkillsClient {
  listResources(
    params?: { cursor?: string },
  ): Promise<{
    resources: Array<{
      uri: string;
      name?: string;
      description?: string;
      mimeType?: string;
    }>;
    nextCursor?: string;
  }>;
  readResource(params: {
    uri: string;
  }): Promise<{
    contents: Array<{
      uri?: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }>;
  request(
    request: { method: string; params?: Record<string, unknown> },
    schema: unknown,
  ): Promise<unknown>;
}

/**
 * MCP Tool definition type — matches the SDK's Tool interface.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * MCP Tool definition for a generic read_resource tool.
 *
 * The model calls read_resource(server, uri) and the host routes
 * to the correct MCP Client instance based on the server name.
 *
 * Per the SEP: "Including the server name disambiguates identical
 * skill:// URIs served by different connected servers."
 */
/**
 * Tool schema matching the SEP's specification exactly.
 * This tool is general-purpose — it reads any MCP resource — and
 * benefits resource use cases beyond skills.
 */
export const READ_RESOURCE_TOOL: ToolDefinition = {
  name: "read_resource",
  description: "Read an MCP resource from a connected server.",
  inputSchema: {
    type: "object",
    properties: {
      server: {
        type: "string",
        description: "Name of the connected MCP server",
      },
      uri: {
        type: "string",
        description:
          "The resource URI, e.g. skill://git-workflow/SKILL.md",
      },
    },
    required: ["server", "uri"],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * List all skills available from an MCP client.
 *
 * Calls resources/list, filters for skill://{skillPath}/SKILL.md URIs,
 * and returns SkillSummary objects with both name and skillPath.
 * Handles pagination automatically.
 *
 * Per PR #69: this is the SDK wrapper for client.list_skills().
 */
export async function listSkills(client: SkillsClient): Promise<SkillSummary[]> {
  const skills: SkillSummary[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listResources(
      cursor ? { cursor } : undefined,
    );

    for (const resource of result.resources) {
      const parsed = parseSkillUri(resource.uri);
      if (!parsed) continue;
      if (
        parsed.filePath !== SKILL_FILENAME &&
        parsed.filePath.toLowerCase() !== "skill.md"
      )
        continue;

      skills.push({
        name: resource.name ?? parsed.skillPath,
        skillPath: parsed.skillPath,
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
 * Read a resource by its full URI from an MCP server.
 *
 * Per PR #69: this is the SDK wrapper for client.read_skill_uri().
 * Any valid skill:// URI can be read directly.
 */
export async function readSkillUri(
  client: SkillsClient,
  uri: string,
): Promise<string> {
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (content && "text" in content && content.text) return content.text;
  throw new Error(`Expected text content for ${uri}`);
}

/**
 * Read a skill's SKILL.md content by skill path.
 *
 * Convenience method that builds the URI from the skill path.
 */
export async function readSkillContent(
  client: SkillsClient,
  skillPath: string,
): Promise<string> {
  const uri = buildSkillUri(skillPath);
  return readSkillUri(client, uri);
}

/**
 * Parse name and description from SKILL.md YAML frontmatter content.
 *
 * Uses a simple regex approach — no yaml dependency required on the client side.
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
 * Shows both name (identity) and skillPath (locator).
 */
export function buildSkillsSummary(skills: SkillSummary[]): string {
  if (skills.length === 0) return "No skills available.";

  const lines = ["Available skills:"];
  for (const skill of skills) {
    const desc = skill.description ? `: ${skill.description}` : "";
    const pathInfo =
      skill.name !== skill.skillPath
        ? ` [path: ${skill.skillPath}]`
        : "";
    lines.push(`- ${skill.name}${pathInfo} (${skill.uri})${desc}`);
  }
  return lines.join("\n");
}

/**
 * Read a skill's file manifest from an MCP server.
 *
 * Returns the parsed SkillManifest with file paths, sizes, and SHA256 hashes.
 */
export async function readSkillManifest(
  client: SkillsClient,
  skillPath: string,
): Promise<SkillManifest> {
  const uri = buildSkillUri(skillPath, MANIFEST_PATH);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (content && "text" in content && content.text)
    return JSON.parse(content.text) as SkillManifest;
  throw new Error(`Expected JSON content for ${uri}`);
}

/**
 * Read a supporting file from a skill directory.
 *
 * The documentPath is relative to the skill root (e.g., "references/REFERENCE.md").
 */
export async function readSkillDocument(
  client: SkillsClient,
  skillPath: string,
  documentPath: string,
): Promise<{ text?: string; blob?: string; mimeType?: string }> {
  const uri = buildSkillUri(skillPath, documentPath);
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (!content) throw new Error(`No content returned for ${uri}`);
  return {
    text: "text" in content ? content.text : undefined,
    blob: "blob" in content ? content.blob : undefined,
    mimeType: content.mimeType,
  };
}

/**
 * SEP-2093: Fetch resource metadata without content.
 *
 * Tries the resources/metadata endpoint. Returns null if the server
 * doesn't support SEP-2093 (method not found).
 */
export async function fetchSkillMetadata(
  client: SkillsClient,
  uri: string,
): Promise<{ uri: string; name?: string; description?: string; mimeType?: string; capabilities?: { list?: boolean; subscribe?: boolean } } | null> {
  try {
    // SEP-2093: response shape is { resource: Resource }
    const result = await client.request(
      { method: "resources/metadata", params: { uri } },
      ResourcesMetadataResultSchema,
    ) as { resource: { uri: string; name?: string; description?: string; mimeType?: string; capabilities?: { list?: boolean; subscribe?: boolean }; [key: string]: unknown } };
    return result.resource;
  } catch {
    // Server doesn't support resources/metadata — not an error
    return null;
  }
}

/**
 * List skills via resources/list with URI scoping (SEP-2093).
 *
 * When a `uriScope` is provided (e.g., "skill://acme/"), the server
 * filters to only SKILL.md entries under that prefix. Without a scope,
 * this is equivalent to a standard resources/list call.
 *
 * Returns null if the request fails (e.g., server doesn't support
 * the uri parameter on resources/list).
 */
export async function listSkillsScoped(
  client: SkillsClient,
  uriScope?: string,
): Promise<SkillSummary[] | null> {
  try {
    const result = await client.request(
      {
        method: "resources/list",
        params: uriScope ? { uri: uriScope } : {},
      },
      ScopedListResultSchema,
    ) as { resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }> };

    const skills: SkillSummary[] = [];
    for (const resource of result.resources) {
      const parsed = parseSkillUri(resource.uri);
      if (!parsed) continue;
      if (
        parsed.filePath !== SKILL_FILENAME &&
        parsed.filePath.toLowerCase() !== "skill.md"
      )
        continue;

      skills.push({
        name: resource.name ?? parsed.skillPath,
        skillPath: parsed.skillPath,
        uri: resource.uri,
        description: resource.description,
        mimeType: resource.mimeType,
      });
    }
    return skills;
  } catch {
    return null;
  }
}
