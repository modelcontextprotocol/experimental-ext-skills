import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverSkills,
  loadSkillContent,
  loadDocument,
  isPathWithinBase,
  scanDocuments,
} from "./server.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-sdk-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createSkill(
  name: string,
  description: string,
  extraContent = "",
): string {
  const skillDir = path.join(tmpDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n${extraContent}`,
  );
  return skillDir;
}

describe("discoverSkills", () => {
  it("discovers skills in a directory", () => {
    createSkill("code-review", "Review code");
    createSkill("test-writer", "Write tests");

    const skills = discoverSkills(tmpDir);

    expect(skills.size).toBe(2);
    expect(skills.has("code-review")).toBe(true);
    expect(skills.has("test-writer")).toBe(true);

    const codeReview = skills.get("code-review")!;
    expect(codeReview.name).toBe("code-review");
    expect(codeReview.description).toBe("Review code");
    expect(codeReview.manifest.skill).toBe("code-review");
    expect(codeReview.manifest.files.length).toBeGreaterThanOrEqual(1);
    expect(codeReview.manifest.files[0].path).toBe("SKILL.md");
    expect(codeReview.manifest.files[0].hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns empty map for non-existent directory", () => {
    const skills = discoverSkills("/nonexistent/path");
    expect(skills.size).toBe(0);
  });

  it("returns empty map for empty directory", () => {
    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it("skips directories without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, "no-skill"));
    fs.writeFileSync(path.join(tmpDir, "no-skill", "README.md"), "# Hello");

    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it("skips skills with missing name", () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\ndescription: No name\n---\n# Bad",
    );

    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it("skips skills with missing description", () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: bad\n---\n# Bad",
    );

    const skills = discoverSkills(tmpDir);
    expect(skills.size).toBe(0);
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
    const skillDir = createSkill("with-docs", "Has docs");

    // Create supplementary files
    const refsDir = path.join(skillDir, "references");
    fs.mkdirSync(refsDir);
    fs.writeFileSync(path.join(refsDir, "REFERENCE.md"), "# Reference");
    fs.writeFileSync(path.join(skillDir, "config.json"), '{"key": "value"}');

    const skills = discoverSkills(tmpDir);
    const skill = skills.get("with-docs")!;

    expect(skill.documents.length).toBe(2);
    const docPaths = skill.documents.map((d) => d.path).sort();
    expect(docPaths).toContain("config.json");
    expect(docPaths).toContain("references/REFERENCE.md");

    // Manifest should include SKILL.md + docs
    expect(skill.manifest.files.length).toBe(3);
  });

  it("extracts optional metadata", () => {
    const skillDir = path.join(tmpDir, "meta-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: meta-skill\ndescription: Has metadata\nmetadata:\n  author: test\n  version: '1.0'\n---\n# Meta",
    );

    const skills = discoverSkills(tmpDir);
    const skill = skills.get("meta-skill")!;
    expect(skill.metadata).toEqual({ author: "test", version: "1.0" });
  });
});

describe("loadSkillContent", () => {
  it("loads a SKILL.md file", () => {
    createSkill("test-skill", "Test");
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
    const skillDir = createSkill("doc-skill", "Has docs");
    fs.writeFileSync(path.join(skillDir, "notes.txt"), "Some notes");

    const skills = discoverSkills(tmpDir);
    const skill = skills.get("doc-skill")!;

    const result = loadDocument(skill, "notes.txt", tmpDir, true);
    expect(result).toHaveProperty("text", "Some notes");
  });

  it("loads a binary document as base64", () => {
    const skillDir = createSkill("bin-skill", "Has binary");
    fs.writeFileSync(path.join(skillDir, "data.bin"), Buffer.from([1, 2, 3]));

    const skills = discoverSkills(tmpDir);
    const skill = skills.get("bin-skill")!;

    const result = loadDocument(skill, "data.bin", tmpDir, false);
    expect(result).toHaveProperty("blob");
    expect(Buffer.from((result as { blob: string }).blob, "base64")).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("rejects path traversal", () => {
    createSkill("safe-skill", "Safe");
    const skills = discoverSkills(tmpDir);
    const skill = skills.get("safe-skill")!;

    expect(() => loadDocument(skill, "../../../etc/passwd", tmpDir, true)).toThrow(
      "Path traversal not allowed",
    );
  });

  it("rejects absolute paths", () => {
    createSkill("safe-skill", "Safe");
    const skills = discoverSkills(tmpDir);
    const skill = skills.get("safe-skill")!;

    expect(() => loadDocument(skill, "/etc/passwd", tmpDir, true)).toThrow(
      "Absolute paths not allowed",
    );
  });
});

describe("isPathWithinBase", () => {
  it("returns true for paths within base", () => {
    const base = tmpDir;
    const target = path.join(tmpDir, "subdir", "file.txt");
    fs.mkdirSync(path.join(tmpDir, "subdir"), { recursive: true });
    fs.writeFileSync(target, "test");

    expect(isPathWithinBase(target, base)).toBe(true);
  });

  it("returns true for the base directory itself", () => {
    expect(isPathWithinBase(tmpDir, tmpDir)).toBe(true);
  });

  it("handles non-existent paths with fallback", () => {
    const base = tmpDir;
    const target = path.join(tmpDir, "nonexistent", "file.txt");

    // Falls back to resolve-based check
    expect(isPathWithinBase(target, base)).toBe(true);
  });
});

describe("scanDocuments", () => {
  it("scans files excluding SKILL.md", () => {
    const skillDir = path.join(tmpDir, "scan-test");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\ndescription: x\n---\n");
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
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\ndescription: x\n---\n");
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
    const docs = scanDocuments("/nonexistent", tmpDir);
    expect(docs).toEqual([]);
  });
});
