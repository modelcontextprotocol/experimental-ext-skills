import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillCatalog } from "./catalog.js";
import type { SkillDependencyRequest } from "./types.js";

// --- Mock client factory ---

function makeSkillContent(
  name: string,
  description: string,
  dependencies?: string[],
): string {
  const depsLine = dependencies
    ? `\ndependencies: [${dependencies.join(", ")}]`
    : "";
  return `---\nname: ${name}\ndescription: ${description}${depsLine}\n---\n# ${name}\nBody content for ${name}.`;
}

function makeMockClient(
  skills: Array<{
    name: string;
    description: string;
    dependencies?: string[];
  }>,
) {
  const resources = skills.map((s) => {
    const desc = s.dependencies
      ? `${s.description} (requires: ${s.dependencies.join(", ")})`
      : s.description;
    return {
      uri: `skill://${s.name}/SKILL.md`,
      name: s.name,
      description: desc,
      mimeType: "text/markdown",
    };
  });

  const contentMap = new Map<string, string>();
  for (const s of skills) {
    contentMap.set(
      `skill://${s.name}/SKILL.md`,
      makeSkillContent(s.name, s.description, s.dependencies),
    );
  }

  return {
    listResources: vi.fn().mockResolvedValue({ resources }),
    readResource: vi.fn().mockImplementation(({ uri }: { uri: string }) => {
      const text = contentMap.get(uri);
      if (!text) throw new Error(`Not found: ${uri}`);
      return Promise.resolve({ contents: [{ uri, text }] });
    }),
  };
}

type MockClient = ReturnType<typeof makeMockClient>;

// --- Tests ---

