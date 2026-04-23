/**
 * Well-known HTTP bridge — fetches skills from /.well-known/agent-skills/index.json,
 * verifies digests, caches to a local directory, and returns the cache path
 * for use with discoverSkills() + registerSkillResources().
 *
 * Supports:
 *   - "skill-md" entries: downloads SKILL.md to cache
 *   - "archive" entries: downloads .tar.gz, extracts to cache
 *   - Digest-based caching: skips unchanged entries on refresh
 *
 * Does NOT handle:
 *   - "mcp-resource-template" entries (not fetchable over HTTP)
 *   - skill:// URLs in entries (MCP-only, not HTTP-fetchable)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { extract as tarExtract } from "tar";
import type {
  SkillIndex,
  WellKnownFetchOptions,
  WellKnownFetchResult,
  WellKnownSkillResult,
} from "./types.js";
import { KNOWN_SKILL_INDEX_SCHEMAS } from "./types.js";
import { isPathWithinBase } from "./_server.js";

const DIGEST_CACHE_FILE = "_digest-cache.json";

// ---------------------------------------------------------------------------
// Digest cache helpers
// ---------------------------------------------------------------------------

function loadDigestCache(cacheDir: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(cacheDir, DIGEST_CACHE_FILE), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveDigestCache(cacheDir: string, cache: Record<string, string>): void {
  try {
    fs.writeFileSync(
      path.join(cacheDir, DIGEST_CACHE_FILE),
      JSON.stringify(cache, null, 2),
    );
  } catch (err) {
    console.warn(`[experimental-ext-skills] Failed to write digest cache: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Hash verification
// ---------------------------------------------------------------------------

function computeSha256(data: Buffer): string {
  return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
}

function verifyDigest(data: Buffer, expectedDigest: string): boolean {
  const actual = computeSha256(data);
  return actual === expectedDigest;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

function isValidSkillPath(skillPath: string): boolean {
  if (!skillPath) return false;
  // Reject absolute paths and path traversal
  if (path.isAbsolute(skillPath)) return false;
  const segments = skillPath.split(/[/\\]/);
  return !segments.some((s) => s === ".." || s === ".");
}

// ---------------------------------------------------------------------------
// Archive extraction
// ---------------------------------------------------------------------------

async function extractArchive(
  data: Buffer,
  targetDir: string,
): Promise<void> {
  fs.mkdirSync(targetDir, { recursive: true });

  // Decompress gzip, then extract tar
  const decompressed = zlib.gunzipSync(data);

  // Write to a temp tar file, then extract (tar module needs a stream)
  const tmpTar = path.join(targetDir, "_tmp_archive.tar");
  fs.writeFileSync(tmpTar, decompressed);

  try {
    await tarExtract({
      file: tmpTar,
      cwd: targetDir,
      strip: 0,
      filter: (entryPath: string) => {
        // Reject entries with path traversal
        const resolved = path.resolve(targetDir, entryPath);
        const normalizedBase = path.resolve(targetDir) + path.sep;
        return resolved === path.resolve(targetDir) || resolved.startsWith(normalizedBase);
      },
    });

    // Verify no symlinks outside boundary
    validateExtractedPaths(targetDir, targetDir);
  } finally {
    // Clean up temp tar file
    try { fs.unlinkSync(tmpTar); } catch { /* ignore */ }
  }
}

function validateExtractedPaths(dir: string, baseDir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(fullPath);
      const resolvedTarget = path.resolve(dir, target);
      if (!isPathWithinBase(resolvedTarget, baseDir)) {
        fs.unlinkSync(fullPath);
        throw new Error(
          `Symlink "${entry.name}" points outside archive boundary`,
        );
      }
    }

    if (entry.isDirectory()) {
      validateExtractedPaths(fullPath, baseDir);
    }
  }
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

/**
 * Fetch skills from a domain's well-known endpoint and cache locally.
 *
 * The cached directory can be passed directly to discoverSkills() and
 * registerSkillResources() to serve the fetched skills over MCP.
 */
