import { describe, it, expect, vi } from "vitest";
import { generateSkillIndex } from "./_server.js";
import { listSkillsFromIndex, listSkillTemplatesFromIndex, listSkills, discoverSkills, discoverAndBuildCatalog } from "./_client.js";
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
// generateSkillIndex with template declarations
// ---------------------------------------------------------------------------

describe("generateSkillIndex with templates", () => {
  it("appends mcp-resource-template entries per SEP format", () => {
    const map = makeSkillMap([
      makeSkill({ name: "code-review", skillPath: "code-review", description: "Review code" }),
    ]);

    const index = generateSkillIndex(map, [
      { name: "docs", description: "Product docs", uriTemplate: "skill://docs/{product}/SKILL.md" },
    ]);

    expect(index.skills).toHaveLength(2);
    expect(index.skills[0]).toEqual({
      name: "code-review",
      type: "skill-md",
      description: "Review code",
      url: "skill://code-review/SKILL.md",
    });
    // SEP: template entries use `url` (not uriTemplate) and omit `name`
    expect(index.skills[1]).toEqual({
      type: "mcp-resource-template",
      description: "Product docs",
      url: "skill://docs/{product}/SKILL.md",
    });
  });

  it("works with empty skill map and only templates", () => {
    const index = generateSkillIndex(new Map(), [
      { name: "t1", description: "T1", uriTemplate: "skill://t1/{x}/SKILL.md" },
    ]);

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].type).toBe("mcp-resource-template");
  });

  it("works with no templates (backward compat)", () => {
    const map = makeSkillMap([
      makeSkill({ name: "a", skillPath: "a", description: "A" }),
    ]);

    const index = generateSkillIndex(map);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].type).toBe("skill-md");
  });
});

// ---------------------------------------------------------------------------
// listSkillTemplatesFromIndex
// ---------------------------------------------------------------------------

describe("listSkillTemplatesFromIndex", () => {
  it("returns only mcp-resource-template entries", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "code-review", type: "skill-md", description: "Review", url: "skill://code-review/SKILL.md" },
        { type: "mcp-resource-template", description: "Docs", url: "skill://docs/{product}/SKILL.md" },
      ],
    });

    const templates = await listSkillTemplatesFromIndex(client);
    expect(templates).toHaveLength(1);
    expect(templates![0]).toEqual({
      name: undefined,
      description: "Docs",
      uriTemplate: "skill://docs/{product}/SKILL.md",
    });
  });

  it("returns empty array when no templates exist", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "a", type: "skill-md", description: "A", url: "skill://a/SKILL.md" },
      ],
    });

    const templates = await listSkillTemplatesFromIndex(client);
    expect(templates).toEqual([]);
  });

  it("returns null when server has no index", async () => {
    const client: SkillsClient = {
      listResources: vi.fn(),
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const templates = await listSkillTemplatesFromIndex(client);
    expect(templates).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex with non-skill:// URI schemes
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex with non-skill:// URI schemes", () => {
  it("handles entries with any URI scheme", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "copilot-sdk", type: "skill-md", description: "Copilot SDK guide", url: "repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md" },
        { name: "code-review", type: "skill-md", description: "Review code", url: "skill://code-review/SKILL.md" },
        { name: "deploy-guide", type: "skill-md", description: "Deployment guide", url: "github://acme/platform/skills/deploy-guide/SKILL.md" },
      ],
    });

    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(3);

    // Non-skill:// entry: uri preserved as-is, skillPath falls back to name
    const copilot = skills!.find((s) => s.name === "copilot-sdk")!;
    expect(copilot.uri).toBe("repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md");
    expect(copilot.skillPath).toBe("copilot-sdk");
    expect(copilot.description).toBe("Copilot SDK guide");

    // skill:// entry: skillPath extracted from URI structure
    const codeReview = skills!.find((s) => s.name === "code-review")!;
    expect(codeReview.uri).toBe("skill://code-review/SKILL.md");
    expect(codeReview.skillPath).toBe("code-review");

    // Another non-skill:// scheme
    const deploy = skills!.find((s) => s.name === "deploy-guide")!;
    expect(deploy.uri).toBe("github://acme/platform/skills/deploy-guide/SKILL.md");
    expect(deploy.skillPath).toBe("deploy-guide");
  });

  it("produces summaries that work with readSkillUri", async () => {
    const readResource = vi.fn().mockResolvedValue({
      contents: [{ text: "---\nname: copilot-sdk\ndescription: Guide\n---\n# Content" }],
    });
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource,
    };

    // Simulate reading a non-skill:// URI from an index entry
    const { readSkillUri } = await import("./_client.js");
    const uri = "repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md";
    const content = await readSkillUri(client, uri);

    expect(content).toContain("copilot-sdk");
    expect(readResource).toHaveBeenCalledWith({ uri });
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex ignores template entries
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex with mixed entry types", () => {
  it("returns only skill-md entries, ignoring templates", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "a", type: "skill-md", description: "A", url: "skill://a/SKILL.md" },
        { type: "mcp-resource-template", description: "T1", url: "skill://t1/{x}/SKILL.md" },
        { name: "b", type: "skill-md", description: "B", url: "skill://b/SKILL.md" },
      ],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(2);
    expect(skills!.map((s) => s.name)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// $schema validation in listSkillsFromIndex
// ---------------------------------------------------------------------------

describe("$schema validation", () => {
  const validEntry = { name: "a", type: "skill-md", description: "A", url: "skill://a/SKILL.md" };

  it("does not warn for known schema URI", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [validEntry],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns but still returns skills for unknown schema URI", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = mockClientWithIndex({
      $schema: "https://example.com/unknown-schema/1.0",
      skills: [validEntry],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(skills![0].name).toBe("a");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("unknown-schema");
    warnSpy.mockRestore();
  });

  it("does not warn when $schema is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = mockClientWithIndex({
      skills: [validEntry],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not warn when $schema is empty string", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = mockClientWithIndex({
      $schema: "",
      skills: [validEntry],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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

  it("round-trips both skill-md and template entries", async () => {
    const map = makeSkillMap([
      makeSkill({ name: "code-review", skillPath: "code-review", description: "Review" }),
    ]);
    const templates = [
      { name: "docs", description: "Product docs", uriTemplate: "skill://docs/{product}/SKILL.md" },
    ];

    const index = generateSkillIndex(map, templates);
    const client = mockClientWithIndex(index);

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(skills![0].name).toBe("code-review");

    const tmpl = await listSkillTemplatesFromIndex(client);
    expect(tmpl).toHaveLength(1);
    expect(tmpl![0].uriTemplate).toBe("skill://docs/{product}/SKILL.md");
    expect(tmpl![0].name).toBeUndefined();
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

// ---------------------------------------------------------------------------
// discoverSkills (convenience: index-first with fallback)
// ---------------------------------------------------------------------------

describe("discoverSkills", () => {
  it("returns skills from index when available", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "code-review", type: "skill-md", description: "Review code", url: "skill://code-review/SKILL.md" },
      ],
    });

    const skills = await discoverSkills(client);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("code-review");
    expect(client.listResources).not.toHaveBeenCalled();
  });

  it("falls back to resources/list when index is unavailable", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "skill://git-workflow/SKILL.md", name: "git-workflow", description: "Git workflow" },
        ],
      }),
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const skills = await discoverSkills(client);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("git-workflow");
  });

  it("falls back to resources/list when index returns empty skills", async () => {
    const client: SkillsClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{ text: JSON.stringify({ $schema: SKILL_INDEX_SCHEMA, skills: [] }) }],
      }),
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "skill://fallback/SKILL.md", name: "fallback", description: "Fallback" },
        ],
      }),
    };

    const skills = await discoverSkills(client);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("fallback");
  });

  it("falls back when index has only template entries", async () => {
    const client: SkillsClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{
          text: JSON.stringify({
            $schema: SKILL_INDEX_SCHEMA,
            skills: [
              { type: "mcp-resource-template", description: "Docs", url: "skill://docs/{x}/SKILL.md" },
            ],
          }),
        }],
      }),
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "skill://concrete/SKILL.md", name: "concrete", description: "Concrete" },
        ],
      }),
    };

    const skills = await discoverSkills(client);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("concrete");
  });

  it("returns empty array when nothing found", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const skills = await discoverSkills(client);

    expect(skills).toEqual([]);
  });

  it("never returns null", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const result = await discoverSkills(client);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
  });

  it("prefers index over resources/list", async () => {
    const client: SkillsClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{
          text: JSON.stringify({
            $schema: SKILL_INDEX_SCHEMA,
            skills: [
              { name: "from-index", type: "skill-md", description: "From index", url: "skill://from-index/SKILL.md" },
            ],
          }),
        }],
      }),
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "skill://from-list/SKILL.md", name: "from-list", description: "From list" },
        ],
      }),
    };

    const skills = await discoverSkills(client);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("from-index");
    expect(client.listResources).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// discoverAndBuildCatalog (convenience: discover + catalog in one call)
