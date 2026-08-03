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

function entryFor(
  overrides?: Partial<SkillEntry> & { omitResources?: boolean },
): SkillEntry {
  const { omitResources, ...rest } = overrides ?? {};
  return {
    uri: SKILL_URI,
    frontmatter: { name: "code-review", description: "Review code" },
    ...(omitResources
      ? {}
      : {
          resources: [
            { uri: SKILL_URI, digest: sha256Digest(SKILL_MD) },
            { uri: GUIDE_URI, digest: sha256Digest(GUIDE_TEXT) },
          ],
        }),
    ...rest,
  };
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

  it("throws when the SKILL.md digest does not match", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD + "tampered" } });
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
      resources: [{ uri, digest: sha256Digest(md) }],
    };
    expect(await readSkill(client, entry)).toBe(md);
  });

  it("throws when the entry carries no resources manifest (dynamically generated skill)", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    await expect(
      readSkill(client, entryFor({ omitResources: true })),
    ).rejects.toThrow(/no resources manifest/);
  });

  it("reads a manifest-less skill when allowUnverified is set (frontmatter check still applies)", async () => {
    const client = fixtureClient({ [SKILL_URI]: { text: SKILL_MD } });
    expect(
      await readSkill(client, entryFor({ omitResources: true }), {
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
      resources: [{ uri: GUIDE_URI, digest: sha256Digest(GUIDE_TEXT) }],
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
      resources: [
        { uri: SKILL_URI, digest: sha256Digest(SKILL_MD) },
        { uri, digest: sha256Digest(bytes) },
      ],
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

  it("without a manifest, throws unless allowUnverified is set", async () => {
    const client = fixtureClient({ [GUIDE_URI]: { text: GUIDE_TEXT } });
    const entry = entryFor({ omitResources: true });
    await expect(
      readSkillResource(client, entry, GUIDE_URI),
    ).rejects.toThrow(/no resources manifest/);
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
