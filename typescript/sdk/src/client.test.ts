import { describe, it, expect } from "vitest";
import { parseSkillFrontmatter, buildSkillsSummary } from "./_client.js";
import type { SkillSummary } from "./types.js";

// ---------------------------------------------------------------------------
// parseSkillFrontmatter
// ---------------------------------------------------------------------------

describe("parseSkillFrontmatter", () => {
  it("extracts name and description", () => {
    const content = `---
name: code-review
description: Review code for quality
---
# Code Review
`;
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "code-review",
      description: "Review code for quality",
    });
  });

  it("strips quotes from values", () => {
    const content = `---
name: "my-skill"
description: 'A quoted description'
---
`;
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "my-skill",
      description: "A quoted description",
    });
  });

  it("returns empty description when missing", () => {
    const content = `---
name: minimal
---
`;
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "minimal",
      description: "",
    });
  });

  it("returns null when no frontmatter", () => {
    expect(parseSkillFrontmatter("# Just a heading")).toBeNull();
    expect(parseSkillFrontmatter("")).toBeNull();
  });

  it("returns null when frontmatter is not closed", () => {
    expect(parseSkillFrontmatter("---\nname: broken\n")).toBeNull();
  });

  it("returns null when name is missing", () => {
    const content = `---
description: no name here
---
`;
    expect(parseSkillFrontmatter(content)).toBeNull();
  });

  it("handles extra frontmatter fields gracefully", () => {
    const content = `---
name: full
description: Has extras
metadata:
  author: test
  version: "1.0"
---
`;
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "full",
      description: "Has extras",
    });
  });

  it("handles --- in body content", () => {
    const content = `---
name: tricky
description: Has dashes
---
# Heading

Some text with --- in it.
`;
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "tricky",
      description: "Has dashes",
    });
  });
});

// ---------------------------------------------------------------------------
// buildSkillsSummary
// ---------------------------------------------------------------------------

describe("buildSkillsSummary", () => {
  it("returns empty message for no skills", () => {
    expect(buildSkillsSummary([])).toBe("No skills available.");
  });

  it("formats single-segment skill", () => {
    const skills: SkillSummary[] = [
      { name: "code-review", skillPath: "code-review", uri: "skill://code-review/SKILL.md", description: "Review code" },
    ];
    const summary = buildSkillsSummary(skills);
    expect(summary).toContain("code-review");
    expect(summary).toContain("skill://code-review/SKILL.md");
    expect(summary).toContain("Review code");
    // No [path: ...] when name equals skillPath
    expect(summary).not.toContain("[path:");
  });

  it("shows path info when name differs from skillPath", () => {
    const skills: SkillSummary[] = [
      { name: "refunds", skillPath: "acme/billing/refunds", uri: "skill://acme/billing/refunds/SKILL.md", description: "Refunds" },
    ];
    const summary = buildSkillsSummary(skills);
    expect(summary).toContain("[path: acme/billing/refunds]");
  });

  it("handles skills without description", () => {
    const skills: SkillSummary[] = [
      { name: "bare", skillPath: "bare", uri: "skill://bare/SKILL.md" },
    ];
    const summary = buildSkillsSummary(skills);
    expect(summary).toContain("bare");
    expect(summary).not.toContain("undefined");
  });
});
