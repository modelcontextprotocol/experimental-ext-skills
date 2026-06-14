/**
 * Tests for the third SEP discovery path: mining server `instructions`
 * for skill URIs.
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractSkillUrisFromInstructions,
  listSkillsFromInstructions,
  discoverSkills,
} from "./_client.js";
import type { SkillsClient } from "./_client.js";

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
  it("reads each URI and parses frontmatter", async () => {
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      const content =
        uri === "skill://x/SKILL.md"
          ? "---\nname: x\ndescription: First skill\n---\n# X"
          : "---\nname: y\ndescription: Second skill\n---\n# Y";
      return { contents: [{ text: content }] };
    });
    const client: SkillsClient = { listResources: vi.fn(), readResource };

    const summaries = await listSkillsFromInstructions(
      client,
      "Use skill://x/SKILL.md and skill://y/SKILL.md.",
    );

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      name: "x",
      skillPath: "x",
      uri: "skill://x/SKILL.md",
      description: "First skill",
    });
    expect(summaries[1].name).toBe("y");
  });

  it("silently skips URIs that fail to read", async () => {
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://broken/SKILL.md")
        throw new Error("server: not found");
      return {
        contents: [{ text: "---\nname: ok\ndescription: ok\n---\n# OK" }],
      };
    });
    const client: SkillsClient = { listResources: vi.fn(), readResource };

    const summaries = await listSkillsFromInstructions(
      client,
      "Try skill://broken/SKILL.md and skill://ok/SKILL.md.",
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].uri).toBe("skill://ok/SKILL.md");
  });

  it("returns empty when instructions name no URIs", async () => {
    const client: SkillsClient = {
      listResources: vi.fn(),
      readResource: vi.fn(),
    };
    expect(await listSkillsFromInstructions(client, "no URIs here")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discoverSkills() integration with instructions
// ---------------------------------------------------------------------------

describe("discoverSkills with server instructions", () => {
  it("does NOT mine instructions by default", async () => {
    const indexJson = {
      skills: [
        {
          frontmatter: { name: "from-index", description: "Index" },
          url: "skill://from-index/SKILL.md",
          digest: "sha256:" + "a".repeat(64),
        },
      ],
    };
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://index.json")
        return { contents: [{ text: JSON.stringify(indexJson) }] };
      throw new Error("server should not be asked for this URI");
    });
    const getInstructions = vi.fn(
      () => "Read skill://from-instructions/SKILL.md when needed.",
    );
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource,
      getInstructions,
    };

    const skills = await discoverSkills(client);

    expect(skills.map((s) => s.name)).toEqual(["from-index"]);
    expect(getInstructions).not.toHaveBeenCalled();
  });

  it("merges instructions URIs with index entries when opted in", async () => {
    const indexJson = {
      skills: [
        {
          frontmatter: { name: "from-index", description: "Index" },
          url: "skill://from-index/SKILL.md",
          digest: "sha256:" + "a".repeat(64),
        },
      ],
    };
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://index.json")
        return { contents: [{ text: JSON.stringify(indexJson) }] };
      if (uri === "skill://from-instructions/SKILL.md")
        return {
          contents: [
            {
              text: "---\nname: from-instructions\ndescription: From instructions\n---\n# X",
            },
          ],
        };
      throw new Error("not found");
    });
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource,
      getInstructions: () =>
        "Read skill://from-instructions/SKILL.md when needed.",
    };

    const skills = await discoverSkills(client, { instructions: true });

    expect(skills.map((s) => s.name).sort()).toEqual([
      "from-index",
      "from-instructions",
    ]);
  });

  it("does not duplicate an instructions URI that's already in the index", async () => {
    const indexJson = {
      skills: [
        {
          frontmatter: { name: "shared", description: "Shared" },
          url: "skill://shared/SKILL.md",
          digest: "sha256:" + "a".repeat(64),
        },
      ],
    };
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://index.json")
        return { contents: [{ text: JSON.stringify(indexJson) }] };
      return {
        contents: [{ text: "---\nname: shared\ndescription: S\n---\n# S" }],
      };
    });
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource,
      getInstructions: () => "See skill://shared/SKILL.md.",
    };

    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://shared/SKILL.md");
  });

  it("uses instructions when index is unavailable, before resources/list", async () => {
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://index.json") throw new Error("no index");
      return {
        contents: [
          { text: "---\nname: from-instr\ndescription: I\n---\n# X" },
        ],
      };
    });
    const listResources = vi.fn();
    const client: SkillsClient = {
      listResources,
      readResource,
      getInstructions: () => "Use skill://from-instr/SKILL.md.",
    };

    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://from-instr/SKILL.md");
    expect(listResources).not.toHaveBeenCalled();
  });

  it("falls through to resources/list when index empty and instructions opted out", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://from-list/SKILL.md",
            name: "from-list",
            description: "L",
          },
        ],
      }),
      readResource: vi.fn().mockRejectedValue(new Error("no index")),
      getInstructions: () => "Some instructions with skill://x/SKILL.md.",
    };

    const skills = await discoverSkills(client);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("from-list");
  });

  it("uses a custom extractor when provided", async () => {
    const readResource = vi.fn(async ({ uri }: { uri: string }) => {
      if (uri === "skill://index.json") throw new Error("no index");
      return {
        contents: [{ text: "---\nname: custom\ndescription: C\n---\n# C" }],
      };
    });
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource,
      getInstructions: () =>
        // Instructions list URIs in a non-standard JSON-array form that the
        // built-in regex would still match, but we want to demonstrate the
        // custom extractor takes precedence and can return whatever it wants.
        '{"my-skills":["skill://custom/SKILL.md"]}',
    };

    const customExtractor = vi.fn(
      (text: string) =>
        // Pretend we parse the JSON and return the array
        JSON.parse(text)["my-skills"] as string[],
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
