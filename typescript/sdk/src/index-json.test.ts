import { describe, it, expect, vi } from "vitest";
import { generateSkillIndex } from "./_server.js";
import { listSkillsFromIndex, listSkills } from "./_client.js";
import type { SkillMetadata } from "./types.js";
import { SKILL_INDEX_SCHEMA } from "./types.js";
import type { SkillsClient } from "./_client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillMetadata> & { name: string; skillPath: string; description: string }): SkillMetadata {
  return {
    absolutePath: `/skills/${overrides.skillPath}/SKILL.md`,
    skillDir: `/skills/${overrides.skillPath}`,
    documents: [],
    manifest: { skill: overrides.name, skillPath: overrides.skillPath, files: [] },
    lastModified: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSkillMap(skills: SkillMetadata[]): Map<string, SkillMetadata> {
  return new Map(skills.map((s) => [s.skillPath, s]));
}

/** Create a mock client that returns the given index JSON from readResource. */
function mockClientWithIndex(indexJson: unknown): SkillsClient {
  return {
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    readResource: vi.fn().mockResolvedValue({
      contents: [{ text: JSON.stringify(indexJson) }],
    }),
  };
}

// ---------------------------------------------------------------------------
// generateSkillIndex (server-side)
// ---------------------------------------------------------------------------

describe("generateSkillIndex", () => {
  it("generates correct index for single skill", () => {
    const map = makeSkillMap([
      makeSkill({ name: "code-review", skillPath: "code-review", description: "Review code" }),
    ]);

    const index = generateSkillIndex(map);

    expect(index.$schema).toBe(SKILL_INDEX_SCHEMA);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]).toEqual({
      name: "code-review",
      type: "skill-md",
      description: "Review code",
      url: "skill://code-review/SKILL.md",
    });
  });

  it("generates correct URIs for multi-segment paths", () => {
    const map = makeSkillMap([
      makeSkill({ name: "refunds", skillPath: "acme/billing/refunds", description: "Process refunds" }),
      makeSkill({ name: "onboarding", skillPath: "acme/onboarding", description: "Onboard employees" }),
    ]);

    const index = generateSkillIndex(map);

    expect(index.skills).toHaveLength(2);
    expect(index.skills[0].url).toBe("skill://acme/billing/refunds/SKILL.md");
    expect(index.skills[0].name).toBe("refunds");
    expect(index.skills[1].url).toBe("skill://acme/onboarding/SKILL.md");
    expect(index.skills[1].name).toBe("onboarding");
  });

  it("returns empty skills array for empty map", () => {
    const index = generateSkillIndex(new Map());
    expect(index.$schema).toBe(SKILL_INDEX_SCHEMA);
    expect(index.skills).toEqual([]);
  });

  it("all entries have type skill-md", () => {
    const map = makeSkillMap([
      makeSkill({ name: "a", skillPath: "a", description: "A" }),
      makeSkill({ name: "b", skillPath: "x/b", description: "B" }),
    ]);

    const index = generateSkillIndex(map);
    for (const entry of index.skills) {
      expect(entry.type).toBe("skill-md");
    }
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex (client-side)
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex", () => {
  it("parses a valid index into SkillSummary array", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "code-review", type: "skill-md", description: "Review code", url: "skill://code-review/SKILL.md" },
        { name: "refunds", type: "skill-md", description: "Refunds", url: "skill://acme/billing/refunds/SKILL.md" },
      ],
    });

    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(2);
    expect(skills![0]).toEqual({
      name: "code-review",
      skillPath: "code-review",
      uri: "skill://code-review/SKILL.md",
      description: "Review code",
      mimeType: "text/markdown",
    });
    expect(skills![1]).toEqual({
      name: "refunds",
      skillPath: "acme/billing/refunds",
      uri: "skill://acme/billing/refunds/SKILL.md",
      description: "Refunds",
      mimeType: "text/markdown",
    });
  });

  it("filters out entries with unknown type", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "good", type: "skill-md", description: "Good", url: "skill://good/SKILL.md" },
        { name: "archive", type: "skill-tar-gz", description: "Archive", url: "https://example.com/archive.tar.gz" },
      ],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(skills![0].name).toBe("good");
  });

  it("returns null when server throws (no index.json)", async () => {
    const client: SkillsClient = {
      listResources: vi.fn(),
      readResource: vi.fn().mockRejectedValue(new Error("Resource not found")),
    };

    const skills = await listSkillsFromIndex(client);
    expect(skills).toBeNull();
  });

  it("returns null for empty content", async () => {
    const client: SkillsClient = {
      listResources: vi.fn(),
      readResource: vi.fn().mockResolvedValue({ contents: [] }),
    };

    const skills = await listSkillsFromIndex(client);
    expect(skills).toBeNull();
  });

  it("returns null for malformed JSON (missing skills array)", async () => {
    const client = mockClientWithIndex({ $schema: SKILL_INDEX_SCHEMA });
    const skills = await listSkillsFromIndex(client);
    expect(skills).toBeNull();
  });

  it("reads from the correct well-known URI", async () => {
    const readResource = vi.fn().mockResolvedValue({
      contents: [{ text: JSON.stringify({ $schema: SKILL_INDEX_SCHEMA, skills: [] }) }],
    });
    const client: SkillsClient = { listResources: vi.fn(), readResource };

    await listSkillsFromIndex(client);

    expect(readResource).toHaveBeenCalledWith({ uri: "skill://index.json" });
  });
});

