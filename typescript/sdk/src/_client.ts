/**
 * Client-side utilities for discovering, verifying, and reading skills
 * exposed by an MCP server that declares the SEP-2640 v1 skills extension.
 *
 * Each MCP Client instance is inherently server-scoped — it represents a
 * connection to a single MCP server. This is the architectural basis for
 * excluding server names from skill:// URIs: disambiguation happens at
 * the call site, not in the URI.
 *
 * Per SEP-2640, no URI scheme is privileged: a host learns that a resource
 * is a skill from a `skills/list` entry or a `skills/get` answer, never
 * from the URI scheme. The `resources` manifest on an entry — `{uri,
 * digest, size}` for every file of the skill — is the unit of content a
 * host verifies and that a user's approval binds to. Files are fetched
 * only when read, never ahead of need.
 *
 * Reading model:
 *   - `listSkills()` / `getSkill()` fetch entries (`skills/list` / `skills/get`)
 *   - `readSkill(entry)` reads and verifies a SKILL.md (digest + frontmatter
 *     identity check)
 *   - `readSkillResource(entry, uri)` reads and verifies a supporting file;
 *     reads of files not listed in the entry's `resources` are verification
 *     failures per the SEP
 *   - `readSkillUri()` is the unverified baseline: a URI alone is always
 *     enough to read a skill via `resources/read`
 */

import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import type {
  SkillEntry,
  SkillResourceRef,
  SkillsListResult,
  SkillsGetResult,
  SkillSummary,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  ReadSkillOptions,
} from "./types.js";
import { generateSkillsXMLFromSummaries } from "./xml.js";
import {
  buildSkillUri,
  SKILL_FILENAME,
  extractSkillPathFromUri,
} from "./uri.js";
import {
  DIRECTORY_READ_METHOD,
  DirectoryReadResultSchema,
  type DirectoryChild,
  type DirectoryReadResult,
} from "./directory.js";
import {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
  SkillsListResultSchema,
  SkillsGetResultSchema,
  DYNAMIC_RESOURCES,
  MAX_RESOURCES_PER_SKILL,
  MAX_TOTAL_SIZE_PER_SKILL,
} from "./skills-methods.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";

/**
 * Minimal structural interface for an MCP Client.
 * Using a structural type avoids issues with duplicate SDK installations
 * causing private-property type incompatibilities.
 */
