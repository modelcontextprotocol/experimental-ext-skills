/**
 * Tests for instructions mining: extracting skill URIs from a server's
 * `instructions` string and confirming each via `skills/get` (SEP-2640's
 * skill-identity confirmation — the server answers for skills it serves and
 * errors otherwise; the URI scheme proves nothing).
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractSkillUrisFromInstructions,
  listSkillsFromInstructions,
  discoverSkills,
} from "./_client.js";
import {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
} from "./skills-methods.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";
import type { SkillsClient } from "./_client.js";
import type { SkillEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(uri: string, name: string, description = "desc"): SkillEntry {
  return {
    uri,
    frontmatter: { name, description },
    resources: [{ uri, digest: "sha256:" + "a".repeat(64), size: 1 }],
  };
}

/**
 * Client double implementing skills/list + skills/get over a fixed entry
 * set. `listed` controls what skills/list returns (a server MAY list only a
 * subset of what it serves); `served` is what skills/get answers for.
 */
function skillsClient(options: {
  listed?: SkillEntry[];
  served?: SkillEntry[];
  instructions?: string;
}): SkillsClient & { request: ReturnType<typeof vi.fn> } {
  const served = new Map(
    (options.served ?? options.listed ?? []).map((e) => [e.uri, e]),
  );
  const request = vi.fn(
    async (req: { method: string; params?: { uri?: string } }) => {
      if (req.method === SKILLS_LIST_METHOD) {
        return { skills: options.listed ?? [], ttlMs: 0, cacheScope: "private" };
      }
      if (req.method === SKILLS_GET_METHOD) {
        const found = served.get(req.params?.uri ?? "");
        if (!found) throw new Error(`-32602: not a skill: ${req.params?.uri}`);
        return { skill: found };
      }
      throw new Error(`unexpected method ${req.method}`);
    },
  );
  return {
    readResource: vi.fn(),
    request,
    getInstructions: () => options.instructions,
    getServerCapabilities: () => ({ extensions: { [SKILLS_EXTENSION_ID]: {} } }),
  };
}

// ---------------------------------------------------------------------------
// extractSkillUrisFromInstructions
// ---------------------------------------------------------------------------

