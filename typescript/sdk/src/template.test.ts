import { describe, it, expect, vi } from "vitest";
import {
  extractTemplateVariables,
  expandTemplate,
  isSkillTemplate,
  isSkillManifestTemplate,
  detectSkillNameVariable,
  listSkillTemplates,
  completeTemplateArg,
  discoverSkillsFromTemplate,
  loadSkillFromTemplate,
  resolveManifestFiles,
  discoverAllSkillsFromTemplates,
} from "./template.js";
import type { SkillTemplate, SkillManifestWithUris } from "./template.js";

describe("extractTemplateVariables", () => {
  it("extracts Level 1 variables", () => {
    const vars = extractTemplateVariables(
      "skill://{owner}/{repo}/{skill_name}/SKILL.md",
    );
    expect(vars).toEqual(["owner", "repo", "skill_name"]);
  });

  it("extracts Level 2 reserved expansion variables", () => {
    const vars = extractTemplateVariables("skill://{name}/{+path}");
    expect(vars).toEqual(["name", "path"]);
  });

  it("handles explode modifier", () => {
    const vars = extractTemplateVariables("skill://{name*}/SKILL.md");
    expect(vars).toEqual(["name"]);
  });

  it("handles prefix modifier", () => {
    const vars = extractTemplateVariables("skill://{name:3}/SKILL.md");
    expect(vars).toEqual(["name"]);
  });

  it("handles comma-separated variables", () => {
    const vars = extractTemplateVariables("skill://{owner,repo}/SKILL.md");
    expect(vars).toEqual(["owner", "repo"]);
  });

  it("deduplicates variables", () => {
    const vars = extractTemplateVariables(
      "skill://{name}/SKILL.md?v={name}",
    );
    expect(vars).toEqual(["name"]);
  });

  it("returns empty array for no variables", () => {
    const vars = extractTemplateVariables("skill://static/SKILL.md");
    expect(vars).toEqual([]);
  });

  it("handles fragment expansion operator", () => {
    const vars = extractTemplateVariables("skill://{name}/{#section}");
    expect(vars).toEqual(["name", "section"]);
  });
});

describe("expandTemplate", () => {
  it("expands Level 1 variables with percent-encoding", () => {
    const result = expandTemplate(
      "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      { owner: "github", repo: "awesome-copilot", skill_name: "copilot-sdk" },
    );
    expect(result).toBe("skill://github/awesome-copilot/copilot-sdk/SKILL.md");
  });

  it("expands Level 2 reserved variables without encoding", () => {
    const result = expandTemplate("skill://{name}/{+path}", {
      name: "code-review",
      path: "references/REFERENCE.md",
    });
    expect(result).toBe("skill://code-review/references/REFERENCE.md");
  });

  it("percent-encodes special characters in Level 1", () => {
    const result = expandTemplate("skill://{name}/SKILL.md", {
      name: "my skill",
    });
    expect(result).toBe("skill://my%20skill/SKILL.md");
  });

  it("does not encode reserved chars in Level 2", () => {
    const result = expandTemplate("skill://{+path}", {
      path: "a/b/c",
    });
    expect(result).toBe("skill://a/b/c");
  });

  it("replaces missing variables with empty string", () => {
    const result = expandTemplate("skill://{owner}/{repo}/SKILL.md", {
      owner: "github",
    });
    expect(result).toBe("skill://github//SKILL.md");
  });

  it("handles fragment expansion", () => {
    const result = expandTemplate("skill://test/{#section}", {
      section: "overview",
    });
    expect(result).toBe("skill://test/#overview");
  });
});

describe("isSkillTemplate", () => {
  it("returns true for skill content templates", () => {
    expect(
      isSkillTemplate("skill://{owner}/{repo}/{skill_name}/SKILL.md"),
    ).toBe(true);
  });

  it("returns true for simple skill templates", () => {
    expect(isSkillTemplate("skill://{name}/SKILL.md")).toBe(true);
  });

  it("returns false for non-skill URIs", () => {
    expect(isSkillTemplate("https://example.com/{name}/SKILL.md")).toBe(false);
  });

  it("returns false for manifest templates", () => {
    expect(
      isSkillTemplate("skill://{owner}/{repo}/{skill_name}/_manifest"),
    ).toBe(false);
  });

  it("returns false for templates without SKILL.md", () => {
    expect(isSkillTemplate("skill://{name}/{+path}")).toBe(false);
  });
});