export interface SkillsClient {
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
   * Low-level JSON-RPC request, used for the extension methods
   * (`skills/list`, `skills/get`, `resources/directory/read`). Mirrors the
   * MCP SDK Client's `request(request, resultSchema, options?)` — for
   * non-spec methods the v2 SDK requires the result schema, which the
   * wrappers here always pass. The result is annotated `unknown` and
   * narrowed at the call site.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request?(request: { method: string; params?: unknown }, resultSchema: any): Promise<unknown>;
  /**
   * Optional. Returns the connected server's `instructions` string from the
   * `initialize` response, when the underlying client exposes it. Used by
   * `discoverSkills()` to mine instructions for skill URIs, which are then
   * confirmed via `skills/get`.
   */
  getInstructions?(): string | undefined;
  /**
   * Optional. The connected server's advertised capabilities (the MCP SDK
   * Client exposes this). Used to gate the extension methods on the server
   * having declared `extensions["io.modelcontextprotocol/skills"]` (and
   * `resources/directory/read` on its `directoryRead` setting).
   */
  getServerCapabilities?(): {
    extensions?: Record<string, { directoryRead?: boolean } | undefined>;
  } | undefined;
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
 * Per the SEP, the signature includes `server` because two connected
 * servers may both serve `skill://refunds/SKILL.md`; a skill's identity is
 * the pair of server identity and URI.
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

/** Get the low-level request method or throw a descriptive error. */
function requireRequest(
  client: SkillsClient,
  method: string,
): NonNullable<SkillsClient["request"]> {
  if (!client.request) {
    throw new Error(
      `Client does not expose a low-level request() method for ${method}.`,
    );
  }
  return client.request.bind(client);
}

/**
 * Whether the connected server has declared the SEP-2640 skills extension
 * (`extensions["io.modelcontextprotocol/skills"]`). Declaring the extension
 * commits the server to `skills/list` and `skills/get`. Returns `undefined`
 * when the structural client cannot read server capabilities.
 */
export function serverSupportsSkills(
  client: SkillsClient,
): boolean | undefined {
  const caps = client.getServerCapabilities?.();
  if (caps === undefined) return undefined;
  return caps.extensions?.[SKILLS_EXTENSION_ID] !== undefined;
}

/**
 * Whether the connected server has declared the SEP-2640 `directoryRead`
 * capability setting under `extensions["io.modelcontextprotocol/skills"]`.
 * Clients MUST NOT call `resources/directory/read` unless this is true.
 */
export function serverSupportsDirectoryRead(client: SkillsClient): boolean {
  const ext = client.getServerCapabilities?.()?.extensions?.[SKILLS_EXTENSION_ID];
  return !!ext && ext.directoryRead === true;
}

/** Guard shared by the skills methods: throw when the server declaredly lacks the extension. */
function assertSkillsDeclared(client: SkillsClient, method: string): void {
  if (serverSupportsSkills(client) === false) {
    throw new Error(
      `Server has not declared the "${SKILLS_EXTENSION_ID}" extension; ${method} is not available.`,
    );
  }
}

/**
 * List the skills a server serves via the `skills/list` method, following
 * `nextCursor` pagination to exhaustion.
 *
 * The result MAY be empty or partial by design — servers whose skill
 * catalogs are large, generated, or otherwise unenumerable return what they
 * can. Hosts MUST NOT treat an empty or partial listing as proof that a
 * server has no skills; a skill URI handed to the host by other means is
 * still readable (and retrievable via {@link getSkill}).
 *
 * Throws when the server's capabilities are readable and the skills
 * extension is not declared (clients only issue extension calls after
 * seeing the declaration).
 */
export async function listSkills(client: SkillsClient): Promise<SkillEntry[]> {
  assertSkillsDeclared(client, SKILLS_LIST_METHOD);
  const request = requireRequest(client, SKILLS_LIST_METHOD);

  const skills: SkillEntry[] = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    const result = (await request(
      {
        method: SKILLS_LIST_METHOD,
        params: cursor ? { cursor } : {},
      },
      SkillsListResultSchema,
    )) as SkillsListResult;
    skills.push(...result.skills);
    if (result.nextCursor !== undefined && seenCursors.has(result.nextCursor)) {
      throw new Error(
        `skills/list pagination did not advance: server returned a repeated cursor`,
      );
    }
    if (result.nextCursor !== undefined) seenCursors.add(result.nextCursor);
    cursor = result.nextCursor;
  } while (cursor);

  return skills;
}

/**
 * Retrieve a single skill's entry by the URI of its `SKILL.md` via the
 * `skills/get` method. Works for skills absent from the listing — this is
 * how an unlisted skill (named in server instructions, by another skill, or
 * by the user) gets verified and content-bound on the same terms as a
 * listed one. The server answers with error `-32602` for URIs it does not
 * serve as skills; that error propagates to the caller.
 *
 * The result is a point-in-time snapshot; re-calling is how a host
 * refreshes one skill's digests without re-enumerating the catalog.
 */
export async function getSkill(
  client: SkillsClient,
  uri: string,
): Promise<SkillEntry> {
  assertSkillsDeclared(client, SKILLS_GET_METHOD);
  const request = requireRequest(client, SKILLS_GET_METHOD);
  const result = (await request(
    { method: SKILLS_GET_METHOD, params: { uri } },
    SkillsGetResultSchema,
  )) as SkillsGetResult;
  return result.skill;
}

