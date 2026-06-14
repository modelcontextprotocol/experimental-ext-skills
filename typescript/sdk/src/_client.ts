/**
 * Client-side utilities for discovering, reading, and summarizing skills
 * exposed as MCP resources by a skills server.
 *
 * Each MCP Client instance is inherently server-scoped — it represents a
 * connection to a single MCP server. This is the architectural basis for
 * excluding server names from skill:// URIs: disambiguation happens at
 * the call site, not in the URI.
 *
 * Per the SEP, skill:// is SHOULD, not MUST. Servers MAY serve skills
 * under any scheme (e.g., github://, repo://) provided each skill is
 * listed in skill://index.json. The index is the authoritative record
 * of which resources are skills; outside the index, hosts recognize
 * skills by the skill:// scheme prefix.
 *
 * Key evolution from previous version:
 *   - Multi-segment skill paths: skillPath may have a prefix before name
 *     (per the SEP, the final segment of skillPath equals frontmatter name)
 *   - SDK wrappers per the SEP: listSkills(), listSkillsFromIndex(), readSkillUri()
 */

import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import type {
  SkillSummary,
  SkillIndex,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  UnpackedSkillArchive,
  ExtractArchiveOptions,
} from "./types.js";
import { generateSkillsXMLFromSummaries } from "./xml.js";
import {
  buildSkillUri,
  INDEX_JSON_URI,
  parseSkillUri,
  SKILL_FILENAME,
  extractSkillPathFromUri,
} from "./uri.js";
import {
  extractSkillArchive,
  stripArchiveSuffix,
  detectArchiveFormat,
} from "./archive.js";
import {
  DIRECTORY_READ_METHOD,
  DirectoryReadResultSchema,
  type DirectoryChild,
  type DirectoryReadResult,
} from "./directory.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";

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
  /**
   * Optional. Returns the connected server's `instructions` string from the
   * `initialize` response, when the underlying client exposes it. Used by
   * `discoverSkills()` to mine instructions for skill URIs per the SEP's
   * third discovery path.
   */
  getInstructions?(): string | undefined;
  /**
   * Optional. The connected server's advertised capabilities (the MCP SDK
   * Client exposes this). Used to gate `resources/directory/read` on the
   * server having declared `extensions["io.modelcontextprotocol/skills"]
   * .directoryRead`.
   */
  getServerCapabilities?(): {
    extensions?: Record<string, { directoryRead?: boolean } | undefined>;
  } | undefined;
  /**
   * Optional. Low-level JSON-RPC request, used for extension methods that
   * have no high-level wrapper (e.g. `resources/directory/read`). Mirrors the
   * MCP SDK Client's `request(request, resultSchema, options?)`. The result
   * schema is passed through to the underlying client; we annotate the return
   * as `unknown` and narrow at the call site.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request?(request: { method: string; params?: unknown }, resultSchema: any): Promise<unknown>;
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
 * This tool is general-purpose — it reads any MCP resource — and
 * benefits resource use cases beyond skills.
 *
 * Per the SEP: "Including the server name disambiguates identical
 * skill:// URIs served by different connected servers."
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
 * MCP Tool definition for a name-keyed read_skill tool.
 *
 * The model calls read_skill(name) and the host looks the name up in
 * its skill registry, routing to a filesystem read or an MCP
 * `resources/read` based on origin. The model neither knows nor cares
 * which path was taken — this matches the SEP's "Hosts: End-to-End
 * Integration" guidance for hosts that already expose a name-keyed
 * skill loader for filesystem skills and want to extend it to cover
 * MCP-served skills.
 *
 * Companion to READ_RESOURCE_TOOL: the latter is general-purpose and
 * disambiguates by `(server, uri)`; this one is skills-specific and
 * disambiguates by host registry lookup.
 */
