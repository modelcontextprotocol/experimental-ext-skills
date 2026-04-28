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
  skillPath: string,
  description: string,
): SkillMetadata {
  const segments = skillPath.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  return {
    skillPath,
    name,
    description,
    path: `/skills/${skillPath}/SKILL.md`,
    skillDir: `/skills/${skillPath}`,
    documents: [],
    lastModified: "2026-01-01T00:00:00.000Z",
  };
}

describe("generateSkillsXML", () => {
  it("generates XML for an empty map", () => {
    expect(generateSkillsXML(new Map())).toBe(
      "<available_skills>\n</available_skills>",
    );
  });

  it("generates XML for a single skill", () => {
    const map = new Map<string, SkillMetadata>();
    map.set("code-review", makeSkillMetadata("code-review", "Review code"));

    const result = generateSkillsXML(map);
    expect(result).toContain("<name>code-review</name>");
    expect(result).toContain("<description>Review code</description>");
    expect(result).toContain("<uri>skill://code-review/SKILL.md</uri>");
    expect(result).toMatch(/^<available_skills>\n.*<\/available_skills>$/s);
  });

  it("emits the multi-segment skill path in the URI", () => {
    const map = new Map<string, SkillMetadata>();
    map.set(
      "acme/billing/refunds",
      makeSkillMetadata("acme/billing/refunds", "Process refunds"),
    );

    const result = generateSkillsXML(map);
    expect(result).toContain("<name>refunds</name>");
    expect(result).toContain(
      "<uri>skill://acme/billing/refunds/SKILL.md</uri>",
    );
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
});

describe("generateSkillsXMLFromSummaries", () => {
  it("generates XML for an empty array", () => {
    expect(generateSkillsXMLFromSummaries([])).toBe(
      "<available_skills>\n</available_skills>",
    );
  });

  it("generates XML with description", () => {
    const skills: SkillSummary[] = [
      {
        skillPath: "test-writer",
        name: "test-writer",
        uri: "skill://test-writer/SKILL.md",
        description: "Write tests",
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).toContain("<name>test-writer</name>");
    expect(result).toContain("<description>Write tests</description>");
    expect(result).toContain("<uri>skill://test-writer/SKILL.md</uri>");
  });

  it("generates XML without description", () => {
    const skills: SkillSummary[] = [
      {
        skillPath: "basic",
        name: "basic",
        uri: "skill://basic/SKILL.md",
      },
    ];

    const result = generateSkillsXMLFromSummaries(skills);
    expect(result).toContain("<name>basic</name>");
    expect(result).not.toContain("<description>");
    expect(result).toContain("<uri>skill://basic/SKILL.md</uri>");
  });
});
