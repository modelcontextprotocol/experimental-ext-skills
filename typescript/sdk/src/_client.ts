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
 *   - SDK wrappers per the SEP: listSkills(), listSkillsFromIndex(), readSkillUri()
 */

import type { SkillManifest, SkillSummary, SkillIndex, SkillTemplateEntry } from "./types.js";
import { KNOWN_SKILL_INDEX_SCHEMAS } from "./types.js";
import {
  buildSkillUri,
  MANIFEST_PATH,
  INDEX_JSON_URI,
  parseSkillUri,
  SKILL_FILENAME,
} from "./uri.js";

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
 * Fetch and parse skill://index.json from an MCP server.
 * Returns the parsed SkillIndex or null if unavailable.
 * Shared by listSkillsFromIndex() and listSkillTemplatesFromIndex().
 */
async function fetchAndParseIndex(
  client: SkillsClient,
): Promise<SkillIndex | null> {
  try {
    const result = await client.readResource({ uri: INDEX_JSON_URI });
    const content = result.contents[0];
    if (!content || !("text" in content) || !content.text) return null;

    const index = JSON.parse(content.text) as SkillIndex;

    // SEP: clients SHOULD validate $schema against known URIs before processing
    if (index.$schema && !KNOWN_SKILL_INDEX_SCHEMAS.has(index.$schema)) {
      console.warn(
        `[ext-skills] Unrecognized skill index $schema: "${index.$schema}". ` +
        `Known schemas: ${[...KNOWN_SKILL_INDEX_SCHEMAS].join(", ")}. Proceeding anyway.`,
      );
    }

    if (!index.skills || !Array.isArray(index.skills)) return null;

    return index;
  } catch {
    return null;
  }
}

/**
 * List skills by reading the well-known skill://index.json resource.
 *
 * This is the SEP's primary enumeration mechanism, following the Agent Skills
 * well-known URI discovery index format. Returns null if the server does not
 * expose skill://index.json (enumeration is optional per the SEP).
 *
 * Hosts MUST NOT treat an absent or empty index as proof that a server has
 * no skills — a skill:// URI is always directly readable via resources/read.
 */
export async function listSkillsFromIndex(
  client: SkillsClient,
): Promise<SkillSummary[] | null> {
  const index = await fetchAndParseIndex(client);
  if (!index) return null;

  return index.skills
    .filter((entry) => entry.type === "skill-md")
    .map((entry) => {
      // Extract skillPath from the url field (strip "skill://" prefix and "/SKILL.md" suffix)
      const parsed = parseSkillUri(entry.url);
      const skillPath = parsed?.skillPath ?? entry.name;

      return {
        name: entry.name,
        skillPath,
        uri: entry.url,
        description: entry.description,
        mimeType: "text/markdown",
      };
    });
}

/**
 * List resource template entries from skill://index.json.
 *
 * Returns template entries for parameterized skill namespaces
 * (e.g., skill://docs/{product}/SKILL.md). Returns null if the
 * server does not expose skill://index.json.
 */
export async function listSkillTemplatesFromIndex(
  client: SkillsClient,
): Promise<SkillTemplateEntry[] | null> {
  const index = await fetchAndParseIndex(client);
  if (!index) return null;

  return index.skills
    .filter((entry) => entry.type === "mcp-resource-template")
    .map((entry) => ({
      name: entry.name,
      description: entry.description,
      uriTemplate: entry.uriTemplate,
    }));
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

