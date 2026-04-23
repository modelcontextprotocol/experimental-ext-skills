import { describe, it, expect } from "vitest";
import { parseSkillFrontmatter, buildSkillsSummary, buildSkillsCatalog } from "./_client.js";
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

// ---------------------------------------------------------------------------
// buildSkillsCatalog
// ---------------------------------------------------------------------------

describe("buildSkillsCatalog", () => {
  const catalogOptions = { toolName: "ReadMcpResourceTool", serverName: "skills-server" };

  it("returns empty string for no skills", () => {
    expect(buildSkillsCatalog([], catalogOptions)).toBe("");
  });

  it("includes tool name and server name in behavioral instructions", () => {
    const skills: SkillSummary[] = [
      { name: "code-review", skillPath: "code-review", uri: "skill://code-review/SKILL.md", description: "Review code" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("`ReadMcpResourceTool`");
    expect(catalog).toContain("`skills-server`");
    expect(catalog).toContain("with server `skills-server`");
  });

  it("omits the server clause when serverName is not provided", () => {
    const skills: SkillSummary[] = [
      { name: "code-review", skillPath: "code-review", uri: "skill://code-review/SKILL.md", description: "Review code" },
    ];
    const catalog = buildSkillsCatalog(skills, { toolName: "read_skill" });
    expect(catalog).toContain("`read_skill`");
    expect(catalog).not.toContain("with server");
    expect(catalog).toContain("with the skill's URI");
  });

  it("includes XML skill entries with name, path, description, and uri", () => {
    const skills: SkillSummary[] = [
      { name: "code-review", skillPath: "code-review", uri: "skill://code-review/SKILL.md", description: "Review code" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("<available_skills>");
    expect(catalog).toContain("</available_skills>");
    expect(catalog).toContain("<name>code-review</name>");
    expect(catalog).toContain("<description>Review code</description>");
    expect(catalog).toContain("<uri>skill://code-review/SKILL.md</uri>");
  });

  it("includes multi-segment skill path", () => {
    const skills: SkillSummary[] = [
      { name: "refunds", skillPath: "acme/billing/refunds", uri: "skill://acme/billing/refunds/SKILL.md", description: "Process refunds" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("<path>acme/billing/refunds</path>");
    expect(catalog).toContain("<name>refunds</name>");
  });

  it("handles multiple skills", () => {
    const skills: SkillSummary[] = [
      { name: "code-review", skillPath: "code-review", uri: "skill://code-review/SKILL.md", description: "Review code" },
      { name: "refunds", skillPath: "acme/billing/refunds", uri: "skill://acme/billing/refunds/SKILL.md", description: "Process refunds" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("<name>code-review</name>");
    expect(catalog).toContain("<name>refunds</name>");
  });

  it("escapes XML special characters", () => {
    const skills: SkillSummary[] = [
      { name: "test&skill", skillPath: "test&skill", uri: "skill://test&skill/SKILL.md", description: "Uses <brackets> & ampersands" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("&amp;");
    expect(catalog).toContain("&lt;brackets&gt;");
    expect(catalog).not.toContain("<brackets>");
  });

  it("works with non-skill:// URI schemes", () => {
    const skills: SkillSummary[] = [
      { name: "copilot-sdk", skillPath: "copilot-sdk", uri: "repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md", description: "Copilot SDK" },
    ];
    const catalog = buildSkillsCatalog(skills, catalogOptions);
    expect(catalog).toContain("<uri>repo://github/awesome-copilot/contents/skills/copilot-sdk/SKILL.md</uri>");
    expect(catalog).toContain("<name>copilot-sdk</name>");
  });
});