describe("extractSkillUrisFromInstructions", () => {
  it("returns empty array for missing or empty instructions", () => {
    expect(extractSkillUrisFromInstructions(undefined)).toEqual([]);
    expect(extractSkillUrisFromInstructions("")).toEqual([]);
  });

  it("extracts a single skill:// URI from prose", () => {
    const text = "Read skill://git-workflow/SKILL.md before opening a PR.";
    expect(extractSkillUrisFromInstructions(text)).toEqual([
      "skill://git-workflow/SKILL.md",
    ]);
  });

  it("extracts multiple URIs and deduplicates them", () => {
    const text = `
      Use skill://acme/billing/refunds/SKILL.md for refunds.
      For onboarding, see skill://acme/onboarding/SKILL.md.
      Refunds again: skill://acme/billing/refunds/SKILL.md.
    `;
    expect(extractSkillUrisFromInstructions(text)).toEqual([
      "skill://acme/billing/refunds/SKILL.md",
      "skill://acme/onboarding/SKILL.md",
    ]);
  });

  it("handles non-skill schemes per the SEP (any scheme + SKILL.md)", () => {
    const text =
      "We expose github://acme/platform/skills/deploy/SKILL.md and repo://x/y/SKILL.md.";
    expect(extractSkillUrisFromInstructions(text)).toEqual([
      "github://acme/platform/skills/deploy/SKILL.md",
      "repo://x/y/SKILL.md",
    ]);
  });

  it("strips trailing punctuation from prose URIs", () => {
    const text = "See (skill://x/SKILL.md). Or skill://y/SKILL.md, then continue.";
    const uris = extractSkillUrisFromInstructions(text);
    expect(uris).toContain("skill://x/SKILL.md");
    expect(uris).toContain("skill://y/SKILL.md");
    // None of these should pick up a trailing `,` or `.`
    for (const uri of uris) {
      expect(uri.endsWith(".md")).toBe(true);
    }
  });

  it("ignores non-SKILL.md URLs entirely", () => {
    const text = "Documentation at https://example.com/docs and read foo://bar/baz.txt.";
    expect(extractSkillUrisFromInstructions(text)).toEqual([]);
  });

  it("matches case-insensitively on SKILL.md", () => {
    const text = "Lower: skill://x/skill.md. Mixed: skill://y/Skill.MD.";
    expect(extractSkillUrisFromInstructions(text)).toEqual([
      "skill://x/skill.md",
      "skill://y/Skill.MD",
    ]);
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromInstructions
// ---------------------------------------------------------------------------

describe("listSkillsFromInstructions", () => {
  it("confirms each URI via skills/get and returns entries", async () => {
    const client = skillsClient({
      served: [
        entry("skill://x/SKILL.md", "x", "First skill"),
        entry("skill://y/SKILL.md", "y", "Second skill"),
      ],
    });

    const entries = await listSkillsFromInstructions(
      client,
      "Use skill://x/SKILL.md and skill://y/SKILL.md.",
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      uri: "skill://x/SKILL.md",
      frontmatter: { name: "x", description: "First skill" },
    });
    expect(entries[1].frontmatter.name).toBe("y");
    expect(
      client.request.mock.calls.filter(
        (c) => c[0].method === SKILLS_GET_METHOD,
      ),
    ).toHaveLength(2);
  });

  it("silently drops URIs the server does not serve as skills", async () => {
    const client = skillsClient({
      served: [entry("skill://ok/SKILL.md", "ok")],
    });

    const entries = await listSkillsFromInstructions(
      client,
      "Try skill://broken/SKILL.md and skill://ok/SKILL.md.",
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].uri).toBe("skill://ok/SKILL.md");
  });

  it("returns empty when instructions name no URIs", async () => {
    const client = skillsClient({ served: [] });
    expect(await listSkillsFromInstructions(client, "no URIs here")).toEqual([]);
    expect(client.request).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// discoverSkills() integration with instructions
// ---------------------------------------------------------------------------

describe("discoverSkills with server instructions", () => {
  it("does NOT mine instructions by default", async () => {
    const client = skillsClient({
      listed: [entry("skill://from-list/SKILL.md", "from-list")],
      served: [
        entry("skill://from-list/SKILL.md", "from-list"),
        entry("skill://from-instructions/SKILL.md", "from-instructions"),
      ],
      instructions: "Read skill://from-instructions/SKILL.md when needed.",
    });

    const skills = await discoverSkills(client);

    expect(skills.map((s) => s.frontmatter.name)).toEqual(["from-list"]);
    expect(
      client.request.mock.calls.filter((c) => c[0].method === SKILLS_GET_METHOD),
    ).toHaveLength(0);
  });

  it("merges instructions-confirmed entries with the listing when opted in", async () => {
    const client = skillsClient({
      listed: [entry("skill://from-list/SKILL.md", "from-list")],
      served: [
        entry("skill://from-list/SKILL.md", "from-list"),
        entry("skill://from-instructions/SKILL.md", "from-instructions"),
      ],
      instructions: "Read skill://from-instructions/SKILL.md when needed.",
    });

    const skills = await discoverSkills(client, { instructions: true });

    expect(skills.map((s) => s.frontmatter.name).sort()).toEqual([
      "from-instructions",
      "from-list",
    ]);
  });

  it("does not duplicate an instructions URI that's already listed", async () => {
    const client = skillsClient({
      listed: [entry("skill://shared/SKILL.md", "shared")],
      instructions: "See skill://shared/SKILL.md.",
    });

    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://shared/SKILL.md");
  });

  it("surfaces unlisted skills from instructions when the listing is empty", async () => {
    // A server with an unenumerable catalog: skills/list returns nothing,
    // but skills/get answers for the URI its instructions name.
    const client = skillsClient({
      listed: [],
      served: [entry("skill://from-instr/SKILL.md", "from-instr")],
      instructions: "Use skill://from-instr/SKILL.md.",
    });

    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://from-instr/SKILL.md");
  });

  it("returns an empty array when the server declaredly lacks the extension", async () => {
    const client: SkillsClient = {
      readResource: vi.fn(),
      request: vi.fn(),
      getServerCapabilities: () => ({ extensions: {} }),
    };
    expect(await discoverSkills(client)).toEqual([]);
  });

  it("uses a custom extractor when provided", async () => {
    const client = skillsClient({
      listed: [],
      served: [entry("skill://custom/SKILL.md", "custom")],
      // Instructions list URIs in a non-standard JSON-array form; the custom
      // extractor takes precedence over the built-in regex.
      instructions: '{"my-skills":["skill://custom/SKILL.md"]}',
    });

    const customExtractor = vi.fn(
      (text: string) => JSON.parse(text)["my-skills"] as string[],
    );

    const skills = await discoverSkills(client, {
      instructions: true,
      extractor: customExtractor,
    });

    expect(customExtractor).toHaveBeenCalledOnce();
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://custom/SKILL.md");
  });
});
