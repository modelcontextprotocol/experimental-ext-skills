/**
 * Archive extraction for skill distribution per SEP-2640.
 *
 * The SEP defines `type: "archive"` as a normative entry type in
 * `skill://index.json`: a single resource (`.tar.gz` or `.zip`) that
 * unpacks to a skill directory. This module provides in-memory extraction
 * with the Agent Skills archive safety requirements:
 *
 *   - reject path-traversal sequences (..)
 *   - reject absolute paths
 *   - reject symlinks resolving outside the skill directory
 *   - bound total uncompressed size (decompression-bomb defense)
 *   - bound per-file size and entry count
 *
 * Hosts MUST support both formats. SDK consumers normally call
 * `readSkillArchive()` (client.ts), which fetches the archive via
 * `resources/read` and dispatches here based on `mimeType`.
 */

import * as zlib from "node:zlib";
import { Readable } from "node:stream";
import { extract as tarExtract } from "tar-stream";
import yauzl from "yauzl";
import type {
  ArchiveFormat,
  ExtractArchiveOptions,
  UnpackedSkillArchive,
} from "./types.js";

const DEFAULT_MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 1024;

const TAR_GZ_MIME = "application/gzip";
const ZIP_MIME = "application/zip";

/**
 * Detect archive format from MIME type, falling back to URL suffix.
 *
 * Per SEP-2640: "Hosts SHOULD determine the format from the resource's
 * mimeType, falling back to the URL suffix."
 *
 * Returns `null` if neither signal identifies a supported format.
 */
export function detectArchiveFormat(
  mimeType: string | undefined,
  url: string | undefined,
): ArchiveFormat | null {
  if (mimeType === TAR_GZ_MIME) return "tar.gz";
  if (mimeType === ZIP_MIME) return "zip";
  if (url) {
    if (url.endsWith(".tar.gz") || url.endsWith(".tgz")) return "tar.gz";
    if (url.endsWith(".zip")) return "zip";
  }
  return null;
}

/**
 * Strip the archive suffix from a URL to get the post-unpack skill base.
 *
 * Per SEP-2640: `skill://pdf-processing.tar.gz` unpacks to
 * `skill://pdf-processing/`; this returns the URL with `.tar.gz` /
 * `.tgz` / `.zip` removed. The post-unpack skill path is whatever
 * follows the `skill://` scheme prefix.
 */
export function stripArchiveSuffix(url: string): string {
  if (url.endsWith(".tar.gz")) return url.slice(0, -".tar.gz".length);
  if (url.endsWith(".tgz")) return url.slice(0, -".tgz".length);
  if (url.endsWith(".zip")) return url.slice(0, -".zip".length);
  return url;
}

/** MIME type for an archive format. */
export function archiveMimeType(format: ArchiveFormat): string {
  return format === "tar.gz" ? TAR_GZ_MIME : ZIP_MIME;
}

/** URL suffix for an archive format. */
export function archiveSuffix(format: ArchiveFormat): string {
  return format === "tar.gz" ? ".tar.gz" : ".zip";
}

/**
 * Validate a relative path from an archive entry.
 *
 * Returns the normalized (forward-slash) path, or `null` if the entry
 * violates archive safety: absolute paths, drive letters, `..` segments,
 * or empty paths are all rejected.
 */
function validateEntryPath(entryPath: string): string | null {
  if (!entryPath) return null;
  const normalized = entryPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return null;
  if (normalized.startsWith("/")) return null;
  if (/^[a-zA-Z]:/.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) return null;
  return normalized;
}

function resolvedOptions(
  options?: ExtractArchiveOptions,
): Required<ExtractArchiveOptions> {
  return {
    maxTotalSize: options?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE,
    maxFileSize: options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
  };
}

/**
 * Extract a `.tar.gz` archive from an in-memory buffer.
 */
