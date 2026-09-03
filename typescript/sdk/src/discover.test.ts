import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverSkills } from "./_server.js";

// ---------------------------------------------------------------------------
// discoverSkills (filesystem) — frontmatter parsing
// ---------------------------------------------------------------------------

describe("discoverSkills frontmatter parsing", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-skills-discover-"));
  });
  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkill(name: string, skillMd: string): void {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  }

  it("rejects a frontmatter name that only matches the path segment after trimming", () => {
    // The SEP requires the final path segment to equal the name *as
    // declared*. A quoted YAML name with surrounding whitespace must be
    // rejected, not silently trimmed into conformance.
    const dir = path.join(tmpDir, "padded");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      '---\nname: " padded"\ndescription: Padded name\n---\n# X\n',
    );

    const map = discoverSkills(tmpDir);
    expect(map.has("padded")).toBe(false);
  });

  it("warns, but still serves, a skill whose prefix segment is not URI-safe", () => {
    // SEP-2640: the first <skill-path> segment occupies the URI authority
    // and SHOULD be a valid reg-name. SHOULD, so the skill is served.
    const dir = path.join(tmpDir, "acme corp", "spaced");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "---\nname: spaced\ndescription: Prefix with a space\n---\n# X\n",
    );

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const map = discoverSkills(tmpDir);
      expect(map.has("acme corp/spaced")).toBe(true);
      const warned = spy.mock.calls.some(
        (c) => typeof c[0] === "string" && /not a valid RFC 3986 reg-name/.test(c[0]),
      );
      expect(warned).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("captures a content snapshot, per-file digests/bytes, and subdirectories (including empty)", () => {
    const dir = path.join(tmpDir, "snap");
    fs.mkdirSync(path.join(dir, "refs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "empty-dir"), { recursive: true });
    const skillMd = "---\nname: snap\ndescription: Snapshot test\n---\n# Snap\n";
    fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
    fs.writeFileSync(path.join(dir, "refs", "GUIDE.md"), "# Guide\n");

    const skill = discoverSkills(tmpDir).get("snap")!;
    expect(skill.content).toBe(skillMd);
    expect(skill.directories?.sort()).toEqual(["empty-dir", "refs"]);
    const guide = skill.documents.find((d) => d.path === "refs/GUIDE.md")!;
    expect(guide.bytes?.toString("utf-8")).toBe("# Guide\n");
    expect(guide.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("does not let a '---' inside the frontmatter terminate it early", () => {
    // A literal block scalar whose indented content includes a `---` line.
    // A naive content.split('---') truncates `description` at that line and
    // loses everything after it; a line-anchored parse keeps the whole value.
    const skillMd = [
      "---",
      "name: demo",
      "description: |",
      "  First line of the description.",
      "  ---",
      "  Line after a rule inside the block scalar.",
      "---",
      "",
      "# Body",
      "",
      "Some prose, then a real horizontal rule:",
      "",
      "---",
      "",
      "Text below the rule.",
      "",
    ].join("\n");
    writeSkill("demo", skillMd);

    const map = discoverSkills(tmpDir);
    const skill = map.get("demo");

    expect(skill).toBeDefined();
    expect(skill!.description).toContain(
      "Line after a rule inside the block scalar.",
    );
  });
});
