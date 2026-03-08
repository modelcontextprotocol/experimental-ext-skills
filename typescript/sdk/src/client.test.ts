import { describe, it, expect, vi } from "vitest";
import {
  listSkillResources,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "./client.js";
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

  it("parses dependencies from frontmatter", () => {
    const content = `---
name: with-deps
description: Has dependencies
dependencies: [server-a, server-b]
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "with-deps",
      description: "Has dependencies",
      dependencies: ["server-a", "server-b"],
    });
  });

  it("parses single dependency", () => {
    const content = `---
name: single-dep
description: One dependency
dependencies: [everything-server]
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result?.dependencies).toEqual(["everything-server"]);
  });

  it("parses quoted dependency values", () => {
    const content = `---
name: quoted-deps
description: Quoted deps
dependencies: ["server-a", 'server-b']
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result?.dependencies).toEqual(["server-a", "server-b"]);
  });

  it("returns undefined dependencies when field is absent", () => {
    const content = `---
name: no-deps
description: No dependencies
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result?.dependencies).toBeUndefined();
  });

  it("handles empty dependencies list", () => {
    const content = `---
name: empty-deps
description: Empty deps
dependencies: []
---
Body
`;
    const result = parseSkillFrontmatter(content);
    expect(result?.dependencies).toBeUndefined();
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

  it("includes dependencies in summary", () => {
    const skills: SkillSummary[] = [
      {
        name: "explore",
        uri: "skill://explore/SKILL.md",
        description: "Explore servers",
        dependencies: ["server-a", "server-b"],
      },
    ];

    const result = buildSkillsSummary(skills);
    expect(result).toContain("[requires: server-a, server-b]");
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

  it("parses dependencies from resource description", async () => {
    const mockClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://explore/SKILL.md",
            name: "explore",
            description:
              "Explore the Everything Server (requires: everything-server)",
            mimeType: "text/markdown",
          },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills).toHaveLength(1);
    expect(skills[0].dependencies).toEqual(["everything-server"]);
    expect(skills[0].description).toBe("Explore the Everything Server");
  });

  it("parses multiple dependencies from resource description", async () => {
    const mockClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://multi/SKILL.md",
            name: "multi",
            description: "Multi deps (requires: server-a, server-b)",
          },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills[0].dependencies).toEqual(["server-a", "server-b"]);
    expect(skills[0].description).toBe("Multi deps");
  });

  it("returns no dependencies when description has no requires suffix", async () => {
    const mockClient = {
      listResources: vi.fn().mockResolvedValue({
        resources: [
          {
            uri: "skill://simple/SKILL.md",
            name: "simple",
            description: "A simple skill",
          },
        ],
      }),
    };

    const skills = await listSkillResources(
      mockClient as unknown as Parameters<typeof listSkillResources>[0],
    );

    expect(skills[0].dependencies).toBeUndefined();
  });
});
