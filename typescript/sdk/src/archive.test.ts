import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import * as zlib from "node:zlib";
import { pack as tarPack } from "tar-stream";
import { ZipFile } from "yazl";
import {
  detectArchiveFormat,
  stripArchiveSuffix,
  archiveMimeType,
  archiveSuffix,
  extractSkillArchive,
} from "./archive.js";

// ---------------------------------------------------------------------------
// Archive builders (test fixtures)
// ---------------------------------------------------------------------------

interface FakeEntry {
  name: string;
  data: Buffer | string;
  type?: "file" | "symlink" | "directory";
  linkname?: string;
}

async function buildTarGz(entries: FakeEntry[]): Promise<Buffer> {
  const pack = tarPack();
  for (const e of entries) {
    if (e.type === "symlink") {
      pack.entry({
        name: e.name,
        type: "symlink",
        linkname: e.linkname ?? "",
      });
      continue;
    }
    if (e.type === "directory") {
      pack.entry({ name: e.name, type: "directory" });
      continue;
    }
    const data = typeof e.data === "string" ? Buffer.from(e.data) : e.data;
    pack.entry({ name: e.name, size: data.length }, data);
  }
  pack.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of pack as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return zlib.gzipSync(Buffer.concat(chunks));
}

async function buildZip(entries: FakeEntry[]): Promise<Buffer> {
  const zip = new ZipFile();
  for (const e of entries) {
    const data = typeof e.data === "string" ? Buffer.from(e.data) : e.data;
    zip.addBuffer(data, e.name);
  }
  zip.end();

  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as unknown as Readable) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// detectArchiveFormat
// ---------------------------------------------------------------------------

describe("detectArchiveFormat", () => {
  it("detects from MIME type first", () => {
    expect(detectArchiveFormat("application/gzip", undefined)).toBe("tar.gz");
    expect(detectArchiveFormat("application/zip", undefined)).toBe("zip");
  });

  it("falls back to URL suffix", () => {
    expect(detectArchiveFormat(undefined, "skill://x.tar.gz")).toBe("tar.gz");
    expect(detectArchiveFormat(undefined, "skill://x.tgz")).toBe("tar.gz");
    expect(detectArchiveFormat(undefined, "skill://x.zip")).toBe("zip");
  });

  it("MIME type wins over suffix", () => {
    expect(detectArchiveFormat("application/zip", "skill://x.tar.gz")).toBe("zip");
  });

  it("returns null when neither signal identifies a format", () => {
    expect(detectArchiveFormat(undefined, "skill://x")).toBeNull();
    expect(detectArchiveFormat("text/markdown", "skill://x.md")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripArchiveSuffix
// ---------------------------------------------------------------------------

describe("stripArchiveSuffix", () => {
  it("strips .tar.gz", () => {
    expect(stripArchiveSuffix("skill://pdf-processing.tar.gz")).toBe(
      "skill://pdf-processing",
    );
  });

  it("strips .tgz", () => {
    expect(stripArchiveSuffix("skill://x.tgz")).toBe("skill://x");
  });

  it("strips .zip", () => {
    expect(stripArchiveSuffix("skill://acme/billing/refunds.zip")).toBe(
      "skill://acme/billing/refunds",
    );
  });

  it("returns input unchanged when no suffix matches", () => {
    expect(stripArchiveSuffix("skill://x/SKILL.md")).toBe("skill://x/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// archiveMimeType / archiveSuffix
// ---------------------------------------------------------------------------

describe("archive format helpers", () => {
  it("archiveMimeType", () => {
    expect(archiveMimeType("tar.gz")).toBe("application/gzip");
    expect(archiveMimeType("zip")).toBe("application/zip");
  });

  it("archiveSuffix", () => {
    expect(archiveSuffix("tar.gz")).toBe(".tar.gz");
    expect(archiveSuffix("zip")).toBe(".zip");
  });
});

// ---------------------------------------------------------------------------
// extractSkillArchive — happy path
// ---------------------------------------------------------------------------

describe("extractSkillArchive (.tar.gz)", () => {
  it("extracts files keyed by relative path", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---\nbody" },
      { name: "references/REF.md", data: "ref content" },
    ]);

    const archive = await extractSkillArchive(tarball, {
      mimeType: "application/gzip",
    });

    expect(archive.files.get("SKILL.md")?.toString("utf-8")).toContain("body");
    expect(archive.files.get("references/REF.md")?.toString("utf-8")).toBe(
      "ref content",
    );
    expect(archive.totalSize).toBeGreaterThan(0);
  });

  it("falls back to URL suffix when mimeType is missing", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
    ]);
    const archive = await extractSkillArchive(tarball, {
      url: "skill://x.tar.gz",
    });
    expect(archive.files.has("SKILL.md")).toBe(true);
  });

  it("skips directory entries", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "subdir/", type: "directory", data: "" },
      { name: "subdir/inner.txt", data: "inner" },
    ]);
    const archive = await extractSkillArchive(tarball, {
      mimeType: "application/gzip",
    });
    expect(archive.files.has("subdir/")).toBe(false);
    expect(archive.files.get("subdir/inner.txt")?.toString()).toBe("inner");
  });
});

