import { describe, it, expect } from "vitest";
import {
  parseSkillUri,
  buildSkillUri,
  isSkillContentUri,
  isSkillManifestUri,
  SKILL_FILENAME,
  MANIFEST_PATH,
} from "./uri.js";

describe("parseSkillUri", () => {
  it("parses a SKILL.md URI", () => {
    const result = parseSkillUri("skill://code-review/SKILL.md");
    expect(result).toEqual({ name: "code-review", path: "SKILL.md" });
  });

  it("parses a manifest URI", () => {
    const result = parseSkillUri("skill://test-writer/_manifest");
    expect(result).toEqual({ name: "test-writer", path: "_manifest" });
  });

  it("parses a nested path URI", () => {
    const result = parseSkillUri(
      "skill://my-skill/references/REFERENCE.md",
    );
    expect(result).toEqual({
      name: "my-skill",
      path: "references/REFERENCE.md",
    });
  });

  it("returns null for non-skill URIs", () => {
    expect(parseSkillUri("https://example.com")).toBeNull();
    expect(parseSkillUri("file:///tmp/test")).toBeNull();
    expect(parseSkillUri("")).toBeNull();
  });

  it("returns null for skill:// without a path", () => {
    expect(parseSkillUri("skill://code-review")).toBeNull();
  });

  it("returns null for skill://prompt-xml (no path segment)", () => {
    expect(parseSkillUri("skill://prompt-xml")).toBeNull();
  });
});

describe("buildSkillUri", () => {
  it("builds a SKILL.md URI by default", () => {
    expect(buildSkillUri("code-review")).toBe(
      "skill://code-review/SKILL.md",
    );
  });

  it("builds a URI with custom path", () => {
    expect(buildSkillUri("my-skill", "_manifest")).toBe(
      "skill://my-skill/_manifest",
    );
  });

  it("builds a URI with nested path", () => {
    expect(buildSkillUri("my-skill", "refs/doc.md")).toBe(
      "skill://my-skill/refs/doc.md",
    );
  });
});

describe("isSkillContentUri", () => {
  it("returns true for SKILL.md URIs", () => {
    expect(isSkillContentUri("skill://code-review/SKILL.md")).toBe(true);
  });

  it("returns false for manifest URIs", () => {
    expect(isSkillContentUri("skill://code-review/_manifest")).toBe(false);
  });

  it("returns false for non-skill URIs", () => {
    expect(isSkillContentUri("https://example.com")).toBe(false);
  });
});

describe("isSkillManifestUri", () => {
  it("returns true for manifest URIs", () => {
    expect(isSkillManifestUri("skill://code-review/_manifest")).toBe(true);
  });

  it("returns false for SKILL.md URIs", () => {
    expect(isSkillManifestUri("skill://code-review/SKILL.md")).toBe(false);
  });

  it("returns false for non-skill URIs", () => {
    expect(isSkillManifestUri("https://example.com")).toBe(false);
  });
});

describe("constants", () => {
  it("exports SKILL_FILENAME", () => {
    expect(SKILL_FILENAME).toBe("SKILL.md");
  });

  it("exports MANIFEST_PATH", () => {
    expect(MANIFEST_PATH).toBe("_manifest");
  });
});
