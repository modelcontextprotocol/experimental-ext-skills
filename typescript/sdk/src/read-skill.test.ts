/**
 * Tests for the entry-based verified read path (SEP-2640 v1): digest
 * verification against the entry's `resources` manifest, the frontmatter
 * identity check, and the unlisted-file rule.
 */

import { describe, it, expect, vi } from "vitest";
import {
  readSkill,
  readSkillResource,
  readSkillUri,
  readSkillUriVerified,
  frontmatterMatchesEntry,
  manifestOf,
  checkSkillLimits,
} from "./_client.js";
import { sha256Digest } from "./_server.js";
import type { SkillsClient } from "./_client.js";
import type { SkillEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL_MD = `---
name: code-review
description: Review code
---
# Code Review
`;

const SKILL_URI = "skill://code-review/SKILL.md";
const GUIDE_URI = "skill://code-review/references/GUIDE.md";
const GUIDE_TEXT = "# Guide\n";

/** Manifest ref for text content: digest and size over its UTF-8 bytes. */
function ref(uri: string, content: string | Buffer) {
  return { uri, digest: sha256Digest(content), size: Buffer.byteLength(content) };
}

/** Client double that serves fixed content per URI. */
function fixtureClient(
  files: Record<string, { text?: string; blob?: string; mimeType?: string }>,
): SkillsClient {
  return {
    readResource: vi.fn(async ({ uri }: { uri: string }) => {
      const content = files[uri];
      if (!content) throw new Error(`not found: ${uri}`);
      return { contents: [content] };
    }),
  };
}

function entryFor(overrides?: Partial<SkillEntry>): SkillEntry {
  return {
    uri: SKILL_URI,
    frontmatter: { name: "code-review", description: "Review code" },
    resources: [ref(SKILL_URI, SKILL_MD), ref(GUIDE_URI, GUIDE_TEXT)],
    ...overrides,
  };
}

/** A dynamically generated skill: `"resources": "dynamic"`. */
function dynamicEntry(): SkillEntry {
  return entryFor({ resources: "dynamic" });
}

// ---------------------------------------------------------------------------
// readSkillUri — optional verification (baseline)
// ---------------------------------------------------------------------------

describe("readSkillUri verification", () => {
  const client = () => fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });

  it("returns content unverified when no digest is given", async () => {
    expect(await readSkillUri(client(), SKILL_URI)).toBe(SKILL_MD);
  });

  it("returns content when the digest matches", async () => {
    const digest = sha256Digest(Buffer.from(SKILL_MD));
    expect(await readSkillUri(client(), SKILL_URI, digest)).toBe(SKILL_MD);
  });

  it("throws on a digest mismatch", async () => {
    const wrong = "sha256:" + "0".repeat(64);
    await expect(readSkillUri(client(), SKILL_URI, wrong)).rejects.toThrow(
      /Digest mismatch/,
    );
  });

  it("readSkillUriVerified still verifies (back-compat)", async () => {
    const wrong = "sha256:" + "0".repeat(64);
    await expect(
      readSkillUriVerified(client(), SKILL_URI, wrong),
    ).rejects.toThrow(/Digest mismatch/);
  });
});

// ---------------------------------------------------------------------------
// readSkill — entry-verified SKILL.md read
// ---------------------------------------------------------------------------