/**
 * Verify that `data` matches an expected `sha256:{hex}` digest from a skill
 * entry's `resources` manifest — the integrity check SEP-2640 makes a MUST
 * when a host retrieves a file listed in `resources`.
 *
 * Digests are over the file's **raw bytes**. When `data` is a string (the
 * usual case — `resources/read` returns `text`), it is hashed as UTF-8.
 * This is exact for `SKILL.md`, which the Agent Skills spec requires to be
 * UTF-8: a UTF-8 decode→encode round-trip is byte-identical (CRLF, BOM, and
 * multibyte content all preserved), so a faithfully-served file always
 * matches. Only genuinely non-UTF-8 bytes would differ — pass a `Buffer` of
 * the exact bytes received in that case.
 *
 * Note this is the *verification* use of the digest. The digest's other
 * purpose — caching — is a different operation: compare a fresh entry's
 * `digest` string against a previously-stored one (no content hashing).
 *
 * The comparison is case-insensitive on the hex.
 *
 * Throws if `expected` is not a well-formed `sha256:{64 hex}` digest, so a
 * caller can distinguish "content was tampered" (returns `false`) from "the
 * entry handed me a digest I can't interpret" (throws) — the latter must not
 * be silently treated as a mismatch when SEP-2640 makes verification a MUST.
 */
export function verifyDigest(
  data: Buffer | string,
  expected: string,
): boolean {
  if (!/^sha256:[0-9a-f]{64}$/i.test(expected)) {
    throw new Error(
      `Malformed digest "${expected}": expected "sha256:" followed by 64 hex characters`,
    );
  }
  const actual = "sha256:" + createHash("sha256").update(data).digest("hex");
  return actual.toLowerCase() === expected.toLowerCase();
}

/**
 * Read a resource by its full URI from an MCP server.
 *
 * Scheme-agnostic: works with any URI scheme (skill://, github://, etc.).
 * This is the SEP baseline — a skill URI is always a valid argument to
 * `resources/read`, listed or not.
 *
 * When `expectedDigest` (a `sha256:{hex}` from the skill's entry) is
 * supplied, the returned content is verified against it and a mismatch
 * throws. Prefer {@link readSkill} / {@link readSkillResource} when you hold
 * the skill's entry — they also enforce the manifest-membership and
 * frontmatter-identity rules.
 */
export async function readSkillUri(
  client: SkillsClient,
  uri: string,
  expectedDigest?: string,
): Promise<string> {
  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (!content || !("text" in content) || typeof content.text !== "string") {
    throw new Error(`Expected text content for ${uri}`);
  }
  if (expectedDigest !== undefined && !verifyDigest(content.text, expectedDigest)) {
    throw new Error(
      `Digest mismatch for ${uri}: content does not match the entry digest ${expectedDigest}`,
    );
  }
  return content.text;
}

/**
 * Read a skill resource and verify it against an expected `sha256:{hex}`
 * digest. Throws if the digest does not match. Returns the text content on
 * success. Thin wrapper over {@link readSkillUri} with a required digest.
 */
export async function readSkillUriVerified(
  client: SkillsClient,
  uri: string,
  expectedDigest: string,
): Promise<string> {
  return readSkillUri(client, uri, expectedDigest);
}

/** Deep structural equality over JSON-shaped values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && a !== null && b !== null && typeof b === "object") {
    const ak = Object.keys(a as Record<string, unknown>);
    const bk = Object.keys(b as Record<string, unknown>);
    if (ak.length !== bk.length) return false;
    return ak.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

/**
 * Parse the full YAML frontmatter of a SKILL.md into a plain object.
 * Returns null if the content lacks closed `---` frontmatter or the
 * frontmatter is not a YAML mapping.
 */
export function parseSkillFrontmatterObject(
  content: string,
): Record<string, unknown> | null {
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
  if (Array.isArray(frontmatter)) return null;
  return frontmatter as Record<string, unknown>;
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
  const fm = parseSkillFrontmatterObject(content);
  if (!fm) return null;

  if (typeof fm.name !== "string") return null;
  const name = fm.name.trim();
  if (!name) return null;

  const description = typeof fm.description === "string"
    ? fm.description.trim()
    : "";

  return { name, description };
}

/**
 * Check the SEP-2640 frontmatter identity requirement: the fetched
 * SKILL.md's parsed YAML frontmatter must be identical in content to the
 * entry's `frontmatter` object. Any discrepancy is a verification failure
 * equivalent to a digest mismatch — what a user approves from the listing
 * must be what the model actually receives.
 *
 * The parsed YAML is JSON round-tripped before comparison so YAML-only
 * value types normalize to their JSON rendering, mirroring how the server
 * rendered the entry's `frontmatter`.
 */