// ---------------------------------------------------------------------------
// Round-trip: generateSkillIndex → listSkillsFromIndex
// ---------------------------------------------------------------------------

describe("index round-trip (server generates → client consumes)", () => {
  it("produces matching SkillSummary entries", async () => {
    const map = makeSkillMap([
      makeSkill({ name: "refunds", skillPath: "acme/billing/refunds", description: "Process refunds" }),
      makeSkill({ name: "code-review", skillPath: "code-review", description: "Review code" }),
    ]);

    const index = generateSkillIndex(map);
    const client = mockClientWithIndex(index);
    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(2);
    expect(skills!.map((s) => s.name).sort()).toEqual(["code-review", "refunds"]);
    expect(skills!.find((s) => s.name === "refunds")!.skillPath).toBe("acme/billing/refunds");
    expect(skills!.find((s) => s.name === "code-review")!.skillPath).toBe("code-review");
  });
});

// ---------------------------------------------------------------------------
// listSkills (resources/list filtering)
// ---------------------------------------------------------------------------

describe("listSkills", () => {
  it("filters to only SKILL.md resources", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "skill://code-review/SKILL.md", name: "code-review", description: "Review" },
          { uri: "skill://code-review/_manifest", name: "code-review-manifest" },
          { uri: "skill://index.json", name: "skills-index" },
          { uri: "skill://acme/billing/refunds/SKILL.md", name: "refunds", description: "Refunds" },
        ],
      }),
      readResource: vi.fn(),
    };

    const skills = await listSkills(client);

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe("code-review");
    expect(skills[1].name).toBe("refunds");
    expect(skills[1].skillPath).toBe("acme/billing/refunds");
  });

  it("handles pagination", async () => {
    const listResources = vi.fn()
      .mockResolvedValueOnce({
        resources: [{ uri: "skill://a/SKILL.md", name: "a" }],
        nextCursor: "page2",
      })
      .mockResolvedValueOnce({
        resources: [{ uri: "skill://b/SKILL.md", name: "b" }],
      });

    const client: SkillsClient = { listResources, readResource: vi.fn() };
    const skills = await listSkills(client);

    expect(skills).toHaveLength(2);
    expect(listResources).toHaveBeenCalledTimes(2);
    expect(listResources).toHaveBeenCalledWith({ cursor: "page2" });
  });

  it("returns empty array when no skills exist", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource: vi.fn(),
    };

    const skills = await listSkills(client);
    expect(skills).toEqual([]);
  });
});