describe("SkillCatalog", () => {
  describe("constructor", () => {
    it("creates an empty catalog", () => {
      const catalog = new SkillCatalog();
      expect(catalog.skillNames).toEqual([]);
      expect(catalog.getSkillContexts()).toEqual([]);
      expect(catalog.onDependenciesRequired).toBeUndefined();
    });
  });

  describe("create factory", () => {
    it("creates a catalog pre-populated from a client", async () => {
      const client = makeMockClient([
        { name: "skill-a", description: "Skill A" },
        { name: "skill-b", description: "Skill B" },
      ]);

      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      expect(catalog.skillNames).toHaveLength(2);
      expect(catalog.skillNames).toContain("skill-a");
      expect(catalog.skillNames).toContain("skill-b");
    });
  });

  describe("addClient", () => {
    let catalog: SkillCatalog;

    beforeEach(() => {
      catalog = new SkillCatalog();
    });

    it("discovers skills and caches them", async () => {
      const client = makeMockClient([
        { name: "code-review", description: "Review code" },
      ]);

      await catalog.addClient(
        client as unknown as Parameters<typeof catalog.addClient>[0],
      );

      expect(catalog.skillNames).toEqual(["code-review"]);
      expect(client.listResources).toHaveBeenCalledTimes(1);
      expect(client.readResource).toHaveBeenCalledTimes(1);
    });

    it("discovers skills with dependencies", async () => {
      const client = makeMockClient([
        {
          name: "explore-everything",
          description: "Explore the Everything Server",
          dependencies: ["everything-server"],
        },
      ]);

      await catalog.addClient(
        client as unknown as Parameters<typeof catalog.addClient>[0],
      );

      expect(catalog.skillNames).toEqual(["explore-everything"]);
      const context = catalog.getSkillContext("explore-everything");
      expect(context).toContain("explore-everything");
      expect(context).toContain("requires: everything-server");
    });

    it("overwrites skill from a different client with same name", async () => {
      const client1 = makeMockClient([
        { name: "shared", description: "Version 1" },
      ]);
      const client2 = makeMockClient([
        { name: "shared", description: "Version 2" },
      ]);

      await catalog.addClient(
        client1 as unknown as Parameters<typeof catalog.addClient>[0],
      );
      await catalog.addClient(
        client2 as unknown as Parameters<typeof catalog.addClient>[0],
      );

      expect(catalog.skillNames).toEqual(["shared"]);
      const context = catalog.getSkillContext("shared");
      expect(context).toContain("Version 2");
    });

    it("adds skills from multiple clients", async () => {
      const client1 = makeMockClient([
        { name: "skill-a", description: "From client 1" },
      ]);
      const client2 = makeMockClient([
        { name: "skill-b", description: "From client 2" },
      ]);

      await catalog.addClient(
        client1 as unknown as Parameters<typeof catalog.addClient>[0],
      );
      await catalog.addClient(
        client2 as unknown as Parameters<typeof catalog.addClient>[0],
      );

      expect(catalog.skillNames).toHaveLength(2);
      expect(catalog.skillNames).toContain("skill-a");
      expect(catalog.skillNames).toContain("skill-b");
    });
  });

  describe("removeClient", () => {
    it("removes all skills from a specific client", async () => {
      const catalog = new SkillCatalog();
      const client1 = makeMockClient([
        { name: "skill-a", description: "From client 1" },
      ]);
      const client2 = makeMockClient([
        { name: "skill-b", description: "From client 2" },
      ]);

      await catalog.addClient(
        client1 as unknown as Parameters<typeof catalog.addClient>[0],
      );
      await catalog.addClient(
        client2 as unknown as Parameters<typeof catalog.addClient>[0],
      );

      catalog.removeClient(
        client1 as unknown as Parameters<typeof catalog.removeClient>[0],
      );

      expect(catalog.skillNames).toEqual(["skill-b"]);
    });

    it("is a no-op for unknown client", () => {
      const catalog = new SkillCatalog();
      const unknownClient = makeMockClient([]);

      // Should not throw
      catalog.removeClient(
        unknownClient as unknown as Parameters<typeof catalog.removeClient>[0],
      );
      expect(catalog.skillNames).toEqual([]);
    });
  });

  describe("getSkillContext", () => {
    it("returns context string for a known skill", async () => {
      const client = makeMockClient([
        { name: "code-review", description: "Review code" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      const context = catalog.getSkillContext("code-review");
      expect(context).toBe("[skill: code-review] Review code");
    });

    it("includes dependencies in context string", async () => {
      const client = makeMockClient([
        {
          name: "explore",
          description: "Explore servers",
          dependencies: ["server-a", "server-b"],
        },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      const context = catalog.getSkillContext("explore");
      expect(context).toBe(
        "[skill: explore] Explore servers (requires: server-a, server-b)",
      );
    });

    it("throws for unknown skill name", () => {
      const catalog = new SkillCatalog();
      expect(() => catalog.getSkillContext("nonexistent")).toThrow(
        "Skill 'nonexistent' not found in catalog.",
      );
    });
  });

  describe("getSkillContexts", () => {
    it("returns empty array for empty catalog", () => {
      const catalog = new SkillCatalog();
      expect(catalog.getSkillContexts()).toEqual([]);
    });

    it("returns all context strings", async () => {
      const client = makeMockClient([
        { name: "skill-a", description: "A" },
        { name: "skill-b", description: "B" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      const contexts = catalog.getSkillContexts();
      expect(contexts).toHaveLength(2);
      expect(contexts).toContain("[skill: skill-a] A");
      expect(contexts).toContain("[skill: skill-b] B");
    });
  });

  describe("custom context formatter", () => {
    it("uses a custom formatter when provided", async () => {
      const client = makeMockClient([
        { name: "my-skill", description: "My description" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
        (fm) => `CUSTOM: ${fm.name}`,
      );

      expect(catalog.getSkillContext("my-skill")).toBe("CUSTOM: my-skill");
    });
  });

  describe("loadSkill", () => {
    it("loads skill content from the originating client", async () => {
      const client = makeMockClient([
        { name: "code-review", description: "Review code" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      const content = await catalog.loadSkill("code-review");
      expect(content).toContain("name: code-review");
      expect(content).toContain("Body content for code-review.");
    });

    it("throws for unknown skill name", async () => {
      const catalog = new SkillCatalog();
      await expect(catalog.loadSkill("nonexistent")).rejects.toThrow(
        "Skill 'nonexistent' not found in catalog.",
      );
    });

    it("loads skill without dependencies and no callback", async () => {
      const client = makeMockClient([
        { name: "simple", description: "Simple skill" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      // No callback set, no dependencies — should work fine
      const content = await catalog.loadSkill("simple");
      expect(content).toContain("name: simple");
    });

    it("loads skill with dependencies silently when no callback set", async () => {
      const client = makeMockClient([
        {
          name: "has-deps",
          description: "Has deps",
          dependencies: ["some-server"],
        },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      // No callback — should load silently
      const content = await catalog.loadSkill("has-deps");
      expect(content).toContain("name: has-deps");
    });
  });

  describe("onDependenciesRequired callback", () => {
    let catalog: SkillCatalog;
    let client: MockClient;

    beforeEach(async () => {
      client = makeMockClient([
        {
          name: "with-deps",
          description: "Skill with deps",
          dependencies: ["server-a", "server-b"],
        },
        { name: "no-deps", description: "Skill without deps" },
      ]);
      catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );
    });

    it("fires callback when loading skill with dependencies", async () => {
      const callback = vi.fn().mockResolvedValue(true);
      catalog.onDependenciesRequired = callback;

      await catalog.loadSkill("with-deps");

      expect(callback).toHaveBeenCalledTimes(1);
      const request: SkillDependencyRequest = callback.mock.calls[0][0];
      expect(request.skillName).toBe("with-deps");
      expect(request.serverNames).toEqual(["server-a", "server-b"]);
    });

    it("does not fire callback for skill without dependencies", async () => {
      const callback = vi.fn().mockResolvedValue(true);
      catalog.onDependenciesRequired = callback;

      await catalog.loadSkill("no-deps");

      expect(callback).not.toHaveBeenCalled();
    });

    it("throws when callback returns false", async () => {
      catalog.onDependenciesRequired = vi.fn().mockResolvedValue(false);

      await expect(catalog.loadSkill("with-deps")).rejects.toThrow(
        "required MCP server dependencies could not be satisfied",
      );
    });

    it("succeeds when callback returns true", async () => {
      catalog.onDependenciesRequired = vi.fn().mockResolvedValue(true);

      const content = await catalog.loadSkill("with-deps");
      expect(content).toContain("name: with-deps");
    });

    it("can be set to undefined to disable", async () => {
      catalog.onDependenciesRequired = vi.fn().mockResolvedValue(true);
      catalog.onDependenciesRequired = undefined;

      // Should load silently without firing callback
      const content = await catalog.loadSkill("with-deps");
      expect(content).toContain("name: with-deps");
    });
  });

  describe("getLoadSkillToolDefinition", () => {
    it("returns correct schema for empty catalog", () => {
      const catalog = new SkillCatalog();
      const tool = catalog.getLoadSkillToolDefinition();

      expect(tool.name).toBe("load_skill");
      expect(tool.description).toContain("Available skills:");
      expect(tool.inputSchema).toEqual({
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: "The name of the skill to load",
            enum: [],
          },
        },
        required: ["skillName"],
      });
    });

    it("includes all skill names in enum", async () => {
      const client = makeMockClient([
        { name: "skill-a", description: "A" },
        { name: "skill-b", description: "B" },
      ]);
      const catalog = await SkillCatalog.create(
        client as unknown as Parameters<typeof SkillCatalog.create>[0],
      );

      const tool = catalog.getLoadSkillToolDefinition();
      expect(tool.description).toContain("skill-a, skill-b");
      const schema = tool.inputSchema as {
        properties: { skillName: { enum: string[] } };
      };
      expect(schema.properties.skillName.enum).toEqual([
        "skill-a",
        "skill-b",
      ]);
    });

    it("reflects current state after removeClient", async () => {
      const client1 = makeMockClient([
        { name: "skill-a", description: "A" },
      ]);
      const client2 = makeMockClient([
        { name: "skill-b", description: "B" },
      ]);
      const catalog = new SkillCatalog();
      await catalog.addClient(
        client1 as unknown as Parameters<typeof catalog.addClient>[0],
      );
      await catalog.addClient(
        client2 as unknown as Parameters<typeof catalog.addClient>[0],
      );

      catalog.removeClient(
        client1 as unknown as Parameters<typeof catalog.removeClient>[0],
      );

      const tool = catalog.getLoadSkillToolDefinition();
      const schema = tool.inputSchema as {
        properties: { skillName: { enum: string[] } };
      };
      expect(schema.properties.skillName.enum).toEqual(["skill-b"]);
    });
  });
});