export function frontmatterMatchesEntry(
  content: string,
  entry: SkillEntry,
): boolean {
  const parsed = parseSkillFrontmatterObject(content);
  if (!parsed) return false;
  const normalized = JSON.parse(JSON.stringify(parsed)) as unknown;
  return deepEqual(normalized, entry.frontmatter);
}

/**
 * The entry's `resources` array, or `undefined` for a dynamically
 * generated skill (`"resources": "dynamic"`). Throws for an entry with no
 * `resources` at all or any other value: SEP-2640 makes such an entry
 * invalid, and hosts MUST NOT load it.
 */
export function manifestOf(entry: SkillEntry): SkillResourceRef[] | undefined {
  const { resources } = entry as { resources?: unknown };
  if (resources === DYNAMIC_RESOURCES) return undefined;
  if (!Array.isArray(resources)) {
    throw new Error(
      `Invalid entry for ${entry.uri}: resources must be an array or "dynamic" ` +
        `(got ${resources === undefined ? "nothing" : JSON.stringify(resources)}). Per SEP-2640 the entry must not be loaded.`,
    );
  }
  // Each file is listed exactly once.
  const seen = new Set<string>();
  for (const r of resources as SkillResourceRef[]) {
    if (seen.has(r.uri)) {
      throw new Error(
        `Invalid entry for ${entry.uri}: resources lists ${r.uri} more than once. Per SEP-2640 the entry must not be loaded.`,
      );
    }
    seen.add(r.uri);
  }
  // Each uri MUST be the skill's SKILL.md or a file within its directory.
  const dir = skillDirOf(entry.uri);
  const outside = (resources as SkillResourceRef[]).find(
    (r) => r.uri !== entry.uri && !(dir !== undefined && r.uri.startsWith(dir + "/")),
  );
  if (outside) {
    throw new Error(
      `Invalid entry for ${entry.uri}: resources lists ${outside.uri}, which is outside the skill's directory. Per SEP-2640 the entry must not be loaded.`,
    );
  }
  return resources as SkillResourceRef[];
}

/** The skill directory URI for a `.../SKILL.md` URI, or undefined if it does not end that way. */
function skillDirOf(skillUri: string): string | undefined {
  const idx = skillUri.lastIndexOf("/");
  if (idx <= 0) return undefined;
  const last = skillUri.slice(idx + 1);
  return last.toLowerCase() === "skill.md" ? skillUri.slice(0, idx) : undefined;
}

/**
 * Check an entry against the SEP-2640 per-skill limits from the entry
 * alone — no file is fetched. Hosts MUST support skills up to and including
 * the limits; this tells a host that chooses to decline larger skills which
 * limit was exceeded, so it can tell the user why. A dynamically generated
 * skill has nothing to count and always reports `withinLimits: true`.
 */
export function checkSkillLimits(entry: SkillEntry): {
  withinLimits: boolean;
  resourceCount?: number;
  totalSize?: number;
  exceeded: string[];
} {
  const manifest = manifestOf(entry);
  if (!manifest) return { withinLimits: true, exceeded: [] };
  const resourceCount = manifest.length;
  const totalSize = manifest.reduce((n, r) => n + r.size, 0);
  const exceeded: string[] = [];
  if (resourceCount > MAX_RESOURCES_PER_SKILL) {
    exceeded.push(`${resourceCount} resources exceeds the limit of ${MAX_RESOURCES_PER_SKILL}`);
  }
  if (totalSize > MAX_TOTAL_SIZE_PER_SKILL) {
    exceeded.push(`${totalSize} bytes total exceeds the limit of ${MAX_TOTAL_SIZE_PER_SKILL}`);
  }
  return { withinLimits: exceeded.length === 0, resourceCount, totalSize, exceeded };
}

/** Find the `resources` ref for `uri` in an entry, or undefined. */
function findResourceRef(
  entry: SkillEntry,
  uri: string,
): SkillResourceRef | undefined {
  return manifestOf(entry)?.find((r) => r.uri === uri);
}

/**
 * Verify fetched content against a manifest ref: the byte length must equal
 * the ref's `size` and the SHA-256 digest must match. A length mismatch is
 * a verification failure in its own right (SEP-2640 "Resources"), reported
 * before any hashing.
 */
