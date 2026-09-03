/**
 * Server-side skill discovery, content loading, MCP resource registration,
 * and the SEP-2640 v1 protocol methods (`skills/list`, `skills/get`, and the
 * optional `resources/directory/read`).
 *
 * Discovers Agent Skills by recursively scanning a directory for SKILL.md
 * files at any depth, parses YAML frontmatter for metadata, scans for
 * supplementary documents (computing a per-file SHA-256 digest for each),
 * and provides secure content loading.
 *
 * Multi-segment skill paths are supported (path ≠ name) per SEP-2640, and
 * skills MAY nest: a SKILL.md in a descendant directory of another skill is
 * discovered as a skill in its own right, while its files remain ordinary
 * supporting content of the enclosing skill (the enclosing skill's entry
 * `resources` lists them too, per the SEP's completeness rule).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import {
  ResourceTemplate,
  ProtocolError,
  ProtocolErrorCode,
} from "@modelcontextprotocol/server";
import type {
  SkillMetadata,
  SkillDocument,
  SkillEntry,
  SkillsListResult,
  SkillsGetResult,
  RegisterSkillResourcesOptions,
} from "./types.js";
import { getMimeType, isTextMimeType } from "./mime.js";
import {
  buildSkillUri,
  isValidSkillName,
  isValidRegName,
  isValidUriPathSegment,
} from "./uri.js";
import {
  DIRECTORY_READ_METHOD,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DirectoryReadParamsSchema,
  DirectoryReadResultSchema,
  buildDirectoryTree,
  stripTrailingSlash,
  type DirectoryReadHandlerOptions,
  type DirectoryReadResult,
} from "./directory.js";
import {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
  SkillsListParamsSchema,
  SkillsListResultSchema,
  SkillsGetParamsSchema,
  SkillsGetResultSchema,
  MAX_RESOURCES_PER_SKILL,
  MAX_TOTAL_SIZE_PER_SKILL,
} from "./skills-methods.js";
import { paginate } from "./cursor.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";

/**
 * Largest single file the disk-fallback loaders will read. A file this
 * large already exceeds the SEP's per-skill total, so nothing conformant is
 * lost by refusing it.
 */
const MAX_FILE_SIZE = MAX_TOTAL_SIZE_PER_SKILL;

/** Default page size for a `skills/list` response. */
export const DEFAULT_SKILLS_LIST_PAGE_SIZE = 50;

/** Agent Skills specification: `description` is at most 1024 characters. */
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Compute a SHA-256 digest of raw bytes, formatted `sha256:{hex}` (64
 * lowercase hex), as required for skill entry `resources` manifests by
 * SEP-2640.
 */
export function sha256Digest(data: Buffer | string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Expects content to start with --- and have a closing --- on its own line.
 *
 * Uses a line-anchored match so a `---` inside the body (e.g. a markdown
 * horizontal rule, or `---` within a multi-line YAML value) doesn't terminate
 * the frontmatter early. This mirrors the client-side parseSkillFrontmatter()
 * so the server and client agree on exactly where the frontmatter ends.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---")) {
    throw new Error("SKILL.md must start with YAML frontmatter (---)");
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error("SKILL.md frontmatter not properly closed with ---");
  }

  const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
  if (typeof frontmatter !== "object" || frontmatter === null) {
    throw new Error("SKILL.md frontmatter must be a YAML mapping");
  }

  const body = content.slice(match[0].length).trim();
  return { frontmatter, body };
}

/**
 * Check if a resolved path is within the allowed base directory.
 * Uses fs.realpathSync to resolve symlinks and prevent escape attacks.
 */