describe("isSkillManifestTemplate", () => {
  it("returns true for manifest templates", () => {
    expect(
      isSkillManifestTemplate(
        "skill://{owner}/{repo}/{skill_name}/_manifest",
      ),
    ).toBe(true);
  });

  it("returns false for content templates", () => {
    expect(
      isSkillManifestTemplate(
        "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      ),
    ).toBe(false);
  });

  it("returns false for non-skill URIs", () => {
    expect(isSkillManifestTemplate("https://example.com/_manifest")).toBe(
      false,
    );
  });
});

describe("detectSkillNameVariable", () => {
  it("detects skill_name", () => {
    expect(detectSkillNameVariable(["owner", "repo", "skill_name"])).toBe(
      "skill_name",
    );
  });

  it("detects skillName", () => {
    expect(detectSkillNameVariable(["skillName", "path"])).toBe("skillName");
  });

  it("detects name", () => {
    expect(detectSkillNameVariable(["name", "path"])).toBe("name");
  });

  it("detects skill", () => {
    expect(detectSkillNameVariable(["owner", "skill"])).toBe("skill");
  });

  it("returns undefined when no match", () => {
    expect(detectSkillNameVariable(["owner", "repo", "path"])).toBeUndefined();
  });
});

describe("listSkillTemplates", () => {
  it("filters skill content and manifest templates from resource templates", async () => {
    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          {
            uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
            name: "skill-content",
            description: "Skill content",
          },
          {
            uriTemplate: "skill://{owner}/{repo}/{skill_name}/_manifest",
            name: "skill-manifest",
            description: "Skill manifest",
          },
          {
            uriTemplate: "repo://{owner}/{repo}/contents/{+path}",
            name: "repo-content",
            description: "Repository file content",
          },
        ],
      }),
    };

    const result = await listSkillTemplates(
      mockClient as unknown as Parameters<typeof listSkillTemplates>[0],
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].uriTemplate).toBe(
      "skill://{owner}/{repo}/{skill_name}/SKILL.md",
    );
    expect(result.content[0].variables).toEqual([
      "owner",
      "repo",
      "skill_name",
    ]);
    expect(result.content[0].skillNameVariable).toBe("skill_name");

    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].uriTemplate).toBe(
      "skill://{owner}/{repo}/{skill_name}/_manifest",
    );
  });

  it("handles pagination", async () => {
    const mockClient = {
      listResourceTemplates: vi
        .fn()
        .mockResolvedValueOnce({
          resourceTemplates: [
            {
              uriTemplate: "skill://{name}/SKILL.md",
              name: "skill-a",
            },
          ],
          nextCursor: "page2",
        })
        .mockResolvedValueOnce({
          resourceTemplates: [
            {
              uriTemplate: "skill://{skillName}/_manifest",
              name: "manifest-a",
            },
          ],
        }),
    };

    const result = await listSkillTemplates(
      mockClient as unknown as Parameters<typeof listSkillTemplates>[0],
    );

    expect(result.content).toHaveLength(1);
    expect(result.manifest).toHaveLength(1);
    expect(mockClient.listResourceTemplates).toHaveBeenCalledTimes(2);
  });

  it("returns empty arrays when no skill templates found", async () => {
    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          {
            uriTemplate: "repo://{owner}/{repo}/contents/{+path}",
            name: "repo-content",
          },
        ],
      }),
    };

    const result = await listSkillTemplates(
      mockClient as unknown as Parameters<typeof listSkillTemplates>[0],
    );

    expect(result.content).toHaveLength(0);
    expect(result.manifest).toHaveLength(0);
  });
});