function verifyAgainstRef(
  data: Buffer | string,
  ref: SkillResourceRef,
): void {
  const length = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
  if (length !== ref.size) {
    throw new Error(
      `Size mismatch for ${ref.uri}: read ${length} bytes but the entry lists ${ref.size}. ` +
        `Per SEP-2640 this is a verification failure equivalent to a digest mismatch.`,
    );
  }
  if (!verifyDigest(data, ref.digest)) {
    throw new Error(
      `Digest mismatch for ${ref.uri}: content does not match the entry digest ${ref.digest}`,
    );
  }
}

/**
 * Read a skill's SKILL.md, verified against its entry — the recommended
 * read path once you hold a {@link SkillEntry} from {@link listSkills} /
 * {@link getSkill}.
 *
 * Performs the host-side MUSTs of SEP-2640:
 *   1. Digest verification — the fetched text is checked against the
 *      `resources` ref matching the entry's top-level `uri`.
 *   2. Frontmatter identity — the fetched SKILL.md's parsed frontmatter is
 *      compared field-by-field against `entry.frontmatter`; any discrepancy
 *      is a verification failure.
 *
 * A verification failure means the content is not what the entry promised —
 * corrupted, tampered with, or stale because the skill changed after the
 * entry was fetched. To recover from staleness, call {@link getSkill} for a
 * fresh entry (which, being different, revokes any content-bound approval)
 * and retry.
 *
 * If the entry's `resources` is `"dynamic"` (a dynamically generated
 * skill), the skill cannot be verified: this throws by default; pass
 * `{ allowUnverified: true }` to read it anyway (the frontmatter identity
 * check still applies). An entry with no `resources` at all is invalid and
 * always throws.
 */
export async function readSkill(
  client: SkillsClient,
  entry: SkillEntry,
  options?: ReadSkillOptions,
): Promise<string> {
  const manifest = manifestOf(entry);
  const selfRef = manifest?.find((r) => r.uri === entry.uri);
  if (manifest && !selfRef) {
    throw new Error(
      `Malformed entry for ${entry.uri}: resources does not include an entry matching the skill's top-level uri`,
    );
  }
  if (!manifest && !options?.allowUnverified) {
    throw new Error(
      `Cannot verify skill ${entry.uri}: the entry's resources is "dynamic" ` +
        `(dynamically generated skill). Pass { allowUnverified: true } to read it without verification.`,
    );
  }

  const text = await readSkillUri(client, entry.uri);
  if (selfRef) verifyAgainstRef(text, selfRef);

  if (!frontmatterMatchesEntry(text, entry)) {
    throw new Error(
      `Frontmatter mismatch for ${entry.uri}: the fetched SKILL.md frontmatter does not match the entry's frontmatter. ` +
        `Per SEP-2640 this is a verification failure equivalent to a digest mismatch.`,
    );
  }

  return text;
}

/**
 * Read a file of a skill, verified against the skill's entry.
 *
 * Enforces the SEP-2640 rule that, while acting on a skill for which the
 * host holds an entry, reads of the skill's files resolve only to URIs
 * listed in that entry's `resources` — a read of an unlisted file within
 * the skill is a verification failure equivalent to a digest mismatch
 * (because `resources` is complete, an unlisted file is a change to the
 * skill). The fetched content (text or binary) is verified against the
 * ref's size and digest.
 *
 * For entries whose `resources` is `"dynamic"` there is nothing to verify
 * against; this throws unless `allowUnverified` is set.
 */