export function isPathWithinBase(
  targetPath: string,
  baseDir: string,
): boolean {
  try {
    const realBase = fs.realpathSync(baseDir);
    const realTarget = fs.realpathSync(targetPath);
    const normalizedBase = realBase + path.sep;
    return realTarget === realBase || realTarget.startsWith(normalizedBase);
  } catch {
    // Fall back to resolve check if realpathSync fails
    const normalizedBase = path.resolve(baseDir) + path.sep;
    const normalizedPath = path.resolve(targetPath);
    return normalizedPath.startsWith(normalizedBase);
  }
}

/**
 * Stat, read, and digest one file, returning a SkillDocument (bytes
 * retained for snapshot serving), or null when the file is unreadable.
 * No file is skipped for size: the entry's `resources` must list every
 * file of the skill, so an oversized skill is reported as a whole by
 * {@link warnIfOverLimits} rather than silently trimmed.
 */
function describeFile(
  fullPath: string,
  relativeTo: string,
): SkillDocument | null {
  try {
    const stat = fs.statSync(fullPath);
    const bytes = fs.readFileSync(fullPath);
    const relativePath = path
      .relative(relativeTo, fullPath)
      .replace(/\\/g, "/");
    return {
      path: relativePath,
      mimeType: getMimeType(path.basename(fullPath)),
      size: stat.size,
      digest: sha256Digest(bytes),
      bytes,
    };
  } catch {
    return null;
  }
}

/**
 * Recursively scan a directory, collecting files into `documents` and every
 * subdirectory's relative path (including empty ones) into `directories`.
 * Security: applies path traversal checks.
 */
function scanDirInto(
  dirPath: string,
  relativeTo: string,
  baseDir: string,
  documents: SkillDocument[],
  directories: string[],
): void {
  if (!fs.existsSync(dirPath)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Security: verify path stays within the skills directory
    if (!isPathWithinBase(fullPath, baseDir)) continue;

    if (entry.isFile()) {
      const doc = describeFile(fullPath, relativeTo);
      if (doc) documents.push(doc);
    } else if (entry.isDirectory()) {
      directories.push(
        path.relative(relativeTo, fullPath).replace(/\\/g, "/"),
      );
      scanDirInto(fullPath, relativeTo, baseDir, documents, directories);
    }
  }
}

/**
 * Scan a skill directory for all supplementary files and subdirectories.
 *
 * `documents` holds every file in the skill directory (root-level files and
 * files in subdirectories at any depth), excluding the skill's own
 * SKILL.md / skill.md, each with its bytes and SHA-256 digest.
 * `directories` holds every subdirectory's relative path — including empty
 * directories, so `resources/directory/read` can list them as empty rather
 * than treating them as nonexistent (SEP-2640).
 *
 * Files of nested skills — including their SKILL.md — are included: per
 * SEP-2640, from the enclosing skill's perspective a nested skill's files
 * are ordinary supporting files, and the entry's `resources` completeness
 * extends to them.
 */
export function scanSkillDirectory(
  skillDir: string,
  baseDir: string,
): { documents: SkillDocument[]; directories: string[] } {
  const documents: SkillDocument[] = [];
  const directories: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillDir, { withFileTypes: true });
  } catch {
    return { documents, directories };
  }

  const skipFiles = new Set(["SKILL.md", "skill.md"]);

  for (const entry of entries) {
    const fullPath = path.join(skillDir, entry.name);

    if (entry.isDirectory()) {
      if (!isPathWithinBase(fullPath, baseDir)) continue;
      directories.push(entry.name);
      scanDirInto(fullPath, skillDir, baseDir, documents, directories);
    } else if (entry.isFile() && !skipFiles.has(entry.name)) {
      if (!isPathWithinBase(fullPath, baseDir)) continue;
      const doc = describeFile(fullPath, skillDir);
      if (doc) documents.push(doc);
    }
  }

  return { documents, directories };
}

/**
 * Scan a skill directory for all supplementary files. Convenience wrapper
 * over {@link scanSkillDirectory} for callers that only need the files.
 */
export function scanDocuments(
  skillDir: string,
  baseDir: string,
): SkillDocument[] {
  return scanSkillDirectory(skillDir, baseDir).documents;
}

