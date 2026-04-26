import { describe, it, expect } from "vitest";
import {
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isSkillManifestUri,
  isPromptXmlUri,
  isIndexJsonUri,
  SKILL_URI_SCHEME,
  INDEX_JSON_URI,
  PROMPT_XML_URI,
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

  it("parses _manifest URIs", () => {
    expect(parseSkillUri("skill://acme/billing/refunds/_manifest")).toEqual({
      skillPath: "acme/billing/refunds",
      filePath: "_manifest",
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

  it("returns null for reserved well-known URIs", () => {
    expect(parseSkillUri(PROMPT_XML_URI)).toBeNull();
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

  it("builds manifest URI", () => {
    expect(buildSkillUri("code-review", "_manifest")).toBe(
      "skill://code-review/_manifest",
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
    expect(isSkillContentUri("skill://code-review/_manifest")).toBe(false);
    expect(isSkillContentUri(INDEX_JSON_URI)).toBe(false);
  });

  it("isSkillManifestUri identifies _manifest URIs", () => {
    expect(isSkillManifestUri("skill://code-review/_manifest")).toBe(true);
    expect(isSkillManifestUri("skill://code-review/SKILL.md")).toBe(false);
  });

  it("isPromptXmlUri identifies prompt-xml", () => {
    expect(isPromptXmlUri(PROMPT_XML_URI)).toBe(true);
    expect(isPromptXmlUri("skill://prompt-xml/SKILL.md")).toBe(false);
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

describe("round-trip", () => {
  const paths = ["git-workflow", "acme/billing/refunds", "a/b/c/d"];

  for (const sp of paths) {
    it(`build → parse for "${sp}"`, () => {
      const uri = buildSkillUri(sp);
      const parsed = parseSkillUri(uri);
      expect(parsed).toEqual({ skillPath: sp, filePath: "SKILL.md" });
    });

    it(`build(_manifest) → parse for "${sp}"`, () => {
      const uri = buildSkillUri(sp, "_manifest");
      const parsed = parseSkillUri(uri);
      expect(parsed).toEqual({ skillPath: sp, filePath: "_manifest" });
    });
  }
});