export async function readSkillResource(
  client: SkillsClient,
  entry: SkillEntry,
  uri: string,
  options?: ReadSkillOptions,
): Promise<{ text?: string; blob?: string; mimeType?: string }> {
  const manifest = manifestOf(entry);
  const ref = manifest?.find((r) => r.uri === uri);
  if (!ref) {
    if (manifest) {
      throw new Error(
        `Verification failure: ${uri} is not listed in the resources manifest of ${entry.uri}. ` +
          `Per SEP-2640, a read of an unlisted file within the skill is equivalent to a digest mismatch.`,
      );
    }
    if (!options?.allowUnverified) {
      throw new Error(
        `Cannot verify ${uri}: the entry for ${entry.uri} has "dynamic" resources. ` +
          `Pass { allowUnverified: true } to read it without verification.`,
      );
    }
  }

  const result = await client.readResource({ uri });
  const content = result.contents[0];
  if (!content) throw new Error(`No content returned for ${uri}`);

  if (ref) {
    const data: Buffer | string | undefined =
      typeof content.text === "string"
        ? content.text
        : typeof content.blob === "string"
          ? Buffer.from(content.blob, "base64")
          : undefined;
    if (data === undefined) {
      throw new Error(`Resource ${uri} returned neither text nor blob content`);
    }
    verifyAgainstRef(data, ref);
  }

  return {
    text: "text" in content ? content.text : undefined,
    blob: "blob" in content ? content.blob : undefined,
    mimeType: content.mimeType,
  };
}

/**
 * List the direct children of a directory resource via the SEP-2640
 * `resources/directory/read` method. Returns the children (files and
 * subdirectories — subdirectories carry `mimeType: "inode/directory"`) plus
 * an optional `nextCursor` for pagination. The listing is metadata-only and
 * non-recursive; descend by calling again on a child directory's URI.
 *
 * Throws if the server has not declared the `directoryRead` capability
 * setting, or if the structural client does not expose a low-level
 * `request` method.
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
  const request = requireRequest(client, DIRECTORY_READ_METHOD);
  const result = (await request(
    {
      method: DIRECTORY_READ_METHOD,
      params: { uri, ...(options?.cursor ? { cursor: options.cursor } : {}) },
    },
    DirectoryReadResultSchema,
  )) as DirectoryReadResult;
  return result;
}

/**
 * Walk a directory subtree breadth-first via repeated `resources/directory/read`
 * calls, yielding every descendant file's metadata (not directories, and not
 * contents; nothing is fetched). Reads of a skill's files still go through
 * {@link readSkillResource} against the held entry: SEP-2640 forbids
 * fetching a skill's files ahead of need and treating a directory listing
 * as extending the entry's manifest.
 */
export async function walkDirectory(
  client: SkillsClient,
  rootUri: string,
): Promise<DirectoryChild[]> {
  const files: DirectoryChild[] = [];
  const queue: string[] = [rootUri];
  // Guard against a misbehaving server: don't re-enter a directory we've
  // already walked (cyclic listings), and bail out of a page loop whose
  // `nextCursor` never advances (which would otherwise spin forever).
  const visited = new Set<string>();
  while (queue.length > 0) {
    const dir = queue.shift()!;
    if (visited.has(dir)) continue;
    visited.add(dir);
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
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
      if (nextCursor !== undefined && seenCursors.has(nextCursor)) {
        throw new Error(
          `Pagination did not advance for ${dir}: server returned a repeated cursor`,
        );
      }
      if (nextCursor !== undefined) seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
  }
  return files;
}

/**
 * Read a skill's SKILL.md content by skill path.
 *
 * Convenience method that builds a skill:// URI from the skill path and
 * reads it unverified (the SEP baseline). Only works for skills using the
 * skill:// scheme. Prefer {@link readSkill} when you hold the skill's entry.
 */
export async function readSkillContent(
  client: SkillsClient,
  skillPath: string,
): Promise<string> {
  const uri = buildSkillUri(skillPath);
  return readSkillUri(client, uri);
}

/**
 * Read a supporting file from a skill directory by relative path.
 *
 * The documentPath is relative to the skill root (e.g., "references/REFERENCE.md").
 * Constructs a skill:// URI — only works for skills using the skill://
 * scheme — and reads it unverified. Prefer {@link readSkillResource} when
 * you hold the skill's entry, which also enforces manifest membership.
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
 * insensitive). Per SEP-2640, a server MAY direct the agent to specific
 * skill URIs from its `instructions` field — and a URI found this way is
 * confirmed as a skill by asking the server (`skills/get`), never by
 * inspecting the URI scheme.
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
 * Confirm each URI mentioned in the server's instructions via `skills/get`
 * and return the resulting entries.
 *
 * URIs the server does not serve as skills (the `skills/get` call errors)
 * are silently dropped — instructions are advisory, and a misnamed URI
 * shouldn't fail discovery for the rest. This is the SEP's skill-identity
 * confirmation: the server answers for skills it serves and errors
 * otherwise; the URI scheme proves nothing.
 *
 * Pass `options.extractor` to replace the built-in regex with a custom
 * URI extractor (useful for servers with non-standard URI conventions
 * in their instructions text).
 */
