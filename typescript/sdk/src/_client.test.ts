import { describe, it, expect, vi } from "vitest";
import {
  listSkills,
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
    expect(parseSkillFrontmatter(content)).toEqual({
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
    expect(parseSkillFrontmatter(content)).toEqual({
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
    expect(parseSkillFrontmatter(content)).toEqual({
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

  it("ignores additional frontmatter fields", () => {
    const content = `---
name: extended
description: Extended skill
version: 1.0
author: Test
---
Body
`;
    expect(parseSkillFrontmatter(content)).toEqual({
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
        skillPath: "code-review",
        name: "code-review",
        uri: "skill://code-review/SKILL.md",
        description: "Review code",
      },
      {
        skillPath: "acme/billing/refunds",
        name: "refunds",
        uri: "skill://acme/billing/refunds/SKILL.md",
        description: "Process refunds",
      },
    ];

    const result = buildSkillsSummary(skills);
    expect(result).toContain("Available skills:");
    expect(result).toContain(
      "- code-review (skill://code-review/SKILL.md): Review code",
    );
    expect(result).toContain(
      "- refunds (skill://acme/billing/refunds/SKILL.md): Process refunds",
    );
  });

  it("builds summary without descriptions", () => {
    const skills: SkillSummary[] = [
      {
        skillPath: "basic",
        name: "basic",
        uri: "skill://basic/SKILL.md",
      },
    ];
    const result = buildSkillsSummary(skills);
    const lines = result.split("\n");
    expect(lines[1]).toBe("- basic (skill://basic/SKILL.md)");
  });
});

describe("listSkills", () => {
  it("reads skill://index.json and returns skill-md entries", async () => {
    const indexJson = {
      $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      skills: [
        {
          type: "skill-md",
          name: "code-review",
          description: "Review code",
          url: "skill://code-review/SKILL.md",
        },
        {
          type: "skill-md",
          name: "refunds",
          description: "Process refunds",
          url: "skill://acme/billing/refunds/SKILL.md",
        },
        {
          type: "mcp-resource-template",
          description: "Per-product docs",
          url: "skill://docs/{product}/SKILL.md",
        },
      ],
    };

    const mockClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [
          {
            uri: "skill://index.json",
            mimeType: "application/json",
            text: JSON.stringify(indexJson),
          },
        ],
      }),
      listResources: vi.fn(),
    };

    const skills = await listSkills(
      mockClient as unknown as Parameters<typeof listSkills>[0],
    );

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      skillPath: "code-review",
      name: "code-review",
      uri: "skill://code-review/SKILL.md",
      description: "Review code",
    });
    expect(skills[1]).toMatchObject({
      skillPath: "acme/billing/refunds",
      name: "refunds",
      uri: "skill://acme/billing/refunds/SKILL.md",
      description: "Process refunds",
    });
    expect(mockClient.listResources).not.toHaveBeenCalled();
  });

  it("falls back to resources/list when index is unavailable", async () => {
    const mockClient = {
      readResource: vi.fn().mockRejectedValue(new Error("not found")),
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://code-review/SKILL.md",
            name: "code-review",
            description: "Review code",
            mimeType: "text/markdown",
          },
          {
            uri: "https://example.com/other",
            name: "not-a-skill",
          },
        ],
      }),
    };

    const skills = await listSkills(
      mockClient as unknown as Parameters<typeof listSkills>[0],
    );

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      skillPath: "code-review",
      name: "code-review",
      uri: "skill://code-review/SKILL.md",
    });
    expect(mockClient.listResources).toHaveBeenCalledTimes(1);
  });
});

describe("listSkillResources (fallback)", () => {
  it("filters resources/list for SKILL.md URIs", async () => {
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
            uri: "skill://acme/billing/refunds/SKILL.md",
            name: "refunds",
            description: "Process refunds",
          },
          {
            uri: "skill://code-review/refs/doc.md",
            name: "doc",
          },
          {
            uri: "skill://index.json",
            name: "index",
          },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.skillPath).sort()).toEqual([
      "acme/billing/refunds",
      "code-review",
    ]);
  });

  it("handles pagination", async () => {
    const mockClient = {
      listResources: vi
        .fn()
        .mockResolvedValueOnce({
          resources: [{ uri: "skill://skill-a/SKILL.md", name: "skill-a" }],
          nextCursor: "page2",
        })
        .mockResolvedValueOnce({
          resources: [{ uri: "skill://skill-b/SKILL.md", name: "skill-b" }],
        }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(2);
    expect(skills[0].skillPath).toBe("skill-a");
    expect(skills[1].skillPath).toBe("skill-b");
    expect(mockClient.listResources).toHaveBeenCalledTimes(2);
    expect(mockClient.listResources).toHaveBeenCalledWith({ cursor: "page2" });
  });
});