describe("readSkill", () => {
  it("reads and verifies a skill against its entry", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    expect(await readSkill(client, entryFor())).toBe(SKILL_MD);
  });

  it("throws when the SKILL.md digest does not match (same length, so the size check passes)", async () => {
    const tampered = SKILL_MD.replace("# Code Review", "# Code Reviex");
    const client = fixtureClient({ [SKILL_URI]: { text: tampered } });
    await expect(readSkill(client, entryFor())).rejects.toThrow(/Digest mismatch/);
  });

  it("throws on a frontmatter identity mismatch (equal digest impossible, but check is independent)", async () => {
    // Entry advertises different frontmatter than the file carries, with the
    // digest updated to match the served bytes — only the frontmatter
    // comparison can catch this drift.
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    const entry = entryFor({
      frontmatter: { name: "code-review", description: "Something else" },
    });
    await expect(readSkill(client, entry)).rejects.toThrow(/Frontmatter mismatch/);
  });

  it("passes the frontmatter check when the entry carries extra authored fields the file also has", async () => {
    const md = `---\nname: x\ndescription: D\nlicense: Apache-2.0\nmetadata:\n  version: "2.1.0"\n---\n# X\n`;
    const uri = "skill://x/SKILL.md";
    const client = fixtureClient({ [uri]: { text: md } });
    const entry: SkillEntry = {
      uri,
      frontmatter: {
        name: "x",
        description: "D",
        license: "Apache-2.0",
        metadata: { version: "2.1.0" },
      },
      resources: [ref(uri, md)],
    };
    expect(await readSkill(client, entry)).toBe(md);
  });

  it("throws when the entry's resources is \"dynamic\" (dynamically generated skill)", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    await expect(readSkill(client, dynamicEntry())).rejects.toThrow(/"dynamic"/);
  });

  it("throws on an entry with no resources at all (invalid per the SEP), even with allowUnverified", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    const { resources: _omit, ...invalid } = entryFor();
    await expect(
      readSkill(client, invalid as unknown as SkillEntry, { allowUnverified: true }),
    ).rejects.toThrow(/Invalid entry/);
  });

  it("throws when the read length differs from the entry's size", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD + "\n" } });
    await expect(readSkill(client, entryFor())).rejects.toThrow(/Size mismatch/);
  });

  it("reads a manifest-less skill when allowUnverified is set (frontmatter check still applies)", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    expect(
      await readSkill(client, dynamicEntry(), {
        allowUnverified: true,
      }),
    ).toBe(SKILL_MD);

    const drifted = entryFor({
      omitResources: true,
      frontmatter: { name: "code-review", description: "Drifted" },
    });
    await expect(
      readSkill(client, drifted, { allowUnverified: true }),
    ).rejects.toThrow(/Frontmatter mismatch/);
  });

  it("throws on a malformed entry whose resources omit the SKILL.md itself", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    const entry = entryFor({
      resources: [ref(GUIDE_URI, GUIDE_TEXT)],
    });
    await expect(readSkill(client, entry)).rejects.toThrow(/Malformed entry/);
  });
});

// ---------------------------------------------------------------------------
// readSkillResource — supporting files against the manifest
// ---------------------------------------------------------------------------

describe("readSkillResource", () => {
  it("reads and verifies a listed supporting file", async () => {
    const client = fixtureClient({
      [GUIDE_URI]: { text: GUIDE_TEXT, mimeType: "text/markdown" },
    });
    const result = await readSkillResource(client, entryFor(), GUIDE_URI);
    expect(result.text).toBe(GUIDE_TEXT);
    expect(result.mimeType).toBe("text/markdown");
  });

  it("verifies binary (blob) content against the digest", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const uri = "skill://code-review/assets/logo.png";
    const client = fixtureClient({
      [uri]: { blob: bytes.toString("base64"), mimeType: "image/png" },
    });
    const entry = entryFor({
      resources: [ref(SKILL_URI, SKILL_MD), ref(uri, bytes)],
    });
    const result = await readSkillResource(client, entry, uri);
    expect(result.blob).toBe(bytes.toString("base64"));
  });

  it("throws a verification failure for a file not listed in the manifest", async () => {
    const unlisted = "skill://code-review/scripts/new.sh";
    const client = fixtureClient({ [unlisted]: { text: "#!/bin/sh\n" } });
    await expect(
      readSkillResource(client, entryFor(), unlisted),
    ).rejects.toThrow(/not listed in the resources manifest/);
  });

  it("throws on a digest mismatch for a listed file", async () => {
    const client = fixtureClient({ [GUIDE_URI]: { text: "tampered" } });
    await expect(
      readSkillResource(client, entryFor(), GUIDE_URI),
    ).rejects.toThrow(/Digest mismatch/);
  });

  it("throws on a size mismatch for a listed file before hashing", async () => {
    const client = fixtureClient({ [GUIDE_URI]: { text: GUIDE_TEXT + "x" } });
    await expect(
      readSkillResource(client, entryFor(), GUIDE_URI),
    ).rejects.toThrow(/Size mismatch/);
  });

  it("with \"dynamic\" resources, throws unless allowUnverified is set", async () => {
    const client = fixtureClient({ [GUIDE_URI]: { text: GUIDE_TEXT } });
    const entry = dynamicEntry();
    await expect(
      readSkillResource(client, entry, GUIDE_URI),
    ).rejects.toThrow(/"dynamic"/);
    const result = await readSkillResource(client, entry, GUIDE_URI, {
      allowUnverified: true,
    });
    expect(result.text).toBe(GUIDE_TEXT);
  });
});

// ---------------------------------------------------------------------------
// frontmatterMatchesEntry
// ---------------------------------------------------------------------------