export async function listSkillsFromInstructions(
  client: SkillsClient,
  instructions: string,
  options?: { extractor?: InstructionsUriExtractor },
): Promise<SkillEntry[]> {
  const extract = options?.extractor ?? extractSkillUrisFromInstructions;
  const uris = extract(instructions);
  if (uris.length === 0) return [];

  // The per-URI confirmations are independent, so issue them concurrently
  // rather than serially round-tripping.
  const results = await Promise.allSettled(
    uris.map((uri) => getSkill(client, uri)),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<SkillEntry> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

/**
 * Merge two SkillEntry arrays, dropping the latter's entries whose URI
 * already appears in the former. Preserves the first-array order.
 */
function mergeUniqueByUri(
  primary: SkillEntry[],
  extra: SkillEntry[],
): SkillEntry[] {
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
 * Discover the skills a server serves.
 *
 * By default this is `skills/list` enumeration. Pass `{ instructions: true }`
 * to additionally mine the server's `instructions` string for skill URIs;
 * each mined URI is confirmed via `skills/get` and the confirmed entries are
 * merged with the listing (deduplicated by URI). This covers servers whose
 * listings are empty or partial but whose instructions name specific skills.
 *
 * When the client can read server capabilities and the skills extension is
 * not declared, returns an empty array — the server exposes no skills
 * surface (its resources may still be readable, but nothing identifies them
 * as skills).
 *
 * `instructions` are read via `client.getInstructions()` when the client
 * exposes it (the MCP SDK Client does); structural clients without that
 * method skip instructions mining silently.
 */
export async function discoverSkills(
  client: SkillsClient,
  options?: DiscoverSkillsOptions,
): Promise<SkillEntry[]> {
  if (serverSupportsSkills(client) === false) return [];

  const listed = await listSkills(client);

  if (!(options?.instructions ?? false)) return listed;

  const instructions = client.getInstructions?.();
  if (!instructions) return listed;

  const fromInstructions = await listSkillsFromInstructions(
    client,
    instructions,
    { extractor: options?.extractor },
  );
  return mergeUniqueByUri(listed, fromInstructions);
}

/**
 * Derive a lightweight display summary from a skill entry. `name` and
 * `description` come from the entry's verbatim frontmatter; `skillPath` is
 * parsed from the URI (per SEP-2640 its final segment equals the name, so
 * the identity is readable from the URI alone).
 */
export function skillSummaryFromEntry(entry: SkillEntry): SkillSummary {
  const name =
    typeof entry.frontmatter.name === "string"
      ? entry.frontmatter.name
      : (extractSkillPathFromUri(entry.uri)?.split("/").pop() ?? entry.uri);
  const skillPath = extractSkillPathFromUri(entry.uri) ?? name;
  const description =
    typeof entry.frontmatter.description === "string"
      ? entry.frontmatter.description
      : undefined;
  return { name, skillPath, uri: entry.uri, description };
}

/** Derive display summaries for an array of skill entries. */
export function skillSummariesFromEntries(
  entries: SkillEntry[],
): SkillSummary[] {
  return entries.map(skillSummaryFromEntry);
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
 * Discover skills and build a system prompt catalog in one call.
 *
 * Combines discoverSkills() and buildSkillsCatalog() — the most common
 * client-side workflow. Returns both the discovered entries (the
 * verification unit for subsequent reads) and the ready-to-inject catalog
 * text.
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
  const catalog = buildSkillsCatalog(skillSummariesFromEntries(skills), {
    toolName: options?.toolName ?? READ_RESOURCE_TOOL.name,
    serverName: options?.serverName,
    serverInEntries: options?.serverInEntries,
  });
  return { skills, catalog };
}