/**
 * Recursively find all SKILL.md files under a directory.
 * Returns an array of { skillMdPath, skillDir, skillPath } objects.
 *
 * The `skillPath` is the relative directory path from skillsDir to the
 * directory containing SKILL.md, using forward slashes. This becomes the
 * multi-segment URI locator.
 *
 * Skills MAY nest (SEP-2640): a SKILL.md in a descendant directory of
 * another skill is collected as a skill of its own. The enclosing skill's
 * path becomes part of the nested skill's organizational prefix.
 */
function findSkillFiles(
  dir: string,
  skillsDir: string,
): Array<{ skillMdPath: string; skillDir: string; skillPath: string }> {
  const results: Array<{
    skillMdPath: string;
    skillDir: string;
    skillPath: string;
  }> = [];

  if (!fs.existsSync(dir)) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Check if this directory contains a SKILL.md
  let skillMdPath: string | null = null;
  for (const name of ["SKILL.md", "skill.md"]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      skillMdPath = candidate;
      break;
    }
  }

  if (skillMdPath) {
    const skillPath = path.relative(skillsDir, dir).replace(/\\/g, "/") || ".";
    results.push({
      skillMdPath,
      skillDir: dir,
      skillPath: skillPath === "." ? path.basename(dir) : skillPath,
    });
  }

  // Recurse into subdirectories (nested skills are collected too).
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subdir = path.join(dir, entry.name);
    if (!isPathWithinBase(subdir, skillsDir)) continue;
    results.push(...findSkillFiles(subdir, skillsDir));
  }

  return results;
}

/**
 * Discover all skills in a directory tree.
 *
 * Recursively scans for SKILL.md files at any depth (not just immediate
 * subdirectories). The relative directory path from skillsDir becomes the
 * multi-segment `skillPath` used in skill:// URIs. Nested skills are
 * discovered as skills in their own right, and their files additionally
 * appear as supporting documents of the enclosing skill.
 *
 * Returns a Map keyed by skillPath (not name), since the path is the
 * unique locator within a server.
 *
 * Security: validates frontmatter,
 * enforces path containment.
 */
