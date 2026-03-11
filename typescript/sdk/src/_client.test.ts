import { describe, it, expect, vi } from "vitest";
import {
  listSkillResources,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "./_client.js";
import type { SkillSummary } from "./types.js";

describe("parseSkillFrontmatter", () => {
  it("parses name and description from frontmatter", () => {
    const content = `---
name: code-review
description: Perform structured code reviews
---
# Code Review Skill
`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "code-review",
      description: "Perform structured code reviews",
    });
  });

  it("handles quoted values", () => {
    const content = `---
name: "my-skill"
description: 'A skill with quotes'
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "my-skill",
      description: "A skill with quotes",
    });
  });

  it("returns empty description if missing", () => {
    const content = `---
name: minimal-skill
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "minimal-skill",
      description: "",
    });
  });

  it("returns null if no frontmatter delimiter", () => {
    expect(parseSkillFrontmatter("# Just a heading")).toBeNull();
  });

  it("returns null if frontmatter not closed", () => {
    expect(parseSkillFrontmatter("---\nname: test\n")).toBeNull();
  });

  it("returns null if name is missing", () => {
    const content = `---
description: no name here
---
Body
`;
    expect(parseSkillFrontmatter(content)).toBeNull();
  });

  it("handles additional frontmatter fields", () => {
    const content = `---
name: extended
description: Extended skill
version: 1.0
author: Test
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "extended",
      description: "Extended skill",
    });
  });
});

describe("buildSkillsSummary", () => {
  it("returns message for empty array", () => {
    expect(buildSkillsSummary([])).toBe("No skills available.");
  });

  it("builds summary with descriptions", () => {
    const skills: SkillSummary[] = [
      {
        name: "code-review",
        uri: "skill://code-review/SKILL.md",
        description: "Review code",
      },
      {
        name: "test-writer",
        uri: "skill://test-writer/SKILL.md",
        description: "Write tests",
      },
    ];

    const result = buildSkillsSummary(skills);
    expect(result).toContain("Available skills:");
    expect(result).toContain(
      "- code-review (skill://code-review/SKILL.md): Review code",
    );
    expect(result).toContain(
      "- test-writer (skill://test-writer/SKILL.md): Write tests",
    );
  });

  it("builds summary without descriptions", () => {
    const skills: SkillSummary[] = [
      { name: "basic", uri: "skill://basic/SKILL.md" },
    ];

    const result = buildSkillsSummary(skills);
    const lines = result.split("\n");
    // The skill line should NOT end with ": description" — just the URI
    expect(lines[1]).toBe("- basic (skill://basic/SKILL.md)");
  });
});

describe("listSkillResources", () => {
  it("lists skill resources from a mock client", async () => {
    const mockClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://code-review/SKILL.md",
            name: "code-review",
            description: "Review code",
            mimeType: "text/markdown",
          },
          {
            uri: "skill://code-review/_manifest",
            name: "code-review-manifest",
            mimeType: "application/json",
          },
          {
            uri: "skill://test-writer/SKILL.md",
            name: "test-writer",
            description: "Write tests",
          },
          {
            uri: "https://example.com/other",
            name: "not-a-skill",
          },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: "code-review",
      uri: "skill://code-review/SKILL.md",
      description: "Review code",
      mimeType: "text/markdown",
    });
    expect(skills[1]).toEqual({
      name: "test-writer",
      uri: "skill://test-writer/SKILL.md",
      description: "Write tests",
      mimeType: undefined,
    });
  });

  it("handles pagination", async () => {
    const mockClient = {
      listResources: vi
        .fn()
        .mockResolvedValueOnce({
          resources: [
            {
              uri: "skill://skill-a/SKILL.md",
              name: "skill-a",
            },
          ],
          nextCursor: "page2",
        })
        .mockResolvedValueOnce({
          resources: [
            {
              uri: "skill://skill-b/SKILL.md",
              name: "skill-b",
            },
          ],
        }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe("skill-a");
    expect(skills[1].name).toBe("skill-b");
    expect(mockClient.listResources).toHaveBeenCalledTimes(2);
    expect(mockClient.listResources).toHaveBeenCalledWith({ cursor: "page2" });
  });

  it("returns empty array when no skills found", async () => {
    const mockClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          { uri: "https://example.com/other", name: "not-a-skill" },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(0);
  });
});