describe("completeTemplateArg", () => {
  it("calls client.complete with correct parameters", async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["copilot-sdk", "git-workflow"], hasMore: false },
      }),
    };

    const values = await completeTemplateArg(
      mockClient as unknown as Parameters<typeof completeTemplateArg>[0],
      "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      "skill_name",
      "",
      { owner: "github", repo: "awesome-copilot" },
    );

    expect(values).toEqual(["copilot-sdk", "git-workflow"]);
    expect(mockClient.complete).toHaveBeenCalledWith({
      ref: {
        type: "ref/resource",
        uri: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      },
      argument: { name: "skill_name", value: "" },
      context: {
        arguments: { owner: "github", repo: "awesome-copilot" },
      },
    });
  });

  it("works without context", async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["code-review"], hasMore: false },
      }),
    };

    const values = await completeTemplateArg(
      mockClient as unknown as Parameters<typeof completeTemplateArg>[0],
      "skill://{name}/SKILL.md",
      "name",
      "co",
    );

    expect(values).toEqual(["code-review"]);
    expect(mockClient.complete).toHaveBeenCalledWith({
      ref: { type: "ref/resource", uri: "skill://{name}/SKILL.md" },
      argument: { name: "name", value: "co" },
    });
  });
});

describe("discoverSkillsFromTemplate", () => {
  it("discovers skills via completions", async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["copilot-sdk", "git-workflow"], hasMore: false },
      }),
    };

    const template: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      name: "skill-content",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const skills = await discoverSkillsFromTemplate(
      mockClient as unknown as Parameters<
        typeof discoverSkillsFromTemplate
      >[0],
      template,
      { owner: "github", repo: "awesome-copilot" },
    );

    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: "copilot-sdk",
      uri: "skill://github/awesome-copilot/copilot-sdk/SKILL.md",
      description: undefined,
      mimeType: "text/markdown",
    });
    expect(skills[1]).toEqual({
      name: "git-workflow",
      uri: "skill://github/awesome-copilot/git-workflow/SKILL.md",
      description: undefined,
      mimeType: "text/markdown",
    });
  });

  it("throws when no skill name variable detected", async () => {
    const mockClient = {} as Parameters<typeof discoverSkillsFromTemplate>[0];
    const template: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{path}/SKILL.md",
      name: "skill-content",
      variables: ["owner", "repo", "path"],
      skillNameVariable: undefined,
    };

    await expect(
      discoverSkillsFromTemplate(mockClient, template, {}),
    ).rejects.toThrow("no skill name variable detected");
  });
});

describe("loadSkillFromTemplate", () => {
  it("loads skill content from template", async () => {
    const mockClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [
          {
            uri: "skill://github/repo/my-skill/SKILL.md",
            text: "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill",
          },
        ],
      }),
    };

    const template: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      name: "skill-content",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const result = await loadSkillFromTemplate(
      mockClient as unknown as Parameters<typeof loadSkillFromTemplate>[0],
      template,
      { owner: "github", repo: "repo", skill_name: "my-skill" },
    );

    expect(result.content).toContain("# My Skill");
    expect(result.frontmatter).toEqual({
      name: "my-skill",
      description: "A test skill",
    });
    expect(result.manifest).toBeUndefined();
  });

  it("loads skill content and manifest", async () => {
    const manifest: SkillManifestWithUris = {
      skill: "my-skill",
      files: [
        {
          path: "SKILL.md",
          uri: "repo://github/repo/contents/skills/my-skill/SKILL.md",
          size: 100,
        },
      ],
    };

    const mockClient = {
      readResource: vi
        .fn()
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://github/repo/my-skill/SKILL.md",
              text: "---\nname: my-skill\ndescription: Test\n---\n# Content",
            },
          ],
        })
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://github/repo/my-skill/_manifest",
              text: JSON.stringify(manifest),
            },
          ],
        }),
    };

    const contentTemplate: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      name: "skill-content",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const manifestTemplate: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/_manifest",
      name: "skill-manifest",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const result = await loadSkillFromTemplate(
      mockClient as unknown as Parameters<typeof loadSkillFromTemplate>[0],
      contentTemplate,
      { owner: "github", repo: "repo", skill_name: "my-skill" },
      manifestTemplate,
    );

    expect(result.manifest).toEqual(manifest);
    expect(mockClient.readResource).toHaveBeenCalledTimes(2);
  });

  it("continues without manifest on error", async () => {
    const mockClient = {
      readResource: vi
        .fn()
        .mockResolvedValueOnce({
          contents: [
            { uri: "skill://x/y/z/SKILL.md", text: "---\nname: z\ndescription: t\n---\nBody" },
          ],
        })
        .mockRejectedValueOnce(new Error("Not found")),
    };

    const template: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
      name: "skill-content",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const manifestTemplate: SkillTemplate = {
      uriTemplate: "skill://{owner}/{repo}/{skill_name}/_manifest",
      name: "skill-manifest",
      variables: ["owner", "repo", "skill_name"],
      skillNameVariable: "skill_name",
    };

    const result = await loadSkillFromTemplate(
      mockClient as unknown as Parameters<typeof loadSkillFromTemplate>[0],
      template,
      { owner: "x", repo: "y", skill_name: "z" },
      manifestTemplate,
    );

    expect(result.content).toContain("Body");
    expect(result.manifest).toBeUndefined();
  });
});