export function discoverSkills(
  skillsDir: string,
): Map<string, SkillMetadata> {
  const skillMap = new Map<string, SkillMetadata>();
  const resolvedDir = path.resolve(skillsDir);

  if (!fs.existsSync(resolvedDir)) {
    console.error(`Skills directory not found: ${resolvedDir}`);
    return skillMap;
  }

  const skillFiles = findSkillFiles(resolvedDir, resolvedDir);

  for (const { skillMdPath, skillDir, skillPath } of skillFiles) {
    const stat = fs.statSync(skillMdPath);

    // Security: verify path is within skills directory
    if (!isPathWithinBase(skillMdPath, resolvedDir)) {
      console.error(`Skipping ${skillMdPath}: path escapes skills directory`);
      continue;
    }

    try {
      // Read raw bytes once: the digest is over the raw file bytes (SEP-2640),
      // while parsing needs the UTF-8 decoding.
      const fileBytes = fs.readFileSync(skillMdPath);
      const content = fileBytes.toString("utf-8");
      const { frontmatter } = parseFrontmatter(content);
      const digest = sha256Digest(fileBytes);

      const name = frontmatter.name;
      const description = frontmatter.description;

      if (typeof name !== "string" || !name.trim()) {
        console.error(`Skill at ${skillDir}: missing or invalid 'name' field`);
        continue;
      }
      if (typeof description !== "string" || !description.trim()) {
        console.error(
          `Skill at ${skillDir}: missing or invalid 'description' field`,
        );
        continue;
      }

      // SEP constraint: final segment of skillPath MUST equal the frontmatter
      // name *as declared* — compared verbatim, no trimming, since the entry
      // carries the frontmatter verbatim and the two must agree exactly.
      const finalSegment = skillPath.split("/").pop()!;
      if (finalSegment !== name) {
        console.error(
          `Skill at ${skillDir}: frontmatter name "${name}" does not match final path segment "${finalSegment}". ` +
            `Per the SEP, the final segment of the skill path must equal the frontmatter name as declared.`,
        );
        continue;
      }

      // SEP constraint: the final segment (= frontmatter name) MUST satisfy
      // the Agent Skills naming rule (lowercase letters, digits, hyphens).
      if (!isValidSkillName(name)) {
        console.error(
          `Skill at ${skillDir}: name "${name}" violates the Agent Skills naming rule. ` +
            `Names are 1-64 lowercase letters, digits, and hyphens, with no leading, trailing, or consecutive hyphens.`,
        );
        continue;
      }

      // SEP-2640: the first <skill-path> segment occupies the URI authority
      // and SHOULD be a valid RFC 3986 reg-name; other prefix segments
      // SHOULD be valid URI path segments. SHOULD, so warn and serve.
      warnIfPrefixNotUriSafe(skillPath, skillDir);

      // Agent Skills constraint: description is 1-1024 characters.
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        console.error(
          `Skill at ${skillDir}: description is ${description.length} characters; the Agent Skills specification allows at most ${MAX_DESCRIPTION_LENGTH}.`,
        );
        continue;
      }

      if (skillMap.has(skillPath)) {
        console.error(
          `Warning: Duplicate skill path "${skillPath}" at ${skillMdPath} — keeping first`,
        );
        continue;
      }

      // Scan for supplementary documents (per-file digests and bytes) and
      // subdirectories (including empty ones, for directory listing).
      const { documents, directories } = scanSkillDirectory(
        skillDir,
        resolvedDir,
      );

      const skill: SkillMetadata = {
        name,
        skillPath,
        description: description.trim(),
        frontmatter,
        digest,
        absolutePath: skillMdPath,
        skillDir,
        content,
        directories,
        documents,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
      };
      warnIfOverLimits(skill);
      skillMap.set(skillPath, skill);
    } catch (error) {
      console.error(`Failed to parse skill at ${skillDir}:`, error);
    }
  }

  return skillMap;
}

/**
 * Warn when a skill path's prefix segments are not URI-safe per SEP-2640
 * (first segment a valid RFC 3986 `reg-name`, later prefix segments valid
 * path segments). The final segment is the skill name and is validated
 * separately. Returns `true` when a warning was logged.
 */
export function warnIfPrefixNotUriSafe(
  skillPath: string,
  skillDir?: string,
): boolean {
  const segments = skillPath.split("/");
  const prefix = segments.slice(0, -1);
  const problems: string[] = [];
  prefix.forEach((segment, i) => {
    const ok = i === 0 ? isValidRegName(segment) : isValidUriPathSegment(segment);
    if (!ok) {
      problems.push(
        i === 0
          ? `first segment "${segment}" is not a valid RFC 3986 reg-name`
          : `segment "${segment}" is not a valid RFC 3986 path segment`,
      );
    }
  });
  if (problems.length === 0) return false;
  console.error(
    `[skills] Skill path "${skillPath}"${skillDir ? ` at ${skillDir}` : ""}: ${problems.join("; ")}. ` +
      `SEP-2640 says prefix segments SHOULD be URI-safe; the skill is still served.`,
  );
  return true;
}

/**
 * Load the full content of a SKILL.md file.
 *
 * Security: Validates that the path is within the skills directory,
 * only reads .md files, and enforces a file size limit.
 */