describe("extractSkillArchive (.zip)", () => {
  it("extracts files keyed by relative path", async () => {
    const zipBuf = await buildZip([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---\nbody" },
      { name: "references/REF.md", data: "ref content" },
    ]);

    const archive = await extractSkillArchive(zipBuf, {
      mimeType: "application/zip",
    });

    expect(archive.files.get("SKILL.md")?.toString("utf-8")).toContain("body");
    expect(archive.files.get("references/REF.md")?.toString("utf-8")).toBe(
      "ref content",
    );
  });

  it("falls back to URL suffix when mimeType is missing", async () => {
    const zipBuf = await buildZip([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
    ]);
    const archive = await extractSkillArchive(zipBuf, {
      url: "skill://x.zip",
    });
    expect(archive.files.has("SKILL.md")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Archive safety
// ---------------------------------------------------------------------------

describe("archive safety (.tar.gz)", () => {
  it("rejects path-traversal segments", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "../escape.txt", data: "evil" },
    ]);
    await expect(
      extractSkillArchive(tarball, { mimeType: "application/gzip" }),
    ).rejects.toThrow(/Invalid archive entry path/);
  });

  it("rejects absolute paths", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "/etc/passwd", data: "evil" },
    ]);
    await expect(
      extractSkillArchive(tarball, { mimeType: "application/gzip" }),
    ).rejects.toThrow(/Invalid archive entry path/);
  });

  it("rejects symlinks resolving outside the skill directory", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "evil-link", type: "symlink", data: "", linkname: "../../etc/passwd" },
    ]);
    await expect(
      extractSkillArchive(tarball, { mimeType: "application/gzip" }),
    ).rejects.toThrow(/resolves outside skill directory/);
  });

  it("rejects archive without SKILL.md at root", async () => {
    const tarball = await buildTarGz([
      { name: "wrapper/SKILL.md", data: "---\nname: x\ndescription: y\n---" },
    ]);
    await expect(
      extractSkillArchive(tarball, { mimeType: "application/gzip" }),
    ).rejects.toThrow(/SKILL\.md at its root/);
  });

  it("enforces maxFileSize", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024); // 2MB
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "big.bin", data: big },
    ]);
    await expect(
      extractSkillArchive(
        tarball,
        { mimeType: "application/gzip" },
        { maxFileSize: 1024 * 1024 },
      ),
    ).rejects.toThrow(/maxFileSize/);
  });

  it("enforces maxTotalSize", async () => {
    const tarball = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "a.txt", data: Buffer.alloc(600 * 1024) },
      { name: "b.txt", data: Buffer.alloc(600 * 1024) },
    ]);
    await expect(
      extractSkillArchive(
        tarball,
        { mimeType: "application/gzip" },
        { maxTotalSize: 1024 * 1024 },
      ),
    ).rejects.toThrow(/maxTotalSize|exceeds maxTotalSize/);
  });

  it("rejects a gzip bomb before fully inflating it", async () => {
    // 4 MB of zeros compresses to a few KB but decompresses well past the
    // 1 MB bound. The tar.gz path must abort while *streaming* the inflated
    // bytes, not gunzip the whole payload into memory first.
    const bomb = await buildTarGz([
      { name: "SKILL.md", data: "---\nname: x\ndescription: y\n---" },
      { name: "zeros.bin", data: Buffer.alloc(4 * 1024 * 1024) },
    ]);
    expect(bomb.length).toBeLessThan(1024 * 1024); // tiny compressed
    await expect(
      extractSkillArchive(
        bomb,
        { mimeType: "application/gzip" },
        { maxTotalSize: 1024 * 1024, maxFileSize: 8 * 1024 * 1024 },
      ),
    ).rejects.toThrow(/maxTotalSize/);
  });
});

