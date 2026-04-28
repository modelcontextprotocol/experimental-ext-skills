import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { gunzipSync } from "node:zlib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  discoverSkills,
  loadSkillContent,
  loadDocument,
  isPathWithinBase,
  scanDocuments,
  generateSkillIndex,
  registerSkillResources,
  registerSkillArchive,
  registerSkillTemplate,
  SKILL_INDEX_SCHEMA,
} from "./_server.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-sdk-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createSkillAt(
  relPath: string,
  description: string,
  extraFrontmatter = "",
  extraContent = "",
): string {
  const skillDir = path.join(tmpDir, relPath);
  fs.mkdirSync(skillDir, { recursive: true });
  const name = relPath.split(/[\\/]/).filter(Boolean).pop()!;
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n${extraFrontmatter}---\n# ${name}\n${extraContent}`,
  );
  return skillDir;
}

describe("discoverSkills", () => {
  it("discovers single-segment skills", () => {
    createSkillAt("code-review", "Review code");
    createSkillAt("test-writer", "Write tests");

    const skills = discoverSkills(tmpDir);

    expect(skills.size).toBe(2);
    expect(skills.has("code-review")).toBe(true);
    expect(skills.has("test-writer")).toBe(true);

    const codeReview = skills.get("code-review")!;
    expect(codeReview.name).toBe("code-review");
    expect(codeReview.skillPath).toBe("code-review");
    expect(codeReview.description).toBe("Review code");
  });

  it("discovers nested multi-segment skills (SEP-2640)", () => {
    createSkillAt("acme/billing/refunds", "Refund processing");
    createSkillAt("acme/support/tickets", "Ticket triage");

    const skills = discoverSkills(tmpDir);

    expect(skills.size).toBe(2);
    expect(skills.has("acme/billing/refunds")).toBe(true);
    expect(skills.has("acme/support/tickets")).toBe(true);

    const refunds = skills.get("acme/billing/refunds")!;
    expect(refunds.name).toBe("refunds");
    expect(refunds.skillPath).toBe("acme/billing/refunds");
  });

  it("rejects skills with names violating Agent Skills naming rules", () => {
    // Uppercase letters
    const dir1 = path.join(tmpDir, "BadName");
    fs.mkdirSync(dir1);
    fs.writeFileSync(
      path.join(dir1, "SKILL.md"),
      "---\nname: BadName\ndescription: caps\n---\n",
    );

    // Underscore
    const dir2 = path.join(tmpDir, "with_underscore");
    fs.mkdirSync(dir2);
    fs.writeFileSync(
      path.join(dir2, "SKILL.md"),
      "---\nname: with_underscore\ndescription: bad\n---\n",
    );

    // Starts with digit
    const dir3 = path.join(tmpDir, "9-leading-digit");
    fs.mkdirSync(dir3);
    fs.writeFileSync(
      path.join(dir3, "SKILL.md"),
      "---\nname: 9-leading-digit\ndescription: bad\n---\n",
    );

    expect(discoverSkills(tmpDir).size).toBe(0);
  });

  it("rejects skills whose name does not match the final path segment", () => {
    const skillDir = path.join(tmpDir, "wrong-name");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: actually-different\ndescription: Mismatch\n---\n# x",
    );

    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it("does not nest skills inside skills (SEP-2640: SKILL.md MUST NOT appear in any descendant)", () => {
    createSkillAt("outer", "Outer skill");
    createSkillAt("outer/inner", "Inner skill (should be ignored)");

    const skills = discoverSkills(tmpDir);

    expect(skills.size).toBe(1);
    expect(skills.has("outer")).toBe(true);
    expect(skills.has("outer/inner")).toBe(false);
  });

  it("returns empty map for non-existent directory", () => {
    expect(discoverSkills("/nonexistent/path").size).toBe(0);
  });

  it("returns empty map for empty directory", () => {
    expect(discoverSkills(tmpDir).size).toBe(0);
  });

  it("skips directories without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, "no-skill"));
    fs.writeFileSync(path.join(tmpDir, "no-skill", "README.md"), "# Hello");
    expect(discoverSkills(tmpDir).size).toBe(0);
  });

  it("skips skills with missing name", () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\ndescription: No name\n---\n# Bad",
    );
    expect(discoverSkills(tmpDir).size).toBe(0);
  });

  it("skips skills with missing description", () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: bad\n---\n# Bad",
    );
    expect(discoverSkills(tmpDir).size).toBe(0);
  });

  it("accepts lowercase skill.md", () => {
    const skillDir = path.join(tmpDir, "lower");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "skill.md"),
      "---\nname: lower\ndescription: Lowercase skill file\n---\n# Lower",
    );

    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(1);
    expect(skills.has("lower")).toBe(true);
  });

  it("discovers supplementary documents", () => {
    const skillDir = createSkillAt("with-docs", "Has docs");

    const refsDir = path.join(skillDir, "references");
    fs.mkdirSync(refsDir);
    fs.writeFileSync(path.join(refsDir, "REFERENCE.md"), "# Reference");
    fs.writeFileSync(path.join(skillDir, "config.json"), '{"key": "value"}');

    const skill = discoverSkills(tmpDir).get("with-docs")!;

    expect(skill.documents.length).toBe(2);
    const docPaths = skill.documents.map((d) => d.path).sort();
    expect(docPaths).toContain("config.json");
    expect(docPaths).toContain("references/REFERENCE.md");
  });

  it("captures extra frontmatter as string-valued metadata", () => {
    createSkillAt(
      "meta-skill",
      "Has metadata",
      "version: '1.0'\nauthor: test\n",
    );

    const skill = discoverSkills(tmpDir).get("meta-skill")!;
    expect(skill.metadata).toEqual({ author: "test", version: "1.0" });
  });

  it("skips dotfile and node_modules directories during discovery", () => {
    fs.mkdirSync(path.join(tmpDir, ".hidden", "skill"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".hidden", "skill", "SKILL.md"),
      "---\nname: skill\ndescription: hidden\n---\n",
    );
    fs.mkdirSync(path.join(tmpDir, "node_modules", "skill"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "skill", "SKILL.md"),
      "---\nname: skill\ndescription: deps\n---\n",
    );

    expect(discoverSkills(tmpDir).size).toBe(0);
  });
});