export const READ_SKILL_TOOL: ToolDefinition = {
  name: "read_skill",
  description: "Load a skill's SKILL.md into context.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The skill name",
      },
    },
    required: ["name"],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * List all skills available from an MCP client via resources/list.
 *
 * Calls resources/list, filters for skill://{skillPath}/SKILL.md URIs,
 * and returns SkillSummary objects with both name and skillPath.
 * Handles pagination automatically.
 *
 * This function only finds skills using the skill:// scheme. Per the SEP,
 * "outside the index, hosts recognize skills by the skill:// scheme prefix."
 * For servers that use other schemes, use listSkillsFromIndex() instead —
 * the index is the authoritative record of which resources are skills.
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
 */
async function fetchAndParseIndex(
  client: SkillsClient,
): Promise<SkillIndex | null> {
  try {
    const result = await client.readResource({ uri: INDEX_JSON_URI });
    const content = result.contents[0];
    if (!content || !("text" in content) || !content.text) return null;

    const index = JSON.parse(content.text) as SkillIndex;

    // Per SEP-2640 the index carries no `$schema`/version marker — the format
    // is versioned by the extension itself, so there is nothing to validate
    // beyond the presence of a `skills` array.
    if (!index.skills || !Array.isArray(index.skills)) return null;

    return index;
  } catch {
    return null;
  }
}