describe("frontmatterMatchesEntry", () => {
  it("matches identical frontmatter field-by-field", () => {
    expect(frontmatterMatchesEntry(SKILL_MD, entryFor())).toBe(true);
  });

  it("fails on an extra field in the file that the entry lacks", () => {
    const md = `---\nname: code-review\ndescription: Review code\nallowed-tools: [Bash]\n---\n`;
    expect(frontmatterMatchesEntry(md, entryFor())).toBe(false);
  });

  it("fails on an extra field in the entry that the file lacks", () => {
    const entry = entryFor({
      frontmatter: {
        name: "code-review",
        description: "Review code",
        license: "MIT",
      },
    });
    expect(frontmatterMatchesEntry(SKILL_MD, entry)).toBe(false);
  });

  it("fails when the content has no parseable frontmatter", () => {
    expect(frontmatterMatchesEntry("# no frontmatter", entryFor())).toBe(false);
  });

  it("compares nested objects deeply", () => {
    const md = `---\nname: x\ndescription: D\nmetadata:\n  version: "2.1.0"\n---\n`;
    const entry: SkillEntry = {
      uri: "skill://x/SKILL.md",
      frontmatter: { name: "x", description: "D", metadata: { version: "2.1.0" } },
    };
    expect(frontmatterMatchesEntry(md, entry)).toBe(true);
    entry.frontmatter = { name: "x", description: "D", metadata: { version: "2.2.0" } };
    expect(frontmatterMatchesEntry(md, entry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// manifestOf / checkSkillLimits — entry-only checks, no reads
// ---------------------------------------------------------------------------

describe("manifestOf", () => {
  it("returns the array for a static skill and undefined for a dynamic one", () => {
    expect(manifestOf(entryFor())).toHaveLength(2);
    expect(manifestOf(dynamicEntry())).toBeUndefined();
  });

  it("throws for a missing or malformed resources value", () => {
    const { resources: _omit, ...missing } = entryFor();
    expect(() => manifestOf(missing as unknown as SkillEntry)).toThrow(/Invalid entry/);
    expect(() =>
      manifestOf({ ...entryFor(), resources: "static" as unknown as "dynamic" }),
    ).toThrow(/Invalid entry/);
  });
});

describe("manifestOf containment", () => {
  it("rejects a manifest that lists a file outside the skill's directory", () => {
    const entry = entryFor({
      resources: [ref(SKILL_URI, SKILL_MD), ref("skill://other/notes.md", "x")],
    });
    expect(() => manifestOf(entry)).toThrow(/outside the skill's directory/);
  });

  it("accepts files at any depth under the skill directory", () => {
    const entry = entryFor({
      resources: [ref(SKILL_URI, SKILL_MD), ref("skill://code-review/a/b/c.md", "x")],
    });
    expect(manifestOf(entry)).toHaveLength(2);
  });

  it("does not let a sibling directory with a shared prefix pass", () => {
    const entry = entryFor({
      resources: [ref(SKILL_URI, SKILL_MD), ref("skill://code-review-extra/x.md", "x")],
    });
    expect(() => manifestOf(entry)).toThrow(/outside the skill's directory/);
  });
});

describe("checkSkillLimits", () => {
  it("counts resources and sums size from the entry alone", () => {
    expect(checkSkillLimits(entryFor())).toEqual({
      withinLimits: true,
      resourceCount: 2,
      totalSize: Buffer.byteLength(SKILL_MD) + Buffer.byteLength(GUIDE_TEXT),
      exceeded: [],
    });
  });

  it("reports which limit a skill exceeds", () => {
    const big = entryFor({
      resources: [ref(SKILL_URI, SKILL_MD), { uri: GUIDE_URI, digest: sha256Digest("x"), size: 16_777_216 }],
    });
    const result = checkSkillLimits(big);
    expect(result.withinLimits).toBe(false);
    expect(result.exceeded).toHaveLength(1);
    expect(result.exceeded[0]).toMatch(/bytes total exceeds/);

    const many = entryFor({
      resources: Array.from({ length: 513 }, (_, i) => ({
        uri: i === 0 ? SKILL_URI : `skill://code-review/f${i}.md`,
        digest: sha256Digest("x"),
        size: 1,
      })),
    });
    expect(checkSkillLimits(many).exceeded[0]).toMatch(/513 resources exceeds/);
  });

  it("has nothing to count for a dynamic skill", () => {
    expect(checkSkillLimits(dynamicEntry())).toEqual({ withinLimits: true, exceeded: [] });
  });
});