describe("generateSkillIndex", () => {
  it("emits the SEP-2640 discovery format", () => {
    createSkillAt("code-review", "Review code");
    createSkillAt("acme/billing/refunds", "Process refunds");

    const skills = discoverSkills(tmpDir);
    const index = generateSkillIndex(skills);

    expect(index.$schema).toBe(SKILL_INDEX_SCHEMA);
    expect(index.skills).toHaveLength(2);

    const refunds = index.skills.find((s) => "name" in s && s.name === "refunds");
    expect(refunds).toMatchObject({
      type: "skill-md",
      name: "refunds",
      description: "Process refunds",
      url: "skill://acme/billing/refunds/SKILL.md",
    });
  });

  it("includes extra entries when provided", () => {
    createSkillAt("foo", "Foo");
    const index = generateSkillIndex(discoverSkills(tmpDir), {
      extraEntries: [
        {
          type: "mcp-resource-template",
          description: "Per-product docs",
          url: "skill://docs/{product}/SKILL.md",
        },
      ],
    });
    expect(index.skills).toHaveLength(2);
    expect(index.skills.find((s) => s.type === "mcp-resource-template")).toBeDefined();
  });
});

describe("loadSkillContent", () => {
  it("loads a SKILL.md file", () => {
    createSkillAt("test-skill", "Test");
    const skillPath = path.join(tmpDir, "test-skill", "SKILL.md");

    const content = loadSkillContent(skillPath, tmpDir);
    expect(content).toContain("name: test-skill");
    expect(content).toContain("# test-skill");
  });

  it("rejects non-.md files", () => {
    fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello");
    expect(() => loadSkillContent(path.join(tmpDir, "test.txt"), tmpDir)).toThrow(
      "Only .md files can be read",
    );
  });
});

