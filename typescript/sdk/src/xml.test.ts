import { describe, it, expect } from "vitest";
import {
  escapeXml,
  generateSkillsXML,
  generateSkillsXMLFromSummaries,
} from "./xml.js";
import type { SkillMetadata, SkillSummary } from "./types.js";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeXml('"hello" & \'world\'')).toBe(
      "&quot;hello&quot; &amp; &apos;world&apos;",
    );
  });

  it("returns plain text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

function makeSkillMetadata(
  name: string,
  description: string,
  dependencies?: string[],
): SkillMetadata {
  return {
    name,
    description,
    path: `/skills/${name}/SKILL.md`,
    skillDir: `/skills/${name}`,
    dependencies,
    documents: [],
    manifest: { skill: name, files: [] },
    manifestJson: "{}",
    lastModified: "2025-01-01T00:00:00.000Z",
  };
}

describe("generateSkillsXML", () => {
  it("generates XML for an empty map", () => {
    const result = generateSkillsXML(new Map());
    expect(result).toBe(
      "<available_skills>\n</available_skills>",
    );
  });

  it("generates XML for a single skill", () => {
    const map = new Map<string, SkillMetadata>();
    map.set("code-review", makeSkillMetadata("code-review", "Review code"));

    const result = generateSkillsXML(map);
    expect(result).toContain("<name>code-review</name>");
    expect(result).toContain("<description>Review code</description>");
    expect(result).toContain(
      "<uri>skill://code-review/SKILL.md</uri>",
    );
    expect(result).toMatch(
      /^<available_skills>\n.*<\/available_skills>$/s,
    );
  });

  it("generates XML for multiple skills", () => {
    const map = new Map<string, SkillMetadata>();
    map.set("skill-a", makeSkillMetadata("skill-a", "Description A"));
    map.set("skill-b", makeSkillMetadata("skill-b", "Description B"));

    const result = generateSkillsXML(map);
    expect(result).toContain("<name>skill-a</name>");
    expect(result).toContain("<name>skill-b</name>");
  });

  it("escapes special characters in skill data", () => {
    const map = new Map<string, SkillMetadata>();
    map.set(
      "special",
      makeSkillMetadata("special", 'A "skill" with <tags> & more'),
    );

    const result = generateSkillsXML(map);
    expect(result).toContain(
      "A &quot;skill&quot; with &lt;tags&gt; &amp; more",
    );
  });

  it("includes dependencies element when present", () => {
    const map = new Map<string, SkillMetadata>();
    map.set(
      "with-deps",
      makeSkillMetadata("with-deps", "Has deps", ["server-a", "server-b"]),
    );

    const result = generateSkillsXML(map);
    expect(result).toContain(
      "<dependencies>server-a, server-b</dependencies>",
    );
  });

  it("omits dependencies element when absent", () => {
    const map = new Map<string, SkillMetadata>();
    map.set("no-deps", makeSkillMetadata("no-deps", "No deps"));

    const result = generateSkillsXML(map);
    expect(result).not.toContain("<dependencies>");
  });
});

describe("generateSkillsXMLFromSummaries", () => {
  it("generates XML for an empty array", () => {
    const result = generateSkillsXMLFromSummaries([]);
    expect(result).toBe(
      "<available_skills>\n</available_skills>",
    );
  });

  it("generates XML with description", () => {
    const skills: SkillSummary[] = [
      {
        name: "test-writer",
        uri: "skill://test-writer/SKILL.md",
        description: "Write tests",
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).toContain("<name>test-writer</name>");
    expect(result).toContain("<description>Write tests</description>");
    expect(result).toContain(
      "<uri>skill://test-writer/SKILL.md</uri>",
    );
  });

  it("generates XML without description", () => {
    const skills: SkillSummary[] = [
      {
        name: "basic",
        uri: "skill://basic/SKILL.md",
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).toContain("<name>basic</name>");
    expect(result).not.toContain("<description>");
    expect(result).toContain("<uri>skill://basic/SKILL.md</uri>");
  });

  it("includes dependencies in summary XML when present", () => {
    const skills: SkillSummary[] = [
      {
        name: "explore",
        uri: "skill://explore/SKILL.md",
        description: "Explore",
        dependencies: ["everything-server"],
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).toContain(
      "<dependencies>everything-server</dependencies>",
    );
  });

  it("omits dependencies in summary XML when absent", () => {
    const skills: SkillSummary[] = [
      {
        name: "simple",
        uri: "skill://simple/SKILL.md",
        description: "Simple",
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).not.toContain("<dependencies>");
  });
});