export function loadSkillContent(
  skillPath: string,
  skillsDir: string,
): string {
  if (!skillPath.endsWith(".md")) {
    throw new Error("Only .md files can be read");
  }

  if (!isPathWithinBase(skillPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  const stat = fs.statSync(skillPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`,
    );
  }

  return fs.readFileSync(skillPath, "utf-8");
}

/**
 * Load a supplementary document from a skill directory.
 * Returns text content for text MIME types and base64-encoded content for binary.
 *
 * Security: Validates path within skills directory, rejects path traversal,
 * enforces file size limit.
 */
export function loadDocument(
  skill: SkillMetadata,
  documentPath: string,
  skillsDir: string,
  isText: boolean,
): { text: string } | { blob: string } {
  // Reject `..` as a path *segment* (traversal), not as a substring — a
  // filename like `notes..final.md` is legitimate. `isPathWithinBase` below is
  // the real containment guard.
  if (documentPath.split(/[\\/]/).some((s) => s === "..")) {
    throw new Error("Path traversal not allowed");
  }

  if (path.isAbsolute(documentPath)) {
    throw new Error("Absolute paths not allowed");
  }

  const fullPath = path.join(skill.skillDir, documentPath);

  if (!isPathWithinBase(fullPath, skillsDir)) {
    throw new Error("Path escapes the skills directory");
  }

  const stat = fs.statSync(fullPath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size ${(stat.size / 1024 / 1024).toFixed(2)}MB exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit`,
    );
  }

  if (isText) {
    return { text: fs.readFileSync(fullPath, "utf-8") };
  } else {
    return { blob: fs.readFileSync(fullPath).toString("base64") };
  }
}

/**
 * Build a skill's entry — the object served by `skills/list` (one array
 * element) and `skills/get` (the `skill` object) per SEP-2640.
 *
 * The `resources` manifest is complete: it lists `SKILL.md` itself (an entry
 * matching the skill's top-level `uri`) plus every supporting file, each
 * with the SHA-256 digest and byte size computed at discovery time.
 */
export function buildSkillEntry(skill: SkillMetadata): SkillEntry {
  const skillUri = buildSkillUri(skill.skillPath);
  return {
    uri: skillUri,
    frontmatter: skill.frontmatter,
    resources: [
      { uri: skillUri, digest: skill.digest, size: skill.size },
      ...skill.documents.map((doc) => ({
        uri: buildSkillUri(skill.skillPath, doc.path),
        digest: doc.digest,
        size: doc.size,
      })),
    ],
  };
}

/**
 * Log a warning when a skill exceeds either SEP-2640 per-skill limit (512
 * resources, 16 MiB total). The skill is still served: the SEP says servers
 * SHOULD NOT serve such a skill, and that a conforming host is not
 * guaranteed to load it. Returns `true` when a warning was logged.
 */
export function warnIfOverLimits(skill: SkillMetadata): boolean {
  const count = 1 + skill.documents.length;
  const total = skill.size + skill.documents.reduce((n, d) => n + d.size, 0);
  const problems: string[] = [];
  if (count > MAX_RESOURCES_PER_SKILL) {
    problems.push(`${count} resources (limit ${MAX_RESOURCES_PER_SKILL})`);
  }
  if (total > MAX_TOTAL_SIZE_PER_SKILL) {
    problems.push(`${total} bytes total (limit ${MAX_TOTAL_SIZE_PER_SKILL})`);
  }
  if (problems.length === 0) return false;
  console.error(
    `[skills] Skill "${skill.skillPath}" exceeds the SEP-2640 per-skill limits: ${problems.join(", ")}. ` +
      `Conforming hosts are not required to load it.`,
  );
  return true;
}

/**
 * The reserved `_meta` envelope key carrying the request's protocol version
 * (protocol revision 2026-07-28; the envelope does not exist on earlier
 * revisions).
 */
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";

/** First protocol version whose list results carry `ttlMs`/`cacheScope` (SEP-2549). */
const LIST_CACHING_MIN_PROTOCOL = "2026-07-28";

/**
 * Structural slice of the v2 SDK's request handler context: the per-request
 * `_meta` envelope, present only on 2026-07-28+ requests.
 */
export interface SkillsHandlerContext {
  mcpReq?: { envelope?: Record<string, unknown> };
}

/**
 * Whether the request was made under a protocol version that defines the
 * SEP-2549 list-caching attributes. Per SEP-2640, `skills/list` results
 * carry `ttlMs`/`cacheScope` "in protocol versions 2026-07-28 and later" —
 * on earlier versions the attributes are omitted. Detected from the
 * request's `_meta` envelope, which exists only on 2026-07-28+ requests
 * (protocol versions are dates, so string comparison orders them).
 */
function supportsListCaching(ctx?: SkillsHandlerContext): boolean {
  const version = ctx?.mcpReq?.envelope?.[PROTOCOL_VERSION_META_KEY];
  return typeof version === "string" && version >= LIST_CACHING_MIN_PROTOCOL;
}

/** Options for the `skills/list` handler. */
export interface SkillsListHandlerOptions {
  /** Entries per page. Default {@link DEFAULT_SKILLS_LIST_PAGE_SIZE}. */
  pageSize?: number;
  /** SEP-2549 freshness hint (ms). Default 0 (immediately stale). */
  ttlMs?: number;
  /** SEP-2549 cache scope. Default `"private"`. */
  cacheScope?: "public" | "private";
}

/**
 * Build a `skills/list` handler backed by an in-memory skill map. Paginates
 * with the standard `cursor`/`nextCursor` contract; entries are atomic (a
 * skill's `resources` set is never split across pages). Skills marked
 * `listed: false` are omitted (the SEP's partial-listing allowance) —
 * `skills/get` still answers for them. On protocol 2026-07-28+ requests the
 * result carries the SEP-2549 list-caching attributes (`ttlMs`,
 * `cacheScope`); on earlier versions they are omitted.
 */
export function makeSkillsListHandler(
  skillMap: Map<string, SkillMetadata>,
  options?: SkillsListHandlerOptions,
): (
  params: { cursor?: string },
  ctx?: SkillsHandlerContext,
) => Promise<SkillsListResult> {
  const entries = Array.from(skillMap.values())
    .filter((skill) => skill.listed !== false)
    .map(buildSkillEntry);
  const pageSize = options?.pageSize ?? DEFAULT_SKILLS_LIST_PAGE_SIZE;
  const ttlMs = options?.ttlMs ?? 0;
  const cacheScope = options?.cacheScope ?? "private";

  return async (params, ctx) => {
    const { page, nextCursor } = paginate(entries, params.cursor, pageSize);
    return {
      skills: page,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
      ...(supportsListCaching(ctx) ? { ttlMs, cacheScope } : {}),
    };
  };
}

/**
 * Build a `skills/get` handler backed by an in-memory skill map. Answers for
 * every skill the server serves — whether or not it appears in the listing —
 * and returns error `-32602` (Invalid params) for URIs it does not serve as
 * skills, the same code `resources/read` uses for unknown resources.
 */
export function makeSkillsGetHandler(
  skillMap: Map<string, SkillMetadata>,
): (params: { uri: string }) => Promise<SkillsGetResult> {
  const byUri = new Map<string, SkillMetadata>();
  for (const skill of skillMap.values()) {
    byUri.set(buildSkillUri(skill.skillPath), skill);
  }

  return async (params) => {
    const skill = byUri.get(params.uri);
    if (!skill) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Not a skill served by this server: ${params.uri}`,
        { uri: params.uri },
      );
    }
    return { skill: buildSkillEntry(skill) };
  };
}

/**
 * Build a `resources/directory/read` handler backed by an in-memory skill
 * map. The returned function plugs into the v2 MCP SDK's
 * `setRequestHandler(DIRECTORY_READ_METHOD, { params, result }, handler)`.
 *
 * Throws `ProtocolError` `-32602` (Invalid params) when the requested URI is
 * not a known directory (i.e. it is a file, or does not exist).
 */
export function makeDirectoryReadHandler(
  skillMap: Map<string, SkillMetadata>,
  options?: DirectoryReadHandlerOptions,
): (params: { uri: string; cursor?: string }) => Promise<DirectoryReadResult> {
  const tree = buildDirectoryTree(skillMap);
  const pageSize = options?.pageSize ?? DEFAULT_DIRECTORY_PAGE_SIZE;

  return async (params) => {
    const uri = stripTrailingSlash(params.uri);
    const children = tree.get(uri);
    if (children === undefined) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Not a directory resource or does not exist: ${params.uri}`,
        { uri: params.uri },
      );
    }

    const { page, nextCursor } = paginate(children, params.cursor, pageSize);
    return {
      resources: page,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    };
  };
}

