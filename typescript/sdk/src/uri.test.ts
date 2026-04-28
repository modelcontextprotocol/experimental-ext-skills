import { describe, it, expect } from "vitest";
import {
  parseSkillContentUri,
  buildSkillUri,
  buildSkillContentUri,
  extractSkillName,
  isSkillContentUri,
  isSkillIndexUri,
  SKILL_FILENAME,
  SKILL_INDEX_URI,
} from "./uri.js";

describe("parseSkillContentUri", () => {
  it("parses a single-segment skill URI", () => {
    expect(parseSkillContentUri("skill://code-review/SKILL.md")).toEqual({
      skillPath: "code-review",
      name: "code-review",
    });
  });

  it("parses a multi-segment skill URI per SEP-2640", () => {
    expect(
      parseSkillContentUri("skill://acme/billing/refunds/SKILL.md"),
    ).toEqual({
      skillPath: "acme/billing/refunds",
      name: "refunds",
    });
  });

  it("returns null for non-SKILL.md URIs", () => {
    expect(parseSkillContentUri("skill://my-skill/refs/doc.md")).toBeNull();
    expect(parseSkillContentUri("skill://index.json")).toBeNull();
  });

  it("returns null for non-skill schemes", () => {
    expect(parseSkillContentUri("https://example.com/SKILL.md")).toBeNull();
    expect(parseSkillContentUri("file:///tmp/SKILL.md")).toBeNull();
    expect(parseSkillContentUri("")).toBeNull();
  });

  it("returns null when there is no skill path", () => {
    expect(parseSkillContentUri("skill:///SKILL.md")).toBeNull();
  });
});

describe("buildSkillUri", () => {
  it("defaults to SKILL.md", () => {
    expect(buildSkillUri("code-review")).toBe("skill://code-review/SKILL.md");
  });

  it("joins a custom file path", () => {
    expect(buildSkillUri("my-skill", "refs/doc.md")).toBe(
      "skill://my-skill/refs/doc.md",
    );
  });

  it("supports multi-segment skill paths", () => {
    expect(buildSkillUri("acme/billing/refunds", "templates/email.md")).toBe(
      "skill://acme/billing/refunds/templates/email.md",
    );
  });
});

describe("buildSkillContentUri", () => {
  it("builds the SKILL.md URI", () => {
    expect(buildSkillContentUri("acme/billing/refunds")).toBe(
      "skill://acme/billing/refunds/SKILL.md",
    );
  });
});

describe("extractSkillName", () => {
  it("returns the final segment", () => {
    expect(extractSkillName("code-review")).toBe("code-review");
    expect(extractSkillName("acme/billing/refunds")).toBe("refunds");
  });

  it("ignores empty segments", () => {
    expect(extractSkillName("foo//bar")).toBe("bar");
    expect(extractSkillName("")).toBe("");
  });
});

describe("isSkillContentUri", () => {
  it("matches SKILL.md URIs at any depth", () => {
    expect(isSkillContentUri("skill://code-review/SKILL.md")).toBe(true);
    expect(isSkillContentUri("skill://acme/billing/refunds/SKILL.md")).toBe(
      true,
    );
  });

  it("rejects non-SKILL.md URIs", () => {
    expect(isSkillContentUri("skill://code-review/refs/doc.md")).toBe(false);
    expect(isSkillContentUri("skill://index.json")).toBe(false);
    expect(isSkillContentUri("https://example.com")).toBe(false);
  });
});

describe("isSkillIndexUri", () => {
  it("matches the well-known index URI", () => {
    expect(isSkillIndexUri("skill://index.json")).toBe(true);
  });

  it("rejects other URIs", () => {
    expect(isSkillIndexUri("skill://code-review/SKILL.md")).toBe(false);
    expect(isSkillIndexUri("skill://index.json/extra")).toBe(false);
  });
});

describe("constants", () => {
  it("exports SKILL_FILENAME", () => {
    expect(SKILL_FILENAME).toBe("SKILL.md");
  });

  it("exports SKILL_INDEX_URI", () => {
    expect(SKILL_INDEX_URI).toBe("skill://index.json");
  });
});