describe("resolveManifestFiles", () => {
  it("resolves all files from manifest URIs", async () => {
    const manifest: SkillManifestWithUris = {
      skill: "my-skill",
      files: [
        {
          path: "SKILL.md",
          uri: "repo://owner/repo/contents/skills/my-skill/SKILL.md",
        },
        {
          path: "references/GUIDE.md",
          uri: "repo://owner/repo/contents/skills/my-skill/references/GUIDE.md",
        },
      ],
    };

    const mockClient = {
      readResource: vi
        .fn()
        .mockResolvedValueOnce({
          contents: [{ uri: manifest.files[0].uri, text: "# Skill content" }],
        })
        .mockResolvedValueOnce({
          contents: [
            { uri: manifest.files[1].uri, text: "# Reference guide" },
          ],
        }),
    };

    const files = await resolveManifestFiles(
      mockClient as unknown as Parameters<typeof resolveManifestFiles>[0],
      manifest,
    );

    expect(files.size).toBe(2);
    expect(files.get("SKILL.md")).toBe("# Skill content");
    expect(files.get("references/GUIDE.md")).toBe("# Reference guide");
  });

  it("handles blob content", async () => {
    const manifest: SkillManifestWithUris = {
      skill: "my-skill",
      files: [
        { path: "image.png", uri: "repo://owner/repo/contents/image.png" },
      ],
    };

    const mockClient = {
      readResource: vi.fn().mockResolvedValue({
        contents: [{ uri: manifest.files[0].uri, blob: "base64data" }],
      }),
    };

    const files = await resolveManifestFiles(
      mockClient as unknown as Parameters<typeof resolveManifestFiles>[0],
      manifest,
    );

    expect(files.get("image.png")).toBe("base64data");
  });

  it("skips files that fail to load", async () => {
    const manifest: SkillManifestWithUris = {
      skill: "my-skill",
      files: [
        { path: "SKILL.md", uri: "repo://owner/repo/contents/SKILL.md" },
        { path: "missing.md", uri: "repo://owner/repo/contents/missing.md" },
      ],
    };

    const mockClient = {
      readResource: vi
        .fn()
        .mockResolvedValueOnce({
          contents: [{ uri: manifest.files[0].uri, text: "# Content" }],
        })
        .mockRejectedValueOnce(new Error("Not found")),
    };

    const files = await resolveManifestFiles(
      mockClient as unknown as Parameters<typeof resolveManifestFiles>[0],
      manifest,
    );

    expect(files.size).toBe(1);
    expect(files.get("SKILL.md")).toBe("# Content");
  });
});