export async function fetchFromWellKnown(
  options: WellKnownFetchOptions,
): Promise<WellKnownFetchResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const baseUrl = `https://${options.domain}/.well-known/agent-skills/index.json`;

  const result: WellKnownFetchResult = {
    skills: [],
    skipped: [],
    errors: [],
  };

  // Ensure cache directory exists
  fs.mkdirSync(options.cacheDir, { recursive: true });

  // Load existing digest cache
  const digestCache = options.useDigestCache ? loadDigestCache(options.cacheDir) : {};
  const newDigestCache = { ...digestCache };

  // Fetch the index
  let indexResponse: Response;
  try {
    indexResponse = await fetchFn(baseUrl);
    if (!indexResponse.ok) {
      result.errors.push({
        name: "index.json",
        error: `HTTP ${indexResponse.status}: ${indexResponse.statusText}`,
      });
      return result;
    }
  } catch (err) {
    result.errors.push({
      name: "index.json",
      error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return result;
  }

  // Parse and validate the index
  let index: SkillIndex;
  try {
    const text = await indexResponse.text();
    index = JSON.parse(text) as SkillIndex;
  } catch (err) {
    result.errors.push({
      name: "index.json",
      error: `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return result;
  }

  // $schema validation (warn and continue)
  if (index.$schema && !KNOWN_SKILL_INDEX_SCHEMAS.has(index.$schema)) {
    console.warn(
      `[experimental-ext-skills] Unrecognized well-known index $schema: "${index.$schema}". Proceeding anyway.`,
    );
  }

  if (!index.skills || !Array.isArray(index.skills)) {
    result.errors.push({
      name: "index.json",
      error: "Invalid index: missing or non-array 'skills' field",
    });
    return result;
  }

  // Process each entry — cast to a loose type since the HTTP response
  // may contain entry types not in our discriminated union.
  for (const rawEntry of index.skills as Array<{ name: string; type: string; description?: string; url?: string; uriTemplate?: string; digest?: string }>) {
    if (rawEntry.type === "mcp-resource-template") {
      result.skipped.push({
        name: rawEntry.name,
        type: rawEntry.type,
        reason: "Resource templates cannot be fetched over HTTP",
      });
      continue;
    }

    if (rawEntry.type !== "skill-md" && rawEntry.type !== "archive") {
      result.skipped.push({
        name: rawEntry.name,
        type: rawEntry.type,
        reason: `Unrecognized entry type: ${rawEntry.type}`,
      });
      continue;
    }

    const entry = rawEntry as { name: string; type: "skill-md" | "archive"; url?: string; digest?: string };

    // Determine the URL to fetch
    const entryUrl = entry.url;
    if (!entryUrl) {
      result.errors.push({
        name: entry.name,
        error: "Entry has no url field",
      });
      continue;
    }

    // skill:// URIs are MCP-only, not HTTP-fetchable
    if (entryUrl.startsWith("skill://")) {
      result.skipped.push({
        name: entry.name,
        type: entry.type,
        reason: "skill:// URIs are not fetchable over HTTP",
      });
      continue;
    }

    // Derive skillPath from entry name
    const skillPath = entry.name;
    if (!isValidSkillPath(skillPath)) {
      result.errors.push({
        name: entry.name,
        error: `Invalid skill path: "${skillPath}"`,
      });
      continue;
    }

    // Check digest cache
    const entryDigest = entry.digest;
    if (options.useDigestCache && entryDigest && digestCache[skillPath] === entryDigest) {
      const skillDir = path.join(options.cacheDir, ...skillPath.split("/"));
      if (fs.existsSync(path.join(skillDir, "SKILL.md"))) {
        result.skills.push({ name: entry.name, skillPath, cached: true });
        continue;
      }
    }

    // Resolve URL relative to the index URL
    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(entryUrl, baseUrl).href;
    } catch {
      result.errors.push({
        name: entry.name,
        error: `Invalid URL: "${entryUrl}"`,
      });
      continue;
    }

    // Fetch the content
    let contentBytes: Buffer;
    try {
      const response = await fetchFn(resolvedUrl);
      if (!response.ok) {
        result.errors.push({
          name: entry.name,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        continue;
      }
      contentBytes = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      result.errors.push({
        name: entry.name,
        error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // Verify digest if provided
    if (entryDigest) {
      if (!verifyDigest(contentBytes, entryDigest)) {
        result.errors.push({
          name: entry.name,
          error: `Digest mismatch: expected ${entryDigest}, got ${computeSha256(contentBytes)}`,
        });
        continue;
      }
    }

    // Write to cache directory
    const skillDir = path.join(options.cacheDir, ...skillPath.split("/"));

    try {
      if (entry.type === "skill-md") {
        // Write SKILL.md directly
        fs.mkdirSync(skillDir, { recursive: true });
        const targetPath = path.join(skillDir, "SKILL.md");

        // Verify path is within cacheDir
        if (!isPathWithinBase(skillDir, options.cacheDir)) {
          result.errors.push({
            name: entry.name,
            error: "Path traversal detected in skill directory",
          });
          continue;
        }

        fs.writeFileSync(targetPath, contentBytes);
      } else if (entry.type === "archive") {
        // Extract archive to skill directory
        fs.mkdirSync(skillDir, { recursive: true });

        if (!isPathWithinBase(skillDir, options.cacheDir)) {
          result.errors.push({
            name: entry.name,
            error: "Path traversal detected in skill directory",
          });
          continue;
        }

        await extractArchive(contentBytes, skillDir);

        // Validate SKILL.md exists at the root of the extracted archive
        if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
          result.errors.push({
            name: entry.name,
            error: "Archive does not contain SKILL.md at root",
          });
          // Clean up the partially extracted directory
          try { fs.rmSync(skillDir, { recursive: true }); } catch { /* ignore */ }
          continue;
        }
      }
    } catch (err) {
      result.errors.push({
        name: entry.name,
        error: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // Update digest cache
    if (entryDigest) {
      newDigestCache[skillPath] = entryDigest;
    }

    result.skills.push({ name: entry.name, skillPath, cached: false });
  }

  // Save updated digest cache
  if (options.useDigestCache) {
    saveDigestCache(options.cacheDir, newDigestCache);
  }

  return result;
}

/**
 * Refresh skills from a domain's well-known endpoint using digest caching.
 *
 * Identical to fetchFromWellKnown() with useDigestCache: true.
 * Callers can check `result.skills.filter(s => !s.cached)` to identify
 * changed skills and fire MCP notifications/resources/updated.
 */
export async function refreshFromWellKnown(
  options: Omit<WellKnownFetchOptions, "useDigestCache">,
): Promise<WellKnownFetchResult> {
  return fetchFromWellKnown({ ...options, useDigestCache: true });
}
