/**
 * Pack a directory tree into a `.tar.gz` Buffer in memory.
 *
 * Used by the example server to demonstrate SEP-2640 archive distribution:
 * the source skill directory is packed at startup and registered as a
 * single archive resource via `registerSkillResources({ archives: [...] })`.
 *
 * The SDK itself does not ship a packer — that would conflate "host SDK"
 * with "skill-author tooling." For real deployments, archives are
 * pre-built outside the server. This helper exists so the example is
 * self-contained.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { pack as tarPack } from "tar-stream";

/**
 * Recursively collect files under `dir`, returning paths relative to `dir`.
 * SKILL.md is placed first so archive readers see it without seeking.
 */
function listFilesRelative(dir: string): string[] {
  const out: string[] = [];
  const walk = (cur: string, prefix: string): void => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  walk(dir, "");
  return out.sort((a, b) => {
    if (a === "SKILL.md") return -1;
    if (b === "SKILL.md") return 1;
    return a.localeCompare(b);
  });
}

/**
 * Pack `sourceDir` into a tar.gz Buffer.
 *
 * The archive contents are placed at the archive root (no wrapper
 * directory) per SEP-2640.
 */
export async function packTarGz(sourceDir: string): Promise<Buffer> {
  const files = listFilesRelative(sourceDir);
  const pack = tarPack();

  for (const rel of files) {
    const full = path.join(sourceDir, rel);
    const data = fs.readFileSync(full);
    pack.entry({ name: rel, size: data.length }, data);
  }
  pack.finalize();

  const tarChunks: Buffer[] = [];
  for await (const chunk of pack as unknown as AsyncIterable<Buffer>) {
    tarChunks.push(chunk);
  }
  return zlib.gzipSync(Buffer.concat(tarChunks));
}
