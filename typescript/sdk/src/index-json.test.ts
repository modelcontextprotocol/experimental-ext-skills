import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateSkillIndex, sha256Digest } from "./_server.js";
import {
  listSkillsFromIndex,
  listSkills,
  discoverSkills,
  discoverAndBuildCatalog,
} from "./_client.js";
import type { SkillMetadata } from "./types.js";
import type { SkillsClient } from "./_client.js";

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(
  overrides: Partial<SkillMetadata> & {
    name: string;
    skillPath: string;
    description: string;
  },
): SkillMetadata {
  return {
    absolutePath: `/skills/${overrides.skillPath}/SKILL.md`,
    skillDir: `/skills/${overrides.skillPath}`,
    documents: [],
    size: 0,
    lastModified: "2026-01-01T00:00:00.000Z",
    frontmatter: { name: overrides.name, description: overrides.description },
    digest: "sha256:" + "0".repeat(64),
    ...overrides,
  };
}

function makeSkillMap(skills: SkillMetadata[]): Map<string, SkillMetadata> {
  return new Map(skills.map((s) => [s.skillPath, s]));
}

/** A type-less skill-md index entry (SEP-2640). */
function skillMdEntry(
  name: string,
  url: string,
  description: string,
  extraFrontmatter: Record<string, unknown> = {},
) {
  return {
    frontmatter: { name, description, ...extraFrontmatter },
    url,
    digest: "sha256:" + "a".repeat(64),
  };
}

