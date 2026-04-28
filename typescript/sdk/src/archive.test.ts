import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { gunzipSync } from "node:zlib";
import { packTar, packSkillTarGz } from "./archive.js";
import { discoverSkills } from "./_server.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-archive-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Minimal USTAR parser for tests: returns a list of { name, size, dataOffset }
 * for the regular-file entries in a tar buffer. Stops at the first all-zero
 * 512-byte block (end-of-archive marker).
 */
function parseTar(buf: Buffer): { name: string; size: number; data: Buffer }[] {
  const entries: { name: string; size: number; data: Buffer }[] = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);

    // Detect zero block
    let isZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isZero = false;
        break;
      }
    }
    if (isZero) break;

    const nameEnd = header.indexOf(0, 0);
    const name = header.subarray(0, nameEnd === -1 ? 100 : nameEnd).toString("utf8");
    const sizeStr = header
      .subarray(124, 135)
      .toString("ascii")
      .replace(/\0+$/, "");
    const size = parseInt(sizeStr, 8);
    const data = buf.subarray(offset + 512, offset + 512 + size);

    // Verify magic
    const magic = header.subarray(257, 263).toString("ascii");
    expect(magic).toBe("ustar\0");

    entries.push({ name, size, data: Buffer.from(data) });

    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

describe("packTar", () => {
  it("packs a single file into a USTAR buffer", () => {
    const buf = packTar([
      { path: "hello.txt", data: Buffer.from("hi"), mtime: 0 },
    ]);
    expect(buf.length % 512).toBe(0);

    const parsed = parseTar(buf);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("hello.txt");
    expect(parsed[0].size).toBe(2);
    expect(parsed[0].data.toString("utf8")).toBe("hi");
  });

  it("ends with two zero blocks", () => {
    const buf = packTar([
      { path: "a", data: Buffer.from("abc"), mtime: 0 },
    ]);
    const tail = buf.subarray(buf.length - 1024);
    for (let i = 0; i < 1024; i++) expect(tail[i]).toBe(0);
  });

  it("computes a verifiable checksum", () => {
    const buf = packTar([
      { path: "hello.txt", data: Buffer.from("hi"), mtime: 0 },
    ]);
    const header = buf.subarray(0, 512);

    // Replace checksum field with 8 spaces and re-sum
    const withSpaces = Buffer.from(header);
    withSpaces.fill(0x20, 148, 156);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += withSpaces[i];

    const checksumStr = header.subarray(148, 154).toString("ascii");
    expect(parseInt(checksumStr, 8)).toBe(sum);
  });

  it("rejects paths longer than 100 bytes", () => {
    const longPath = "a".repeat(101);
    expect(() =>
      packTar([{ path: longPath, data: Buffer.alloc(0), mtime: 0 }]),
    ).toThrow(/USTAR 100-byte limit/);
  });
});

describe("packSkillTarGz", () => {
  it("packs SKILL.md and supplementary files into a gzipped tar", () => {
    const skillDir = path.join(tmpDir, "code-review");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\ndescription: Review code\n---\n# CR",
    );
    fs.mkdirSync(path.join(skillDir, "refs"));
    fs.writeFileSync(
      path.join(skillDir, "refs", "doc.md"),
      "# Reference",
    );

    const skill = discoverSkills(tmpDir).get("code-review")!;
    const gz = packSkillTarGz(skill, tmpDir);
    const tar = gunzipSync(gz);
    const entries = parseTar(tar);

    const paths = entries.map((e) => e.name).sort();
    expect(paths).toEqual(["SKILL.md", "refs/doc.md"]);

    const skillMd = entries.find((e) => e.name === "SKILL.md")!;
    expect(skillMd.data.toString("utf8")).toContain("name: code-review");

    const refDoc = entries.find((e) => e.name === "refs/doc.md")!;
    expect(refDoc.data.toString("utf8")).toBe("# Reference");
  });

  it("places SKILL.md at the archive root (no wrapper directory)", () => {
    const skillDir = path.join(tmpDir, "flat");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: flat\ndescription: Flat\n---\n",
    );

    const skill = discoverSkills(tmpDir).get("flat")!;
    const tar = gunzipSync(packSkillTarGz(skill, tmpDir));
    const entries = parseTar(tar);
    expect(entries[0].name).toBe("SKILL.md");
    // No path traversal
    for (const e of entries) {
      expect(e.name).not.toMatch(/^\.\.|^\//);
    }
  });
});