describe("discoverAllSkillsFromTemplates", () => {
  it("discovers and loads all skills in one call", async () => {
    const manifest: SkillManifestWithUris = {
      skill: "code-review",
      files: [
        { path: "SKILL.md", uri: "repo://org/repo/contents/code-review/SKILL.md" },
      ],
    };

    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          {
            uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
            name: "skill-content",
            description: "Skill content",
          },
          {
            uriTemplate: "skill://{owner}/{repo}/{skill_name}/_manifest",
            name: "skill-manifest",
            description: "Skill manifest",
          },
        ],
      }),
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["code-review", "git-workflow"], hasMore: false },
      }),
      readResource: vi
        .fn()
        // code-review SKILL.md
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://org/repo/code-review/SKILL.md",
              text: "---\nname: code-review\ndescription: Review code\n---\n# Code Review",
            },
          ],
        })
        // code-review _manifest
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://org/repo/code-review/_manifest",
              text: JSON.stringify(manifest),
            },
          ],
        })
        // git-workflow SKILL.md
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://org/repo/git-workflow/SKILL.md",
              text: "---\nname: git-workflow\ndescription: Git workflows\n---\n# Git Workflow",
            },
          ],
        })
        // git-workflow _manifest
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://org/repo/git-workflow/_manifest",
              text: JSON.stringify({ skill: "git-workflow", files: [] }),
            },
          ],
        }),
    };

    const loaded = await discoverAllSkillsFromTemplates(
      mockClient as unknown as Parameters<typeof discoverAllSkillsFromTemplates>[0],
      { owner: "org", repo: "repo" },
    );

    expect(loaded).toHaveLength(2);

    expect(loaded[0].name).toBe("code-review");
    expect(loaded[0].uri).toBe("skill://org/repo/code-review/SKILL.md");
    expect(loaded[0].content).toContain("# Code Review");
    expect(loaded[0].frontmatter).toEqual({
      name: "code-review",
      description: "Review code",
    });
    expect(loaded[0].manifest).toEqual(manifest);

    expect(loaded[1].name).toBe("git-workflow");
    expect(loaded[1].uri).toBe("skill://org/repo/git-workflow/SKILL.md");
    expect(loaded[1].frontmatter?.description).toBe("Git workflows");
  });

  it("returns empty array when no skill templates found", async () => {
    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          { uriTemplate: "repo://{owner}/{repo}/{+path}", name: "repo" },
        ],
      }),
    };

    const loaded = await discoverAllSkillsFromTemplates(
      mockClient as unknown as Parameters<typeof discoverAllSkillsFromTemplates>[0],
      {},
    );

    expect(loaded).toHaveLength(0);
  });

  it("skips skills that fail to load", async () => {
    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          {
            uriTemplate: "skill://{owner}/{repo}/{skill_name}/SKILL.md",
            name: "skill-content",
          },
        ],
      }),
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["good-skill", "bad-skill"], hasMore: false },
      }),
      readResource: vi
        .fn()
        // good-skill loads fine
        .mockResolvedValueOnce({
          contents: [
            {
              uri: "skill://o/r/good-skill/SKILL.md",
              text: "---\nname: good-skill\ndescription: Works\n---\n# Good",
            },
          ],
        })
        // bad-skill fails
        .mockRejectedValueOnce(new Error("Server error")),
    };

    const loaded = await discoverAllSkillsFromTemplates(
      mockClient as unknown as Parameters<typeof discoverAllSkillsFromTemplates>[0],
      { owner: "o", repo: "r" },
    );

    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("good-skill");
  });

  it("uses frontmatter name over completion name when available", async () => {
    const mockClient = {
      listResourceTemplates: vi.fn().mockResolvedValue({
        resourceTemplates: [
          {
            uriTemplate: "skill://{name}/SKILL.md",
            name: "skill-content",
          },
        ],
      }),
      complete: vi.fn().mockResolvedValue({
        completion: { values: ["my-skill"], hasMore: false },
      }),
      readResource: vi.fn().mockResolvedValue({
        contents: [
          {
            uri: "skill://my-skill/SKILL.md",
            text: "---\nname: My Better Name\ndescription: desc\n---\n# Content",
          },
        ],
      }),
    };

    const loaded = await discoverAllSkillsFromTemplates(
      mockClient as unknown as Parameters<typeof discoverAllSkillsFromTemplates>[0],
      {},
    );

    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("My Better Name");
  });
});