/** Pull a string field from a frontmatter object, or undefined. */
function frontmatterString(
  frontmatter: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = frontmatter?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * List skills by reading the well-known skill://index.json resource.
 *
 * This is the SEP's primary enumeration mechanism, following the Agent Skills
 * well-known URI discovery index format. Returns null if the server does not
 * expose skill://index.json (enumeration is optional per the SEP).
 *
 * Scheme-agnostic: index entries may use any URI scheme (skill://, github://,
 * repo://, etc.) per the SEP. For skill:// URIs, skillPath is extracted from
 * the URI structure. For other schemes, skillPath falls back to entry.name
 * (the skill's frontmatter name). The uri field always carries the raw URL
 * from the index, regardless of scheme.
 *
 * Hosts MUST NOT treat an absent or empty index as proof that a server has
 * no skills — a skill:// URI is always directly readable via resources/read.
 *
 * Per SEP-2640 each entry is type-less: a `url` (with `digest`) means the
 * skill is served as individual files; a non-empty `archives` array means it
 * is available packed. Name and description come from the entry's verbatim
 * `frontmatter`. An entry with neither `url` nor `archives` is malformed and
 * is skipped.
 */
export async function listSkillsFromIndex(
  client: SkillsClient,
): Promise<SkillSummary[] | null> {
  const index = await fetchAndParseIndex(client);
  if (!index) return null;

  const summaries: SkillSummary[] = [];
  for (const entry of index.skills) {
    const name = frontmatterString(entry.frontmatter, "name");
    const description = frontmatterString(entry.frontmatter, "description");

    if (entry.url) {
      // Per SEP-2640, `<skill-path>` structural constraints apply regardless
      // of scheme. Extract the path between `<scheme>://` and `/SKILL.md`;
      // fall back to the frontmatter name only when the URL lacks that form.
      const skillPath = extractSkillPathFromUri(entry.url) ?? name ?? entry.url;
      summaries.push({
        name: name ?? skillPath,
        skillPath,
        uri: entry.url,
        type: "skill-md",
        description,
        mimeType: "text/markdown",
        digest: entry.digest,
        archives: entry.archives,
      });
    } else if (entry.archives && entry.archives.length > 0) {
      // Archive-only skill. Expose the first archive's URL on `uri` so callers
      // know how to fetch; the post-unpack `skillPath` is derived from it by
      // stripping the archive suffix (skill://pdf-processing.tar.gz unpacks to
      // skill://pdf-processing/).
      const primary = entry.archives[0];
      const stripped = stripArchiveSuffix(primary.url);
      const skillPath =
        extractSkillPathFromUri(stripped + "/SKILL.md") ?? name ?? primary.url;
      summaries.push({
        name: name ?? skillPath,
        skillPath,
        uri: primary.url,
        type: "archive",
        description,
        mimeType:
          primary.mimeType ??
          (detectArchiveFormat(undefined, primary.url) === "zip"
            ? "application/zip"
            : "application/gzip"),
        digest: primary.digest,
        archives: entry.archives,
      });
    }
    // Entries with neither `url` nor `archives` violate SEP-2640 — skip.
  }
  return summaries;
}

/**
 * Read a resource by its full URI from an MCP server.
 *
 * Scheme-agnostic: works with any URI scheme (skill://, github://, repo://, etc.).
 * This is the primary read function for skills discovered via listSkillsFromIndex(),
 * which may return URIs in any scheme. Pass the SkillSummary.uri value directly.
 *
 * Per PR #69: this is the SDK wrapper for client.read_skill_uri().
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
 * Verify that `data` matches an expected `sha256:{hex}` digest from a
 * `skill://index.json` entry — the integrity/tamper check SEP-2640 asks hosts
 * to perform on retrieved content.
 *
 * Index digests are over the SKILL.md file's **raw bytes**. When `data` is a
 * string (the usual case — `resources/read` returns `text`), it is hashed as
 * UTF-8. This is exact for `SKILL.md`, which the Agent Skills spec requires to
 * be UTF-8: a UTF-8 decode→encode round-trip is byte-identical (CRLF, BOM, and
 * multibyte content all preserved), so a faithfully-served file always
 * matches. Only genuinely non-UTF-8 bytes (disallowed for `SKILL.md`) would
 * differ — pass a `Buffer` of the exact bytes received in that case.
 *
 * Note this is the *tamper-detection* use of the digest. The digest's other
 * purpose — caching — is a different operation: compare the new index
 * `digest` string against a previously-stored one (no content hashing). See
 * the README "Caching with the index digest" section.
 *
 * The comparison is case-insensitive on the hex.
 */
export function verifyDigest(
  data: Buffer | string,
  expected: string,
): boolean {
  const actual = "sha256:" + createHash("sha256").update(data).digest("hex");
  return actual.toLowerCase() === expected.toLowerCase();
}

/**
 * Read a skill resource and verify it against an expected `sha256:{hex}`
 * digest (e.g. `SkillSummary.digest`). Throws if the digest does not match.
 * Returns the text content on success.
 */
export async function readSkillUriVerified(
  client: SkillsClient,
  uri: string,
  expectedDigest: string,
): Promise<string> {
  const text = await readSkillUri(client, uri);
  if (!verifyDigest(text, expectedDigest)) {
    throw new Error(
      `Digest mismatch for ${uri}: content does not match index digest ${expectedDigest}`,
    );
  }
  return text;
}

/**
 * Whether the connected server has declared the SEP-2640 `directoryRead`
 * capability under `extensions["io.modelcontextprotocol/skills"]`. Clients
 * MUST NOT call `resources/directory/read` unless this is true.
 */
export function serverSupportsDirectoryRead(client: SkillsClient): boolean {
  const ext = client.getServerCapabilities?.()?.extensions?.[SKILLS_EXTENSION_ID];
  return !!ext && ext.directoryRead === true;
}

/**
 * List the direct children of a directory resource via the SEP-2640
 * `resources/directory/read` method. Returns the children (files and
 * subdirectories — subdirectories carry `mimeType: "inode/directory"`) plus
 * an optional `nextCursor` for pagination. The listing is metadata-only and
 * non-recursive; descend by calling again on a child directory's URI.
 *
 * Throws if the server has not declared the `directoryRead` capability, or if
 * the structural client does not expose a low-level `request` method.
 */
export async function readDirectory(
  client: SkillsClient,
  uri: string,
  options?: { cursor?: string },
): Promise<DirectoryReadResult> {
  if (!serverSupportsDirectoryRead(client)) {
    throw new Error(
      `Server did not declare the "directoryRead" capability; resources/directory/read is not available.`,
    );
  }
  if (!client.request) {
    throw new Error(
      `Client does not expose a low-level request() method for resources/directory/read.`,
    );
  }
  const result = (await client.request(
    {
      method: DIRECTORY_READ_METHOD,
      params: { uri, ...(options?.cursor ? { cursor: options.cursor } : {}) },
    },
    DirectoryReadResultSchema,
  )) as DirectoryReadResult;
  return result;
}

/**
 * Walk a directory subtree depth-first via repeated `resources/directory/read`
 * calls, yielding every descendant file (not directories). Convenience over
 * {@link readDirectory} for hosts that want to materialize a whole skill.
 */
export async function walkDirectory(
  client: SkillsClient,
  rootUri: string,
): Promise<DirectoryChild[]> {
  const files: DirectoryChild[] = [];
  const queue: string[] = [rootUri];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let cursor: string | undefined;
    do {
      const { resources, nextCursor } = await readDirectory(client, dir, {
        cursor,
      });
      for (const child of resources) {
        if (child.mimeType === "inode/directory") {
          queue.push(child.uri);
        } else {
          files.push(child);
        }
      }
      cursor = nextCursor;
    } while (cursor);
  }
  return files;
}

/**
 * Read a skill's SKILL.md content by skill path.
 *
 * Convenience method that builds a skill:// URI from the skill path.
 * Only works for skills using the skill:// scheme. For other schemes,
 * use readSkillUri() with the full URI from SkillSummary.uri.
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
 * Uses the `yaml` package so multi-line scalars, quoted strings, and other
 * non-trivial YAML constructs are handled correctly. Returns null if the
 * content lacks closed `---` frontmatter, the frontmatter is not a YAML
 * mapping, or the `name` field is missing/non-string.
 */
export function parseSkillFrontmatter(
  content: string,
): { name: string; description: string } | null {
  if (!content.startsWith("---")) return null;

  // Match an opening `---` line followed by a closing `---` line. Using a
  // line-anchored split keeps `---` inside the body (e.g., a horizontal
  // rule) from terminating the frontmatter early.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) return null;

  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1]);
  } catch {
    return null;
  }

  if (typeof frontmatter !== "object" || frontmatter === null) return null;
  const fm = frontmatter as Record<string, unknown>;

  if (typeof fm.name !== "string") return null;
  const name = fm.name.trim();
  if (!name) return null;

  const description = typeof fm.description === "string"
    ? fm.description.trim()
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
 * Build a structured skill catalog for system prompt injection.
 *
 * Produces an XML `<available_skills>` block (per agentskills.io guide) with
 * behavioral instructions that tell the model which tool (and optionally
 * which server) to use for loading skill content on demand.
 *
 * When the reader tool accepts a `server` parameter (e.g. the bundled
 * `READ_RESOURCE_TOOL`, or Claude Code's `ReadMcpResourceTool`), pass
 * `serverName` so the instructions name it. The e2e agent demo found that
 * including the server name raises activation reliability from ~33% to ~90%
 * for those tools — without it the model hallucinates a server name or
 * skips the tool call. When the reader tool is already scoped to one
 * server and only takes `uri`, omit `serverName`: the catalog will drop
 * the server clause instead of telling the model about an unused argument.
 *
 * Scheme-agnostic: uses SkillSummary.uri as-is, so skills served under any
 * URI scheme (skill://, repo://, github://, etc.) are included correctly.
 *
 * @returns A string ready for system prompt injection, or empty string if no skills.
 */
export function buildSkillsCatalog(
  skills: SkillSummary[],
  options: SkillsCatalogOptions,
): string {
  if (skills.length === 0) return "";

  const { toolName, serverName, serverInEntries } = options;
  const xml = generateSkillsXMLFromSummaries(skills, {
    serverName,
    serverInEntries,
  });

  const instructions = serverName
    ? [
        `When a task matches a skill's description, use the \`${toolName}\` tool`,
        `with server \`${serverName}\` and the skill's URI to load its full`,
        "instructions before proceeding.",
      ]
    : [
        `When a task matches a skill's description, use the \`${toolName}\` tool`,
        "with the skill's URI to load its full instructions before proceeding.",
      ];

  return [
    "",
    "## Available Skills",
    "",
    "The following skills provide specialized instructions for specific tasks.",
    ...instructions,
    "",
    xml,
    "",
  ].join("\n");
}

/**
 * Fetch a skill archive from an MCP server and unpack it in memory.
 *
 * Per SEP-2640, archive entries in `skill://index.json` reference a single
 * resource that contains a packed skill directory (`.tar.gz` or `.zip`).
 * This fetches the archive via `resources/read`, dispatches on the
 * resource's `mimeType` (falling back to URL suffix), and unpacks with
 * archive safety: rejects path-traversal, absolute paths, symlinks
 * resolving outside the skill directory, and decompression bombs.
 *
 * The returned `files` map is keyed by paths relative to the skill root.
 * After unpacking, `files.get("SKILL.md")` is the skill's content, and
 * other entries correspond to `skill://<skillPath>/<file-path>` exactly
 * as if served as individual resources.
 *
 * @example
 * ```typescript
 * const summary = (await listSkillsFromIndex(client))!
 *   .find((s) => s.type === "archive")!;
 * const archive = await readSkillArchive(client, summary.uri);
 * const skillMd = archive.files.get("SKILL.md")!.toString("utf-8");
 * ```
 */
export async function readSkillArchive(
  client: SkillsClient,
  archiveUri: string,
  options?: ExtractArchiveOptions,
): Promise<UnpackedSkillArchive> {
  const result = await client.readResource({ uri: archiveUri });
  const content = result.contents[0];
  if (!content) {
    throw new Error(`No content returned for archive ${archiveUri}`);
  }

  let bytes: Buffer;
  if ("blob" in content && content.blob) {
    bytes = Buffer.from(content.blob, "base64");
  } else if ("text" in content && content.text !== undefined) {
    // Fallback: some servers may serve archives as base64 text. The
    // resources/read content shape is either text or blob; we don't
    // expect text for archives but accept it as a courtesy.
    bytes = Buffer.from(content.text, "base64");
  } else {
    throw new Error(
      `Archive resource ${archiveUri} returned neither blob nor text content`,
    );
  }

  return extractSkillArchive(
    bytes,
    { mimeType: content.mimeType, url: archiveUri },
    options,
  );
}

/**
 * Read a supporting file from a skill directory.
 *
 * The documentPath is relative to the skill root (e.g., "references/REFERENCE.md").
 * Constructs a skill:// URI — only works for skills using the skill:// scheme.
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
 * Extract skill URIs from a server's `instructions` string.
 *
 * Looks for any URI of the form `<scheme>://...` mentioned in the
 * instructions text, where the URI's path ends with `SKILL.md` (case
 * insensitive). The host SKILL.md treats server `instructions` as one of
 * the three SEP discovery paths: a server can name specific skill URIs
 * that become readable without any catalog round trip.
 *
 * Returns a deduplicated array of URI strings, in first-seen order.
 */
export function extractSkillUrisFromInstructions(
  instructions: string | undefined,
): string[] {
  if (!instructions) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // Match any <scheme>://<path> token where the path ends at SKILL.md.
  // Stops at whitespace and common URI-terminating characters in prose.
  const regex = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s`'"<>)\]]*?[Ss][Kk][Ii][Ll][Ll]\.[Mm][Dd]/g;
  for (const match of instructions.matchAll(regex)) {
    const uri = match[0];
    if (!seen.has(uri)) {
      seen.add(uri);
      out.push(uri);
    }
  }
  return out;
}

/**
 * Read each URI mentioned in the server's instructions, parse the
 * resulting SKILL.md frontmatter, and produce SkillSummary entries.
 *
 * URIs whose `resources/read` fails or whose content lacks valid
 * frontmatter are silently dropped — instructions are advisory, and a
 * misnamed URI shouldn't fail discovery for the rest.
 *
 * Pass `options.extractor` to replace the built-in regex with a custom
 * URI extractor (useful for servers with non-standard URI conventions
 * in their instructions text).
 */
export async function listSkillsFromInstructions(
  client: SkillsClient,
  instructions: string,
  options?: { extractor?: InstructionsUriExtractor },
): Promise<SkillSummary[]> {
  const extract = options?.extractor ?? extractSkillUrisFromInstructions;
  const uris = extract(instructions);
  if (uris.length === 0) return [];

  const summaries: SkillSummary[] = [];
  for (const uri of uris) {
    try {
      const text = await readSkillUri(client, uri);
      const fm = parseSkillFrontmatter(text);
      const skillPath =
        extractSkillPathFromUri(uri) ?? fm?.name ?? uri;
      summaries.push({
        name: fm?.name ?? skillPath,
        skillPath,
        uri,
        type: "skill-md",
        description: fm?.description,
        mimeType: "text/markdown",
      });
    } catch {
      // Instructions may name a URI we can't read or parse — skip it.
    }
  }
  return summaries;
}

/**
 * Merge two SkillSummary arrays, dropping the latter's entries whose URI
 * already appears in the former. Preserves the first-array order.
 */
function mergeUniqueByUri(
  primary: SkillSummary[],
  extra: SkillSummary[],
): SkillSummary[] {
  if (extra.length === 0) return primary;
  const seen = new Set(primary.map((s) => s.uri));
  const merged = [...primary];
  for (const s of extra) {
    if (!seen.has(s.uri)) {
      merged.push(s);
      seen.add(s.uri);
    }
  }
  return merged;
}

/**
 * Discover all available skills from an MCP server.
 *
 * By default, follows two of the SEP's three discovery paths:
 *   1. `skill://index.json` (authoritative, scheme-agnostic)
 *   2. `resources/list` fallback (skill:// scheme only)
 *
 * Pass `{ instructions: true }` to enable the SEP's third path — mining
 * the server's `instructions` string for skill URIs. When enabled, URIs
 * named in `instructions` are merged with index entries (deduplicated by
 * URI), so an enumerable server gets its full catalog plus any URIs the
 * instructions explicitly call out, and an unenumerable server (no
 * index) still surfaces what its instructions name. The fallback to
 * `resources/list` runs only when both prior paths are empty.
 *
 * `instructions` are read via `client.getInstructions()` when the client
 * exposes it (the MCP SDK Client does); structural clients without that
 * method skip the second path silently.
 *
 * Pass `{ extractor }` to override the built-in regex used to find URIs
 * inside the instructions text — useful for servers with non-standard
 * URI conventions in prose.
 */
export async function discoverSkills(
  client: SkillsClient,
  options?: DiscoverSkillsOptions,
): Promise<SkillSummary[]> {
  const wantInstructions = options?.instructions ?? false;
  const instructions = wantInstructions ? client.getInstructions?.() : undefined;
  const fromInstructions = instructions
    ? await listSkillsFromInstructions(client, instructions, {
        extractor: options?.extractor,
      })
    : [];

  // Primary: skill://index.json (authoritative, scheme-agnostic)
  const indexSkills = await listSkillsFromIndex(client);
  if (indexSkills !== null && indexSkills.length > 0) {
    return mergeUniqueByUri(indexSkills, fromInstructions);
  }

  // No usable index — instructions next, then resources/list
  if (fromInstructions.length > 0) return fromInstructions;
  return listSkills(client);
}

/**
 * Discover skills and build a system prompt catalog in one call.
 *
 * Combines discoverSkills() and buildSkillsCatalog() — the most common
 * client-side workflow. Returns both the discovered skills (for logging,
 * filtering, or other use) and the ready-to-inject catalog text.
 *
 * The catalog includes behavioral instructions that tell the model which
 * tool and server to use for loading skill content on demand. Including
 * the server name raises activation reliability from ~33% to ~90%.
 *
 * @example
 * ```typescript
 * const { skills, catalog } = await discoverAndBuildCatalog(client, {
 *   serverName: "my-skills-server",
 * });
 * // Inject `catalog` into your agent's system prompt
 * ```
 */
export async function discoverAndBuildCatalog(
  client: SkillsClient,
  options?: DiscoverCatalogOptions,
): Promise<DiscoverCatalogResult> {
  const skills = await discoverSkills(client, {
    instructions: options?.instructions,
    extractor: options?.extractor,
  });
  const catalog = buildSkillsCatalog(skills, {
    toolName: options?.toolName ?? READ_RESOURCE_TOOL.name,
    serverName: options?.serverName,
    serverInEntries: options?.serverInEntries,
  });
  return { skills, catalog };
}

