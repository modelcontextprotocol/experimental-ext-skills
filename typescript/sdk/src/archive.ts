/**
 * Minimal POSIX USTAR tar packer + gzip wrapper for SEP-2640
 * archive distribution.
 *
 * Limitations:
 *   - Each entry's path must be ≤ 100 bytes (USTAR `name` field; the
 *     `prefix` field is not used). Skill internal paths are typically short.
 *   - Symlinks, hardlinks, and special files are not supported.
 *   - Executable bits are written as `0644` regardless of source mode.
 *
 * For richer archive needs, plug in a full tar library and bypass these helpers.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { gzipSync } from "node:zlib";
import type { SkillMetadata } from "./types.js";
import { isPathWithinBase } from "./_server.js";

const BLOCK_SIZE = 512;
const MAX_FILE_SIZE = 1 * 1024 * 1024;

interface TarEntry {
  /** Relative path within the archive (no leading "./" or "/"). */
  path: string;
  data: Buffer;
  /** Modification time (Unix epoch seconds). */
  mtime: number;
}

/**
 * Build a USTAR header block for a regular file.
 * Throws if `name` exceeds 100 bytes (USTAR `name` field limit).
 */
function makeUstarHeader(name: string, size: number, mtime: number): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  if (nameBuf.length > 100) {
    throw new Error(
      `File path exceeds USTAR 100-byte limit (${nameBuf.length} bytes): ${name}`,
    );
  }

  const header = Buffer.alloc(BLOCK_SIZE);
  nameBuf.copy(header, 0);
  header.write("0000644\0", 100, "ascii"); // mode
  header.write("0000000\0", 108, "ascii"); // uid
  header.write("0000000\0", 116, "ascii"); // gid
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  header.write(
    Math.floor(mtime).toString(8).padStart(11, "0") + "\0",
    136,
    "ascii",
  );
  header.write("        ", 148, "ascii"); // checksum placeholder (8 spaces)
  header.write("0", 156, "ascii"); // typeflag = regular file
  // linkname (157-256) left zero
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");

  let sum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) sum += header[i];
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");

  return header;
}

/** Pack a list of files into an uncompressed POSIX USTAR tar buffer. */
export function packTar(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(makeUstarHeader(entry.path, entry.data.length, entry.mtime));
    chunks.push(entry.data);
    const padding = (BLOCK_SIZE - (entry.data.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  // Two zero blocks mark end-of-archive.
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return Buffer.concat(chunks);
}

/**
 * Pack a skill directory (SKILL.md + supplementary documents) into a
 * gzip-compressed tar buffer suitable for serving at
 * `skill://<skillPath>.tar.gz`.
 */
export function packSkillTarGz(
  skill: SkillMetadata,
  skillsDir: string,
): Buffer {
  const entries: TarEntry[] = [];

  const skillMdStat = fs.statSync(skill.path);
  if (skillMdStat.size > MAX_FILE_SIZE) {
    throw new Error(`SKILL.md exceeds size limit: ${skill.path}`);
  }
  entries.push({
    path: "SKILL.md",
    data: fs.readFileSync(skill.path),
    mtime: Math.floor(skillMdStat.mtime.getTime() / 1000),
  });

  for (const doc of skill.documents) {
    const fullPath = path.join(skill.skillDir, doc.path);
    if (!isPathWithinBase(fullPath, skillsDir)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE) continue;
    entries.push({
      path: doc.path,
      data: fs.readFileSync(fullPath),
      mtime: Math.floor(stat.mtime.getTime() / 1000),
    });
  }

  return gzipSync(packTar(entries));
}
