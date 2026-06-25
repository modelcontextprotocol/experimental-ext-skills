import { describe, it, expect, vi } from "vitest";
import * as zlib from "node:zlib";
import { pack as tarPack } from "tar-stream";
import {
  readSkill,
  readSkillUri,
  readSkillUriVerified,
  readSkillArchive,
} from "./_client.js";
import { sha256Digest } from "./_server.js";
import type { SkillsClient } from "./_client.js";
import type { SkillSummary } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL_MD = `---
name: code-review
description: Review code
---
# Code Review
`;

/** A real gzip-compressed tar holding a SKILL.md at the archive root. */
async function buildTarGz(skillMd = SKILL_MD): Promise<Buffer> {
  const pack = tarPack();
  const data = Buffer.from(skillMd);
  pack.entry({ name: "SKILL.md", size: data.length }, data);
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return zlib.gzipSync(Buffer.concat(chunks));
}

/** Client double that serves text for a skill-md URI. */
function textClient(text: string): SkillsClient {
  return {
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    readResource: vi.fn().mockResolvedValue({ contents: [{ text }] }),
  };
}

/** Client double that serves an archive (base64 blob) for an archive URI. */
function archiveClient(bytes: Buffer): SkillsClient {
  return {
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    readResource: vi.fn().mockResolvedValue({
      contents: [
        { mimeType: "application/gzip", blob: bytes.toString("base64") },
      ],
    }),
  };
}

function skillMdSummary(digest?: string): SkillSummary & { type: "skill-md" } {
  return {
    name: "code-review",
    skillPath: "code-review",
    uri: "skill://code-review/SKILL.md",
    type: "skill-md",
    description: "Review code",
    digest,
  };
}

function archiveSummary(digest?: string): SkillSummary & { type: "archive" } {
  return {
    name: "code-review",
    skillPath: "code-review",
    uri: "skill://code-review.tar.gz",
    type: "archive",
    description: "Review code",
    digest,
  };
}

// ---------------------------------------------------------------------------
// readSkillUri — optional verification
// ---------------------------------------------------------------------------

describe("readSkillUri verification", () => {
  it("returns content unverified when no digest is given", async () => {
    const client = textClient(SKILL_MD);
    expect(await readSkillUri(client, "skill://code-review/SKILL.md")).toBe(SKILL_MD);
  });

  it("returns content when the digest matches", async () => {
    const client = textClient(SKILL_MD);
    const digest = sha256Digest(Buffer.from(SKILL_MD));
    expect(
      await readSkillUri(client, "skill://code-review/SKILL.md", digest),
    ).toBe(SKILL_MD);
  });

  it("throws on a digest mismatch", async () => {
    const client = textClient(SKILL_MD);
    const wrong = "sha256:" + "0".repeat(64);
    await expect(
      readSkillUri(client, "skill://code-review/SKILL.md", wrong),
    ).rejects.toThrow(/Digest mismatch/);
  });

  it("readSkillUriVerified still verifies (back-compat)", async () => {
    const client = textClient(SKILL_MD);
    const wrong = "sha256:" + "0".repeat(64);
    await expect(
      readSkillUriVerified(client, "skill://code-review/SKILL.md", wrong),
    ).rejects.toThrow(/Digest mismatch/);
  });
});

// ---------------------------------------------------------------------------
// readSkillArchive — optional verification
// ---------------------------------------------------------------------------

describe("readSkillArchive verification", () => {
  it("unpacks when the digest matches", async () => {
    const bytes = await buildTarGz();
    const client = archiveClient(bytes);
    const unpacked = await readSkillArchive(client, "skill://code-review.tar.gz", {
      expectedDigest: sha256Digest(bytes),
    });
    expect(unpacked.files.get("SKILL.md")!.toString("utf-8")).toBe(SKILL_MD);
  });

  it("throws before unpacking on a digest mismatch", async () => {
    const bytes = await buildTarGz();
    const client = archiveClient(bytes);
    await expect(
      readSkillArchive(client, "skill://code-review.tar.gz", {
        expectedDigest: "sha256:" + "0".repeat(64),
      }),
    ).rejects.toThrow(/Digest mismatch/);
  });

  it("unpacks without verification when no digest is given (back-compat)", async () => {
    const bytes = await buildTarGz();
    const client = archiveClient(bytes);
    const unpacked = await readSkillArchive(client, "skill://code-review.tar.gz");
    expect(unpacked.files.has("SKILL.md")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readSkill — verifies by default against the summary digest
// ---------------------------------------------------------------------------

describe("readSkill", () => {
  it("reads and verifies a skill-md summary", async () => {
    const client = textClient(SKILL_MD);
    const summary = skillMdSummary(sha256Digest(Buffer.from(SKILL_MD)));
    expect(await readSkill(client, summary)).toBe(SKILL_MD);
  });

  it("throws when a skill-md summary digest does not match", async () => {
    const client = textClient(SKILL_MD);
    const summary = skillMdSummary("sha256:" + "0".repeat(64));
    await expect(readSkill(client, summary)).rejects.toThrow(/Digest mismatch/);
  });

  it("reads, verifies, and unpacks an archive summary", async () => {
    const bytes = await buildTarGz();
    const client = archiveClient(bytes);
    const summary = archiveSummary(sha256Digest(bytes));
    const unpacked = await readSkill(client, summary);
    expect(unpacked.files.get("SKILL.md")!.toString("utf-8")).toBe(SKILL_MD);
  });

  it("throws when an archive summary digest does not match", async () => {
    const bytes = await buildTarGz();
    const client = archiveClient(bytes);
    const summary = archiveSummary("sha256:" + "0".repeat(64));
    await expect(readSkill(client, summary)).rejects.toThrow(/Digest mismatch/);
  });

  it("throws when the summary carries no digest (SEP requires one)", async () => {
    const client = textClient(SKILL_MD);
    await expect(readSkill(client, skillMdSummary(undefined))).rejects.toThrow(
      /carries no digest/,
    );
  });

  it("reads unverified when allowUnverified is set despite a missing digest", async () => {
    const client = textClient(SKILL_MD);
    const result = await readSkill(client, skillMdSummary(undefined), {
      allowUnverified: true,
    });
    expect(result).toBe(SKILL_MD);
  });
});