function extractTarGz(
  data: Buffer,
  options: Required<ExtractArchiveOptions>,
): Promise<UnpackedSkillArchive> {
  return new Promise<UnpackedSkillArchive>((resolve, reject) => {
    const files = new Map<string, Buffer>();
    let totalSize = 0;
    let entryCount = 0;
    let aborted = false;
    let decompressedBytes = 0;

    const gunzip = zlib.createGunzip();
    const extractor = tarExtract();

    const abort = (err: Error) => {
      if (aborted) return;
      aborted = true;
      gunzip.destroy();
      extractor.destroy();
      reject(err);
    };

    // Decompression-bomb defense: bound the *decompressed* byte count as it
    // streams out of gunzip, rather than inflating the whole (possibly
    // gigabyte) payload into memory up front with gunzipSync. We abort as soon
    // as the inflated size crosses maxTotalSize, mirroring the incremental
    // size check on the zip path.
    gunzip.on("data", (chunk: Buffer) => {
      decompressedBytes += chunk.length;
      if (decompressedBytes > options.maxTotalSize) {
        abort(
          new Error(
            `Decompressed archive size exceeds maxTotalSize (${options.maxTotalSize})`,
          ),
        );
      }
    });
    gunzip.on("error", (err) => {
      abort(
        new Error(
          `Failed to gunzip tar.gz archive: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });

    extractor.on("entry", (header, stream, next) => {
      if (aborted) {
        stream.resume();
        next();
        return;
      }

      if (header.type === "symlink" || header.type === "link") {
        // Per SEP archive safety: reject links resolving outside the
        // skill directory. Validate the link target the same way as a
        // regular path; any traversal aborts.
        const target = validateEntryPath(header.linkname ?? "");
        stream.resume();
        if (target === null) {
          abort(
            new Error(
              `Archive link target "${header.linkname ?? ""}" resolves outside skill directory`,
            ),
          );
          return;
        }
        next();
        return;
      }

      if (header.type !== "file") {
        stream.resume();
        next();
        return;
      }

      const entryPath = validateEntryPath(header.name);
      if (entryPath === null) {
        stream.resume();
        abort(new Error(`Invalid archive entry path: "${header.name}"`));
        return;
      }

      entryCount += 1;
      if (entryCount > options.maxEntries) {
        stream.resume();
        abort(
          new Error(
            `Archive entry count exceeds maxEntries (${options.maxEntries})`,
          ),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let entrySize = 0;
      stream.on("data", (chunk: Buffer) => {
        entrySize += chunk.length;
        if (entrySize > options.maxFileSize) {
          abort(
            new Error(
              `Archive entry "${entryPath}" exceeds maxFileSize (${options.maxFileSize})`,
            ),
          );
          return;
        }
        if (totalSize + entrySize > options.maxTotalSize) {
          abort(
            new Error(
              `Archive total size exceeds maxTotalSize (${options.maxTotalSize})`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        if (aborted) return;
        files.set(entryPath, Buffer.concat(chunks));
        totalSize += entrySize;
        next();
      });
      stream.on("error", abort);
    });

    extractor.on("finish", () => {
      if (!aborted) resolve({ files, totalSize });
    });
    extractor.on("error", abort);

    Readable.from(data).pipe(gunzip).pipe(extractor);
  });
}

/**
 * Extract a `.zip` archive from an in-memory buffer.
 */
function extractZip(
  data: Buffer,
  options: Required<ExtractArchiveOptions>,
): Promise<UnpackedSkillArchive> {
  return new Promise<UnpackedSkillArchive>((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(
          new Error(
            `Failed to open zip archive: ${err?.message ?? "unknown error"}`,
          ),
        );
        return;
      }

      const files = new Map<string, Buffer>();
      let totalSize = 0;
      let entryCount = 0;
      let aborted = false;

      const abort = (e: Error) => {
        if (aborted) return;
        aborted = true;
        zipfile.close();
        reject(e);
      };

      zipfile.on("error", abort);
      zipfile.on("end", () => {
        if (!aborted) resolve({ files, totalSize });
      });

      zipfile.on("entry", (entry) => {
        if (aborted) return;

        // Directory entry — skip but continue
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        const entryPath = validateEntryPath(entry.fileName);
        if (entryPath === null) {
          abort(new Error(`Invalid archive entry path: "${entry.fileName}"`));
          return;
        }

        entryCount += 1;
        if (entryCount > options.maxEntries) {
          abort(
            new Error(
              `Archive entry count exceeds maxEntries (${options.maxEntries})`,
            ),
          );
          return;
        }

        // Pre-flight check: refuse entries that claim oversize before we
        // even open the read stream. zip headers carry uncompressedSize.
        if (entry.uncompressedSize > options.maxFileSize) {
          abort(
            new Error(
              `Archive entry "${entryPath}" declares size ${entry.uncompressedSize}, exceeds maxFileSize (${options.maxFileSize})`,
            ),
          );
          return;
        }
        if (totalSize + entry.uncompressedSize > options.maxTotalSize) {
          abort(
            new Error(
              `Archive total size exceeds maxTotalSize (${options.maxTotalSize})`,
            ),
          );
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            abort(
              new Error(
                `Failed to read zip entry "${entryPath}": ${streamErr?.message ?? "unknown"}`,
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          let entrySize = 0;
          stream.on("data", (chunk: Buffer) => {
            entrySize += chunk.length;
            // Catch decompression bombs that lie about uncompressed size
            if (entrySize > options.maxFileSize) {
              abort(
                new Error(
                  `Archive entry "${entryPath}" actual size exceeds maxFileSize (${options.maxFileSize})`,
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          stream.on("end", () => {
            if (aborted) return;
            files.set(entryPath, Buffer.concat(chunks));
            totalSize += entrySize;
            zipfile.readEntry();
          });
          stream.on("error", abort);
        });
      });

      zipfile.readEntry();
    });
  });
}

/**
 * Extract a skill archive from an in-memory buffer.
 *
 * Format is determined from `mimeType` first, then falls back to URL
 * suffix per SEP-2640. Throws if the format cannot be determined.
 *
 * Applies archive safety: rejects path traversal, absolute paths,
 * symlinks resolving outside the skill directory, and decompression
 * bombs (via per-file, total-size, and entry-count bounds).
 */
export async function extractSkillArchive(
  data: Buffer,
  context: { mimeType?: string; url?: string },
  options?: ExtractArchiveOptions,
): Promise<UnpackedSkillArchive> {
  const format = detectArchiveFormat(context.mimeType, context.url);
  if (format === null) {
    throw new Error(
      `Cannot determine archive format from mimeType="${context.mimeType ?? ""}" and url="${context.url ?? ""}". Per SEP-2640, archives must be application/gzip (.tar.gz) or application/zip (.zip).`,
    );
  }

  const opts = resolvedOptions(options);
  const archive = format === "tar.gz"
    ? await extractTarGz(data, opts)
    : await extractZip(data, opts);

  // Per SEP-2640: "SKILL.md MUST be at the archive root, not nested
  // inside a wrapper directory."
  if (!archive.files.has("SKILL.md") && !archive.files.has("skill.md")) {
    throw new Error(
      "Archive does not contain SKILL.md at its root. Per SEP-2640, archives MUST place SKILL.md at the archive root, not inside a wrapper directory.",
    );
  }

  return archive;
}