/**
 * Hand-craft a minimal stored-method (no compression) zip with a single
 * file at the given path. Used to test extractor safety against names
 * that the well-behaved `yazl` writer refuses to produce.
 */
function craftMaliciousZip(fileName: string, content: string): Buffer {
  const data = Buffer.from(content);
  const nameBuf = Buffer.from(fileName);
  // Stored method, no encryption, no compression
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // method = stored
  localHeader.writeUInt16LE(0, 10); // mtime
  localHeader.writeUInt16LE(0, 12); // mdate
  localHeader.writeUInt32LE(0, 14); // crc32 (yauzl tolerates 0 with no validateEntrySizes)
  localHeader.writeUInt32LE(data.length, 18); // compressed size
  localHeader.writeUInt32LE(data.length, 22); // uncompressed size
  localHeader.writeUInt16LE(nameBuf.length, 26); // filename length
  localHeader.writeUInt16LE(0, 28); // extra length

  const localOffset = 0;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central dir signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(0, 10); // method
  central.writeUInt16LE(0, 12); // mtime
  central.writeUInt16LE(0, 14); // mdate
  central.writeUInt32LE(0, 16); // crc32
  central.writeUInt32LE(data.length, 20); // compressed size
  central.writeUInt32LE(data.length, 24); // uncompressed size
  central.writeUInt16LE(nameBuf.length, 28); // filename length
  central.writeUInt16LE(0, 30); // extra length
  central.writeUInt16LE(0, 32); // comment length
  central.writeUInt16LE(0, 34); // disk number
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(localOffset, 42); // local header offset

  const before = Buffer.concat([localHeader, nameBuf, data]);
  const cdEntry = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk where central dir starts
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(cdEntry.length, 12); // central dir size
  eocd.writeUInt32LE(before.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([before, cdEntry, eocd]);
}

describe("archive safety (.zip)", () => {
  // yauzl's own filename validation rejects most malicious names before our
  // extractor's `validateEntryPath` runs. Either layer is acceptable
  // defense — the test asserts only that the archive is rejected, not which
  // layer caught it.
  const REJECTED = /Invalid archive entry path|invalid relative path|absolute path/;

  it("rejects path-traversal segments", async () => {
    const zipBuf = craftMaliciousZip("../escape.txt", "evil");
    await expect(
      extractSkillArchive(zipBuf, { mimeType: "application/zip" }),
    ).rejects.toThrow(REJECTED);
  });

  it("rejects absolute paths", async () => {
    const zipBuf = craftMaliciousZip("/etc/passwd", "evil");
    await expect(
      extractSkillArchive(zipBuf, { mimeType: "application/zip" }),
    ).rejects.toThrow(REJECTED);
  });

  it("rejects archive without SKILL.md at root", async () => {
    const zipBuf = await buildZip([
      { name: "wrapper/SKILL.md", data: "---\nname: x\ndescription: y\n---" },
    ]);
    await expect(
      extractSkillArchive(zipBuf, { mimeType: "application/zip" }),
    ).rejects.toThrow(/SKILL\.md at its root/);
  });
});

// ---------------------------------------------------------------------------
// Format detection failure
// ---------------------------------------------------------------------------

describe("extractSkillArchive (unknown format)", () => {
  it("throws when neither mimeType nor URL suffix identifies a format", async () => {
    await expect(
      extractSkillArchive(Buffer.from("nope"), { url: "skill://x" }),
    ).rejects.toThrow(/Cannot determine archive format/);
  });
});