/**
 * Register MCP resources and the SEP-2640 protocol methods for all
 * discovered skills on an McpServer.
 *
 * Registers per-skill (using multi-segment skill paths):
 *   - skill://{skillPath}/SKILL.md — skill content (listed resource)
 *
 * Always registers the extension's two required methods:
 *   - `skills/list` — paginated enumeration of skill entries
 *   - `skills/get`  — single-skill entry retrieval by URI
 *
 * Optionally registers:
 *   - skill://{+skillFilePath} — catch-all template for supporting files.
 *   - A `resources/directory/read` handler (when `directoryRead: true`).
 *
 * Unless `declareCapability: false`, also declares
 * `capabilities.extensions["io.modelcontextprotocol/skills"]` (with
 * `directoryRead: true` when enabled). Call this BEFORE `server.connect()` —
 * capabilities ship in the initialize handshake.
 */
export function registerSkillResources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  options?: RegisterSkillResourcesOptions,
): void {
  const {
    template = true,
    audience = ["assistant"],
    directoryRead = false,
    declareCapability = true,
    pageSize,
    ttlMs,
    cacheScope,
  } = options ?? {};

  // McpServer exposes the underlying low-level Server as `.server`; accept a
  // low-level Server (or structural stand-in) directly too.
  const lowLevel = server.server ?? server;

  // Compute the most recent lastModified across all skills for the template resource
  const latestModified = skillMap.size > 0
    ? Array.from(skillMap.values())
        .map((s) => s.lastModified)
        .sort()
        .pop()
    : undefined;

  // Declare capabilities.extensions["io.modelcontextprotocol/skills"].
  // registerCapabilities merges, so this composes with any capabilities the
  // caller declared; it throws once the server is connected.
  if (declareCapability) {
    try {
      lowLevel.registerCapabilities({
        extensions: {
          [SKILLS_EXTENSION_ID]: directoryRead ? { directoryRead: true } : {},
        },
      });
    } catch (err) {
      console.error(
        `[skills] Could not declare the "${SKILLS_EXTENSION_ID}" extension capability ` +
          `(is the server already connected? registerSkillResources must run before connect()): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Register per-skill resources
  for (const [skillPath, skill] of skillMap) {
    const skillAudience = skill.audience ?? audience;

    server.registerResource(
      skill.name,
      `skill://${skillPath}/SKILL.md`,
      {
        description: skill.description,
        mimeType: "text/markdown",
        size: skill.size,
        annotations: {
          audience: skillAudience,
          priority: 1.0,
          lastModified: skill.lastModified,
        },
        ...(skill.meta ? { _meta: skill.meta } : {}),
      },
      async (uri: URL) => {
        try {
          // Serve the discovery-time snapshot when available, so content
          // can never drift from the entry's digest and frontmatter (the
          // SEP binds them together). Falls back to disk for hand-built
          // maps without a snapshot.
          const content =
            skill.content ?? loadSkillContent(skill.absolutePath, skillsDir);
          return {
            contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new ProtocolError(
            ProtocolErrorCode.InternalError,
            `Failed to load skill "${skill.name}": ${message}`,
            { uri: uri.href },
          );
        }
      },
    );
  }

  // SEP-2640 required methods: skills/list and skills/get. Every server
  // declaring the extension implements both.
  lowLevel.setRequestHandler(
    SKILLS_LIST_METHOD,
    { params: SkillsListParamsSchema, result: SkillsListResultSchema },
    makeSkillsListHandler(skillMap, { pageSize, ttlMs, cacheScope }),
  );
  lowLevel.setRequestHandler(
    SKILLS_GET_METHOD,
    { params: SkillsGetParamsSchema, result: SkillsGetResultSchema },
    makeSkillsGetHandler(skillMap),
  );

  // Optional: resources/directory/read, gated behind the `directoryRead`
  // capability setting.
  if (directoryRead) {
    lowLevel.setRequestHandler(
      DIRECTORY_READ_METHOD,
      { params: DirectoryReadParamsSchema, result: DirectoryReadResultSchema },
      makeDirectoryReadHandler(skillMap),
    );
  }

  // Catch-all resource template for supporting files.
  if (template) {
    server.registerResource(
      "skill-file",
      new ResourceTemplate("skill://{+skillFilePath}", {
        list: undefined,
        complete: {
          skillFilePath: (value: string) => {
            // Provide completions: all known skill paths + their files
            const completions: string[] = [];
            for (const [sp, skill] of skillMap) {
              if (skill.documents.length === 0) continue;
              for (const doc of skill.documents) {
                const fullPath = `${sp}/${doc.path}`;
                if (fullPath.startsWith(value)) {
                  completions.push(fullPath);
                }
              }
            }
            return completions;
          },
        },
      }),
      {
        description: "Fetch a supporting file from a skill directory",
        mimeType: "text/plain",
        annotations: {
          audience,
          priority: 0.2,
          lastModified: latestModified,
        },
      },
      async (uri: URL, variables: Record<string, string | string[]>) => {
        const skillFilePath = Array.isArray(variables.skillFilePath)
          ? variables.skillFilePath[0]
          : variables.skillFilePath;

        // Resolve the skill path using longest-prefix match
        const knownPaths = Array.from(skillMap.keys()).sort(
          (a, b) => b.length - a.length,
        );
        let matchedSkill: SkillMetadata | undefined;
        let filePath: string | undefined;

        for (const sp of knownPaths) {
          if (skillFilePath.startsWith(sp + "/")) {
            matchedSkill = skillMap.get(sp);
            filePath = skillFilePath.slice(sp.length + 1);
            break;
          }
        }

        // Unknown resources are -32602, the same code the SEP prescribes
        // for skills/get and resources/directory/read misses. A successful
        // result with error prose would read as (unverifiable) content.
        if (!matchedSkill || !filePath) {
          throw new ProtocolError(
            ProtocolErrorCode.InvalidParams,
            `Not a skill file: ${uri.href}`,
            { uri: uri.href },
          );
        }

        const doc = matchedSkill.documents.find((d) => d.path === filePath);
        if (!doc) {
          throw new ProtocolError(
            ProtocolErrorCode.InvalidParams,
            `File "${filePath}" not found in skill "${matchedSkill.name}"`,
            { uri: uri.href },
          );
        }

        try {
          const isText = isTextMimeType(doc.mimeType);
          // Serve the discovery-time snapshot when available (see the
          // SKILL.md callback above); fall back to disk otherwise.
          const content = doc.bytes
            ? isText
              ? { text: doc.bytes.toString("utf-8") }
              : { blob: doc.bytes.toString("base64") }
            : loadDocument(matchedSkill, filePath, skillsDir, isText);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: doc.mimeType,
                ...content,
              },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new ProtocolError(
            ProtocolErrorCode.InternalError,
            `Failed to read file: ${message}`,
            { uri: uri.href },
          );
        }
      },
    );
  }
}
