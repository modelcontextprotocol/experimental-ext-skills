import { describe, it, expect } from "vitest";
import {
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isIndexJsonUri,
  isValidSkillName,
  extractSkillPathFromUri,
  SKILL_URI_SCHEME,
  INDEX_JSON_URI,
} from "./uri.js";

// ---------------------------------------------------------------------------
// parseSkillUri
// ---------------------------------------------------------------------------

describe("parseSkillUri", () => {
  it("parses single-segment SKILL.md", () => {
    expect(parseSkillUri("skill://code-review/SKILL.md")).toEqual({
      skillPath: "code-review",
      filePath: "SKILL.md",
    });
  });

  it("parses multi-segment SKILL.md", () => {
    expect(parseSkillUri("skill://acme/billing/refunds/SKILL.md")).toEqual({
      skillPath: "acme/billing/refunds",
      filePath: "SKILL.md",
    });
  });

  it("handles case-insensitive skill.md", () => {
    const result = parseSkillUri("skill://my-skill/skill.md");
    expect(result).toEqual({ skillPath: "my-skill", filePath: "skill.md" });
  });

  it("returns null for non-skill URIs", () => {
    expect(parseSkillUri("https://example.com/foo")).toBeNull();
    expect(parseSkillUri("file:///tmp/SKILL.md")).toBeNull();
    expect(parseSkillUri("")).toBeNull();
  });

  it("returns null for the well-known index URI", () => {
    expect(parseSkillUri(INDEX_JSON_URI)).toBeNull();
  });

  it("returns null for bare scheme with no path", () => {
    expect(parseSkillUri("skill://")).toBeNull();
  });

  it("returns empty skillPath for arbitrary supporting files", () => {
    const result = parseSkillUri("skill://acme/billing/refunds/templates/email.md");
    expect(result).toEqual({
      skillPath: "",
      filePath: "acme/billing/refunds/templates/email.md",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSkillFileUri
// ---------------------------------------------------------------------------

describe("resolveSkillFileUri", () => {
  const knownPaths = ["code-review", "acme/billing/refunds", "acme/onboarding"];

  it("resolves supporting file with longest-prefix match", () => {
    expect(
      resolveSkillFileUri(
        "skill://acme/billing/refunds/templates/email.md",
        knownPaths,
      ),
    ).toEqual({
      skillPath: "acme/billing/refunds",
      filePath: "templates/email.md",
    });
  });

  it("resolves single-segment skill supporting file", () => {
    expect(
      resolveSkillFileUri(
        "skill://code-review/references/GUIDE.md",
        knownPaths,
      ),
    ).toEqual({
      skillPath: "code-review",
      filePath: "references/GUIDE.md",
    });
  });

  it("returns null for unknown skill path", () => {
    expect(
      resolveSkillFileUri("skill://unknown/foo.md", knownPaths),
    ).toBeNull();
  });

  it("returns null for non-skill URIs", () => {
    expect(resolveSkillFileUri("https://example.com", knownPaths)).toBeNull();
  });

  it("prefers longer prefix when paths overlap", () => {
    const paths = ["acme", "acme/billing", "acme/billing/refunds"];
    expect(
      resolveSkillFileUri(
        "skill://acme/billing/refunds/doc.md",
        paths,
      ),
    ).toEqual({
      skillPath: "acme/billing/refunds",
      filePath: "doc.md",
    });
  });
});

// ---------------------------------------------------------------------------
// buildSkillUri
// ---------------------------------------------------------------------------

describe("buildSkillUri", () => {
  it("defaults to SKILL.md", () => {
    expect(buildSkillUri("code-review")).toBe("skill://code-review/SKILL.md");
  });

  it("builds multi-segment SKILL.md URI", () => {
    expect(buildSkillUri("acme/billing/refunds")).toBe(
      "skill://acme/billing/refunds/SKILL.md",
    );
  });

  it("builds supporting file URI", () => {
    expect(buildSkillUri("code-review", "references/GUIDE.md")).toBe(
      "skill://code-review/references/GUIDE.md",
    );
  });
});

// ---------------------------------------------------------------------------
// Type-check helpers
// ---------------------------------------------------------------------------

describe("URI type checks", () => {
  it("isSkillContentUri identifies SKILL.md URIs", () => {
    expect(isSkillContentUri("skill://code-review/SKILL.md")).toBe(true);
    expect(isSkillContentUri("skill://acme/billing/refunds/SKILL.md")).toBe(true);
    expect(isSkillContentUri("skill://x/skill.md")).toBe(true);
    expect(isSkillContentUri("skill://code-review/references/foo.md")).toBe(false);
    expect(isSkillContentUri(INDEX_JSON_URI)).toBe(false);
  });

  it("isIndexJsonUri identifies index.json", () => {
    expect(isIndexJsonUri(INDEX_JSON_URI)).toBe(true);
    expect(isIndexJsonUri("skill://index.json/SKILL.md")).toBe(false);
    expect(isIndexJsonUri("skill://foo/index.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: build → parse
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// isValidSkillName (Agent Skills naming rule)
// ---------------------------------------------------------------------------

describe("isValidSkillName", () => {
  it("accepts lowercase letters, digits, and hyphens", () => {
    expect(isValidSkillName("git-workflow")).toBe(true);
    expect(isValidSkillName("refunds")).toBe(true);
    expect(isValidSkillName("v2-api")).toBe(true);
    expect(isValidSkillName("abc123")).toBe(true);
  });

  it("rejects uppercase, underscore, dot, slash, space", () => {
    expect(isValidSkillName("MyCoolSkill")).toBe(false);
    expect(isValidSkillName("git_workflow")).toBe(false);
    expect(isValidSkillName("foo.bar")).toBe(false);
    expect(isValidSkillName("foo/bar")).toBe(false);
    expect(isValidSkillName("foo bar")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSkillName("")).toBe(false);
  });

  it("rejects index.json (justifies the SEP reservation)", () => {
    expect(isValidSkillName("index.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractSkillPathFromUri (cross-scheme path extraction)
// ---------------------------------------------------------------------------

describe("extractSkillPathFromUri", () => {
  it("extracts path from skill:// URIs", () => {
    expect(extractSkillPathFromUri("skill://git-workflow/SKILL.md")).toBe(
      "git-workflow",
    );
    expect(
      extractSkillPathFromUri("skill://acme/billing/refunds/SKILL.md"),
    ).toBe("acme/billing/refunds");
  });

  it("extracts path from non-skill schemes (authority included)", () => {
    expect(
      extractSkillPathFromUri(
        "github://owner/repo/skills/refunds/SKILL.md",
      ),
    ).toBe("owner/repo/skills/refunds");
    expect(
      extractSkillPathFromUri(
        "repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md",
      ),
    ).toBe("github/awesome-copilot/contents/skills/copilot-sdk");
  });

  it("matches case-insensitively on the SKILL.md filename", () => {
    expect(extractSkillPathFromUri("skill://x/skill.md")).toBe("x");
    expect(extractSkillPathFromUri("skill://x/Skill.MD")).toBe("x");
  });

  it("returns null for URIs that don't end in SKILL.md", () => {
    expect(
      extractSkillPathFromUri("skill://x/references/GUIDE.md"),
    ).toBeNull();
    expect(extractSkillPathFromUri("skill://pdf-processing.tar.gz")).toBeNull();
  });

  it("returns null for non-URI strings", () => {
    expect(extractSkillPathFromUri("not-a-uri")).toBeNull();
    expect(extractSkillPathFromUri("")).toBeNull();
    expect(extractSkillPathFromUri("/just/a/path/SKILL.md")).toBeNull();
  });
});

describe("round-trip", () => {
  const paths = ["git-workflow", "acme/billing/refunds", "a/b/c/d"];

  for (const sp of paths) {
    it(`build → parse for "${sp}"`, () => {
      const uri = buildSkillUri(sp);
      const parsed = parseSkillUri(uri);
      expect(parsed).toEqual({ skillPath: sp, filePath: "SKILL.md" });
    });
  }

  it("scheme constant is correct", () => {
    expect(SKILL_URI_SCHEME).toBe("skill://");
  });
});