// ---------------------------------------------------------------------------

describe("discoverAndBuildCatalog", () => {
  it("returns skills and catalog text", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "code-review", type: "skill-md", description: "Review code", url: "skill://code-review/SKILL.md" },
      ],
    });

    const result = await discoverAndBuildCatalog(client, {
      serverName: "my-server",
    });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("code-review");
    expect(result.catalog).toContain("<available_skills>");
    expect(result.catalog).toContain("`my-server`");
    expect(result.catalog).toContain("`read_resource`");
  });

  it("uses default toolName from READ_RESOURCE_TOOL", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "a", type: "skill-md", description: "A", url: "skill://a/SKILL.md" },
      ],
    });

    const result = await discoverAndBuildCatalog(client, {
      serverName: "test-server",
    });

    expect(result.catalog).toContain("`read_resource`");
  });

  it("allows overriding toolName", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "a", type: "skill-md", description: "A", url: "skill://a/SKILL.md" },
      ],
    });

    const result = await discoverAndBuildCatalog(client, {
      serverName: "test-server",
      toolName: "ReadMcpResourceTool",
    });

    expect(result.catalog).toContain("`ReadMcpResourceTool`");
    expect(result.catalog).not.toContain("`read_resource`");
  });

  it("returns empty catalog when no skills found", async () => {
    const client: SkillsClient = {
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      readResource: vi.fn().mockRejectedValue(new Error("Not found")),
    };

    const result = await discoverAndBuildCatalog(client, {
      serverName: "empty-server",
    });

    expect(result.skills).toEqual([]);
    expect(result.catalog).toBe("");
  });

  it("includes server name for activation reliability", async () => {
    const client = mockClientWithIndex({
      $schema: SKILL_INDEX_SCHEMA,
      skills: [
        { name: "x", type: "skill-md", description: "X", url: "skill://x/SKILL.md" },
      ],
    });

    const result = await discoverAndBuildCatalog(client, {
      serverName: "production-skills",
    });

    expect(result.catalog).toContain("`production-skills`");
  });
});