/** A type-less archive-only index entry (SEP-2640). */
function archiveEntry(
  name: string,
  archiveUrl: string,
  description: string,
  mimeType = "application/gzip",
) {
  return {
    frontmatter: { name, description },
    archives: [{ url: archiveUrl, mimeType, digest: "sha256:" + "b".repeat(64) }],
  };
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

// Real temp archive files (the index reader hashes archive bytes for `digest`).
let tmpDir: string;
const archivePath = (name: string) => path.join(tmpDir, name);
function writeArchive(name: string, bytes = `bytes-of-${name}`): string {
  const p = archivePath(name);
  fs.writeFileSync(p, bytes);
  return p;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-skills-index-"));
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// generateSkillIndex (server-side)
// ---------------------------------------------------------------------------

describe("generateSkillIndex", () => {
  it("generates correct index for single skill", () => {
    const map = makeSkillMap([
      makeSkill({ name: "code-review", skillPath: "code-review", description: "Review code" }),
    ]);

    const index = generateSkillIndex(map);

    expect("$schema" in index).toBe(false);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]).toEqual({
      frontmatter: { name: "code-review", description: "Review code" },
      url: "skill://code-review/SKILL.md",
      digest: "sha256:" + "0".repeat(64),
    });
  });

  it("copies the full frontmatter block verbatim", () => {
    const map = makeSkillMap([
      makeSkill({
        name: "refunds",
        skillPath: "refunds",
        description: "Refunds",
        frontmatter: {
          name: "refunds",
          description: "Refunds",
          license: "Apache-2.0",
          metadata: { team: "billing" },
        },
      }),
    ]);

    const index = generateSkillIndex(map);
    expect(index.skills[0].frontmatter).toEqual({
      name: "refunds",
      description: "Refunds",
      license: "Apache-2.0",
      metadata: { team: "billing" },
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
    expect(index.skills[0].frontmatter.name).toBe("refunds");
    expect(index.skills[1].url).toBe("skill://acme/onboarding/SKILL.md");
    expect(index.skills[1].frontmatter.name).toBe("onboarding");
  });

  it("returns empty skills array for empty map", () => {
    const index = generateSkillIndex(new Map());
    expect("$schema" in index).toBe(false);
    expect(index.skills).toEqual([]);
  });

  it("every entry carries frontmatter, url, and a sha256 digest", () => {
    const map = makeSkillMap([
      makeSkill({ name: "a", skillPath: "a", description: "A" }),
      makeSkill({ name: "b", skillPath: "x/b", description: "B" }),
    ]);

    const index = generateSkillIndex(map);
    for (const entry of index.skills) {
      expect(entry.frontmatter).toBeTypeOf("object");
      expect(typeof entry.url).toBe("string");
      expect(entry.digest).toMatch(SHA256_RE);
      expect("type" in entry).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex (client-side)
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex", () => {
  it("parses a valid index into SkillSummary array", async () => {
    const client = mockClientWithIndex({
      skills: [
        skillMdEntry("code-review", "skill://code-review/SKILL.md", "Review code"),
        skillMdEntry("refunds", "skill://acme/billing/refunds/SKILL.md", "Refunds"),
      ],
    });

    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(2);
    expect(skills![0]).toMatchObject({
      name: "code-review",
      skillPath: "code-review",
      uri: "skill://code-review/SKILL.md",
      type: "skill-md",
      description: "Review code",
      mimeType: "text/markdown",
      digest: "sha256:" + "a".repeat(64),
    });
    expect(skills![1]).toMatchObject({
      name: "refunds",
      skillPath: "acme/billing/refunds",
      uri: "skill://acme/billing/refunds/SKILL.md",
      type: "skill-md",
      description: "Refunds",
    });
  });

  it("skips entries with neither url nor archives", async () => {
    const client = mockClientWithIndex({
      skills: [
        skillMdEntry("good", "skill://good/SKILL.md", "Good"),
        { frontmatter: { name: "orphan", description: "No way to fetch me" } },
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
    const client = mockClientWithIndex({});
    const skills = await listSkillsFromIndex(client);
    expect(skills).toBeNull();
  });

  it("reads from the correct well-known URI", async () => {
    const readResource = vi.fn().mockResolvedValue({
      contents: [{ text: JSON.stringify({ skills: [] }) }],
    });
    const client: SkillsClient = { listResources: vi.fn(), readResource };

    await listSkillsFromIndex(client);

    expect(readResource).toHaveBeenCalledWith({ uri: "skill://index.json" });
  });
});

// ---------------------------------------------------------------------------
// generateSkillIndex with archive declarations
// ---------------------------------------------------------------------------

describe("generateSkillIndex with archives", () => {
  it("emits a per-skill archives array with url, mimeType, and digest", () => {
    const p = writeArchive("pdf-processing.tar.gz");
    const index = generateSkillIndex(new Map(), {
      archives: [
        {
          name: "pdf-processing",
          description: "Extract and assemble PDFs",
          skillPath: "pdf-processing",
          archivePath: p,
        },
      ],
    });

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].frontmatter).toEqual({
      name: "pdf-processing",
      description: "Extract and assemble PDFs",
    });
    expect(index.skills[0].url).toBeUndefined();
    expect(index.skills[0].archives).toHaveLength(1);
    expect(index.skills[0].archives![0]).toEqual({
      url: "skill://pdf-processing.tar.gz",
      mimeType: "application/gzip",
      digest: sha256Digest(fs.readFileSync(p)),
    });
  });

  it("uses the declaration's verbatim frontmatter when provided", () => {
    const p = writeArchive("refunds.tar.gz");
    const index = generateSkillIndex(new Map(), {
      archives: [
        {
          name: "refunds",
          description: "Refunds",
          skillPath: "refunds",
          archivePath: p,
          frontmatter: { name: "refunds", description: "Refunds", license: "MIT" },
        },
      ],
    });
    expect(index.skills[0].frontmatter).toEqual({
      name: "refunds",
      description: "Refunds",
      license: "MIT",
    });
  });

  it("derives URL suffix and mimeType from archivePath extension", () => {
    const px = writeArchive("x.zip");
    const py = writeArchive("y.tgz");
    const index = generateSkillIndex(new Map(), {
      archives: [
        { name: "x", description: "X", skillPath: "x", archivePath: px },
        { name: "y", description: "Y", skillPath: "y", archivePath: py },
      ],
    });

    expect(index.skills[0].archives![0].url).toBe("skill://x.zip");
    expect(index.skills[0].archives![0].mimeType).toBe("application/zip");
    expect(index.skills[1].archives![0].url).toBe("skill://y.tar.gz");
    expect(index.skills[1].archives![0].mimeType).toBe("application/gzip");
  });

  it("respects explicit format override", () => {
    const p = writeArchive("x.bundle");
    const index = generateSkillIndex(new Map(), {
      archives: [
        { name: "x", description: "X", skillPath: "x", archivePath: p, format: "zip" },
      ],
    });

    expect(index.skills[0].archives![0].url).toBe("skill://x.zip");
    expect(index.skills[0].archives![0].mimeType).toBe("application/zip");
  });

  it("preserves multi-segment skillPath in the archive URL", () => {
    const p = writeArchive("refunds-multi.tar.gz");
    const index = generateSkillIndex(new Map(), {
      archives: [
        {
          name: "refunds",
          description: "Refunds",
          skillPath: "acme/billing/refunds",
          archivePath: p,
        },
      ],
    });

    expect(index.skills[0].archives![0].url).toBe(
      "skill://acme/billing/refunds.tar.gz",
    );
  });

  it("rejects archive whose skillPath final segment != name", () => {
    expect(() =>
      generateSkillIndex(new Map(), {
        archives: [
          {
            name: "wrong-name",
            description: "X",
            skillPath: "acme/billing/refunds",
            archivePath: archivePath("never-read.tar.gz"),
          },
        ],
      }),
    ).toThrow(/final segment "refunds" does not match name "wrong-name"/);
  });

  it("emits both skill-md and archive entries in one index", () => {
    const p = writeArchive("b.tar.gz");
    const map = makeSkillMap([
      makeSkill({ name: "a", skillPath: "a", description: "A" }),
    ]);

    const index = generateSkillIndex(map, {
      archives: [
        { name: "b", description: "B", skillPath: "b", archivePath: p },
      ],
    });

    expect(index.skills).toHaveLength(2);
    // skill-md entry: url + digest, no archives
    expect(index.skills[0].url).toBe("skill://a/SKILL.md");
    expect(index.skills[0].archives).toBeUndefined();
    // archive entry: archives, no url
    expect(index.skills[1].url).toBeUndefined();
    expect(index.skills[1].archives).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex with archive entries
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex with archives", () => {
  it("returns archive entries with type set", async () => {
    const client = mockClientWithIndex({
      skills: [archiveEntry("pdf-processing", "skill://pdf-processing.tar.gz", "PDFs")],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(1);
    expect(skills![0]).toMatchObject({
      name: "pdf-processing",
      skillPath: "pdf-processing",
      uri: "skill://pdf-processing.tar.gz",
      type: "archive",
      description: "PDFs",
      mimeType: "application/gzip",
      digest: "sha256:" + "b".repeat(64),
    });
    expect(skills![0].archives).toHaveLength(1);
  });

  it("derives skillPath by stripping archive suffix", async () => {
    const client = mockClientWithIndex({
      skills: [
        archiveEntry(
          "refunds",
          "skill://acme/billing/refunds.zip",
          "Refunds",
          "application/zip",
        ),
      ],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills![0].skillPath).toBe("acme/billing/refunds");
    expect(skills![0].mimeType).toBe("application/zip");
  });

  it("returns mixed skill-md and archive entries", async () => {
    const client = mockClientWithIndex({
      skills: [
        skillMdEntry("a", "skill://a/SKILL.md", "A"),
        archiveEntry("b", "skill://b.tar.gz", "B"),
      ],
    });

    const skills = await listSkillsFromIndex(client);
    expect(skills).toHaveLength(2);
    expect(skills!.map((s) => s.type)).toEqual(["skill-md", "archive"]);
  });
});

// ---------------------------------------------------------------------------
// listSkillsFromIndex with non-skill:// URI schemes
// ---------------------------------------------------------------------------

describe("listSkillsFromIndex with non-skill:// URI schemes", () => {
  it("handles entries with any URI scheme", async () => {
    const client = mockClientWithIndex({
      skills: [
        skillMdEntry(
          "copilot-sdk",
          "repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md",
          "Copilot SDK guide",
        ),
        skillMdEntry("code-review", "skill://code-review/SKILL.md", "Review code"),
        skillMdEntry(
          "deploy-guide",
          "github://acme/platform/skills/deploy-guide/SKILL.md",
          "Deployment guide",
        ),
      ],
    });

    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(3);

    const copilot = skills!.find((s) => s.name === "copilot-sdk")!;
    expect(copilot.uri).toBe("repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md");
    expect(copilot.skillPath).toBe("github/awesome-copilot/contents/skills/copilot-sdk");
    expect(copilot.description).toBe("Copilot SDK guide");

    const codeReview = skills!.find((s) => s.name === "code-review")!;
    expect(codeReview.uri).toBe("skill://code-review/SKILL.md");
    expect(codeReview.skillPath).toBe("code-review");

    const deploy = skills!.find((s) => s.name === "deploy-guide")!;
    expect(deploy.uri).toBe("github://acme/platform/skills/deploy-guide/SKILL.md");
    expect(deploy.skillPath).toBe("acme/platform/skills/deploy-guide");
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
    // digest round-trips
    expect(skills!.every((s) => SHA256_RE.test(s.digest ?? ""))).toBe(true);
  });

  it("round-trips an archive entry", async () => {
    const p = writeArchive("roundtrip.tar.gz");
    const index = generateSkillIndex(new Map(), {
      archives: [
        { name: "roundtrip", description: "RT", skillPath: "roundtrip", archivePath: p },
      ],
    });
    const client = mockClientWithIndex(index);
    const skills = await listSkillsFromIndex(client);

    expect(skills).toHaveLength(1);
    expect(skills![0]).toMatchObject({
      name: "roundtrip",
      skillPath: "roundtrip",
      uri: "skill://roundtrip.tar.gz",
      type: "archive",
      digest: sha256Digest(fs.readFileSync(p)),
    });
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
      skills: [skillMdEntry("code-review", "skill://code-review/SKILL.md", "Review code")],
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
        contents: [{ text: JSON.stringify({ skills: [] }) }],
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

  it("falls back when index has only malformed (unfetchable) entries", async () => {
    const client: SkillsClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{
          text: JSON.stringify({
            skills: [{ frontmatter: { name: "orphan", description: "No url/archives" } }],
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
            skills: [skillMdEntry("from-index", "skill://from-index/SKILL.md", "From index")],
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
      skills: [skillMdEntry("code-review", "skill://code-review/SKILL.md", "Review code")],
    });

    const result = await discoverAndBuildCatalog(client, { serverName: "my-server" });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("code-review");
    expect(result.catalog).toContain("<available_skills>");
    expect(result.catalog).toContain("`my-server`");
    expect(result.catalog).toContain("`read_resource`");
  });

  it("uses default toolName from READ_RESOURCE_TOOL", async () => {
    const client = mockClientWithIndex({
      skills: [skillMdEntry("a", "skill://a/SKILL.md", "A")],
    });

    const result = await discoverAndBuildCatalog(client, { serverName: "test-server" });
    expect(result.catalog).toContain("`read_resource`");
  });

  it("allows overriding toolName", async () => {
    const client = mockClientWithIndex({
      skills: [skillMdEntry("a", "skill://a/SKILL.md", "A")],
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

    const result = await discoverAndBuildCatalog(client, { serverName: "empty-server" });

    expect(result.skills).toEqual([]);
    expect(result.catalog).toBe("");
  });

  it("works without options entirely (serverName is optional)", async () => {
    const client = mockClientWithIndex({
      skills: [skillMdEntry("a", "skill://a/SKILL.md", "A")],
    });

    const result = await discoverAndBuildCatalog(client);

    expect(result.skills).toHaveLength(1);
    expect(result.catalog).not.toContain("with server");
    expect(result.catalog).toContain("with the skill's URI");
    expect(result.catalog).not.toContain("<server>");
  });

  it("threads serverInEntries through to the catalog", async () => {
    const client = mockClientWithIndex({
      skills: [skillMdEntry("a", "skill://a/SKILL.md", "A")],
    });

    const result = await discoverAndBuildCatalog(client, {
      serverName: "my-server",
      serverInEntries: true,
    });

    expect(result.catalog).toContain("<server>my-server</server>");
  });
});
