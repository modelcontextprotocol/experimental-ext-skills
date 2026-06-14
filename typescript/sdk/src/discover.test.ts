import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