describe("loadDocument", () => {
  it("loads a text document", () => {
    const skillDir = createSkillAt("doc-skill", "Has docs");
    fs.writeFileSync(path.join(skillDir, "notes.txt"), "Some notes");

    const skill = discoverSkills(tmpDir).get("doc-skill")!;
    const result = loadDocument(skill, "notes.txt", tmpDir, true);
    expect(result).toHaveProperty("text", "Some notes");
  });

  it("loads a binary document as base64", () => {
    const skillDir = createSkillAt("bin-skill", "Has binary");
    fs.writeFileSync(path.join(skillDir, "data.bin"), Buffer.from([1, 2, 3]));

    const skill = discoverSkills(tmpDir).get("bin-skill")!;
    const result = loadDocument(skill, "data.bin", tmpDir, false);
    expect(result).toHaveProperty("blob");
    expect(Buffer.from((result as { blob: string }).blob, "base64")).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("rejects path traversal", () => {
    createSkillAt("safe-skill", "Safe");
    const skill = discoverSkills(tmpDir).get("safe-skill")!;
    expect(() => loadDocument(skill, "../../../etc/passwd", tmpDir, true)).toThrow(
      "Path traversal not allowed",
    );
  });

  it("rejects absolute paths", () => {
    createSkillAt("safe-skill", "Safe");
    const skill = discoverSkills(tmpDir).get("safe-skill")!;
    expect(() => loadDocument(skill, "/etc/passwd", tmpDir, true)).toThrow(
      "Absolute paths not allowed",
    );
  });
});

describe("isPathWithinBase", () => {
  it("returns true for paths within base", () => {
    const target = path.join(tmpDir, "subdir", "file.txt");
    fs.mkdirSync(path.join(tmpDir, "subdir"), { recursive: true });
    fs.writeFileSync(target, "test");
    expect(isPathWithinBase(target, tmpDir)).toBe(true);
  });

  it("returns true for the base directory itself", () => {
    expect(isPathWithinBase(tmpDir, tmpDir)).toBe(true);
  });

  it("handles non-existent paths with fallback", () => {
    const target = path.join(tmpDir, "nonexistent", "file.txt");
    expect(isPathWithinBase(target, tmpDir)).toBe(true);
  });
});

/* -------------------- end-to-end with InMemoryTransport -------------------- */

function makeServer(): McpServer {
  return new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { resources: {} } },
  );
}

async function connect(server: McpServer): Promise<Client> {
  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe("registerSkillArchive", () => {
  it("serves a tar.gz archive at skill://<skillPath>.tar.gz", async () => {
    const skillDir = path.join(tmpDir, "code-review");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\ndescription: Review code\n---\n# CR",
    );
    fs.writeFileSync(path.join(skillDir, "notes.txt"), "Some notes");

    const skillMap = discoverSkills(tmpDir);
    const skill = skillMap.get("code-review")!;

    const server = makeServer();
    const { uri, entry } = registerSkillArchive(server, skill, tmpDir);
    const client = await connect(server);

    expect(uri).toBe("skill://code-review.tar.gz");
    expect(entry).toEqual({
      type: "archive",
      name: "code-review",
      description: "Review code",
      url: "skill://code-review.tar.gz",
    });

    const result = await client.readResource({ uri });
    const content = result.contents[0];
    expect(content.mimeType).toBe("application/gzip");
    expect("blob" in content).toBe(true);

    const tar = gunzipSync(Buffer.from((content as { blob: string }).blob, "base64"));
    // First 512 bytes should be a USTAR header for SKILL.md
    expect(tar.subarray(0, 9).toString("utf8")).toBe("SKILL.md\0");
    expect(tar.subarray(257, 263).toString("ascii")).toBe("ustar\0");

    await client.close();
    await server.close();
  });

  it("uses skill path as the archive URI for nested skills", () => {
    fs.mkdirSync(path.join(tmpDir, "acme", "billing", "refunds"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "acme", "billing", "refunds", "SKILL.md"),
      "---\nname: refunds\ndescription: Refunds\n---\n",
    );

    const skill = discoverSkills(tmpDir).get("acme/billing/refunds")!;
    // Don't register yet — just compute. Use a throwaway server.
    const stubServer = new McpServer(
      { name: "stub", version: "0.0.0" },
      { capabilities: { resources: {} } },
    );
    const result = registerSkillArchive(stubServer, skill, tmpDir);
    expect(result.uri).toBe("skill://acme/billing/refunds.tar.gz");
  });

  it("rejects unsupported formats", () => {
    fs.mkdirSync(path.join(tmpDir, "foo"));
    fs.writeFileSync(
      path.join(tmpDir, "foo", "SKILL.md"),
      "---\nname: foo\ndescription: Foo\n---\n",
    );
    const skill = discoverSkills(tmpDir).get("foo")!;
    const stubServer = new McpServer(
      { name: "stub", version: "0.0.0" },
      { capabilities: { resources: {} } },
    );
    expect(() =>
      // @ts-expect-error testing runtime guard for unsupported format
      registerSkillArchive(stubServer, skill, tmpDir, { format: "zip" }),
    ).toThrow(/Unsupported archive format/);
  });
});

describe("registerSkillTemplate", () => {
  it("registers a resource template and resolves matching URIs", async () => {
    const server = makeServer();
    const { entry } = registerSkillTemplate(server, {
      description: "Per-product docs skill",
      uriTemplate: "skill://docs/{product}/SKILL.md",
      resolve: async ({ variables }) => {
        const product = Array.isArray(variables.product)
          ? variables.product[0]
          : variables.product;
        return {
          contents: [
            {
              uri: `skill://docs/${String(product)}/SKILL.md`,
              mimeType: "text/markdown",
              text: `---\nname: ${String(product)}\ndescription: ${String(product)} docs\n---\n# ${String(product)}`,
            },
          ],
        };
      },
    });

    expect(entry).toEqual({
      type: "mcp-resource-template",
      description: "Per-product docs skill",
      url: "skill://docs/{product}/SKILL.md",
    });

    const client = await connect(server);
    const result = await client.readResource({
      uri: "skill://docs/widget/SKILL.md",
    });
    expect(result.contents[0]).toMatchObject({
      uri: "skill://docs/widget/SKILL.md",
      mimeType: "text/markdown",
    });
    expect((result.contents[0] as { text: string }).text).toContain(
      "name: widget",
    );

    await client.close();
    await server.close();
  });
});

describe("registerSkillResources extraIndexEntries", () => {
  it("merges extra entries (archive + template) into skill://index.json", async () => {
    const skillDir = path.join(tmpDir, "code-review");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\ndescription: Review code\n---\n",
    );
    const skillMap = discoverSkills(tmpDir);

    const server = makeServer();

    const archiveEntries: Array<ReturnType<typeof registerSkillArchive>["entry"]> = [];
    const templateEntries: Array<ReturnType<typeof registerSkillTemplate>["entry"]> = [];

    registerSkillResources(server, skillMap, tmpDir, {
      extraIndexEntries: () => [...archiveEntries, ...templateEntries],
    });

    archiveEntries.push(
      registerSkillArchive(server, skillMap.get("code-review")!, tmpDir).entry,
    );
    templateEntries.push(
      registerSkillTemplate(server, {
        description: "Per-product docs",
        uriTemplate: "skill://docs/{product}/SKILL.md",
        resolve: async () => ({ contents: [] }),
      }).entry,
    );

    const client = await connect(server);
    const result = await client.readResource({ uri: "skill://index.json" });
    const index = JSON.parse((result.contents[0] as { text: string }).text);

    expect(index.skills).toHaveLength(3);
    expect(index.skills.map((s: { type: string }) => s.type).sort()).toEqual([
      "archive",
      "mcp-resource-template",
      "skill-md",
    ]);

    await client.close();
    await server.close();
  });
});

describe("scanDocuments", () => {
  it("scans files excluding SKILL.md", () => {
    const skillDir = path.join(tmpDir, "scan-test");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: scan-test\ndescription: x\n---\n",
    );
    fs.writeFileSync(path.join(skillDir, "extra.md"), "# Extra");
    fs.writeFileSync(path.join(skillDir, "data.json"), "{}");

    const docs = scanDocuments(skillDir, tmpDir);
    const paths = docs.map((d) => d.path).sort();

    expect(paths).toEqual(["data.json", "extra.md"]);
    expect(docs.find((d) => d.path === "data.json")!.mimeType).toBe(
      "application/json",
    );
  });

  it("scans subdirectories recursively", () => {
    const skillDir = path.join(tmpDir, "recursive-test");
    fs.mkdirSync(path.join(skillDir, "sub", "deep"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: recursive-test\ndescription: x\n---\n",
    );
    fs.writeFileSync(path.join(skillDir, "sub", "file.txt"), "hello");
    fs.writeFileSync(
      path.join(skillDir, "sub", "deep", "nested.md"),
      "# Nested",
    );

    const docs = scanDocuments(skillDir, tmpDir);
    const paths = docs.map((d) => d.path).sort();

    expect(paths).toEqual(["sub/deep/nested.md", "sub/file.txt"]);
  });

  it("returns empty for non-existent directory", () => {
    expect(scanDocuments("/nonexistent", tmpDir)).toEqual([]);
  });
});
