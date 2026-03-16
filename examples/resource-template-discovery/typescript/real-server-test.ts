#!/usr/bin/env node
/**
 * Real integration test against Sam Morrow's GitHub MCP server (skills-resources branch).
 *
 * This spawns the actual github-mcp-server binary with --toolsets=skills
 * and connects our SDK client to it via stdio transport. It then exercises
 * the template-based discovery flow against real GitHub data.
 *
 * Prerequisites:
 * - Built github-mcp-server binary at related-work-repos/github-mcp-server-skills/
 * - GITHUB_PERSONAL_ACCESS_TOKEN env var set (or gh auth token available)
 *
 * Target repo: github/awesome-copilot (public, has many skills)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listSkillResources,
  listSkillTemplates,
  completeTemplateArg,
  discoverSkillsFromTemplate,
  loadSkillFromTemplate,
  resolveManifestFiles,
} from "@ext-modelcontextprotocol/skills";
import type { SkillManifestWithUris } from "@ext-modelcontextprotocol/skills";

// ---------- Configuration ----------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_BINARY = path.resolve(
  __dirname,
  "../../../../related-work-repos/github-mcp-server-skills/github-mcp-server.exe",
);

const OWNER = "github";
const REPO = "awesome-copilot";

// ---------- Helpers ----------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------- Token ----------

async function getGitHubToken(): Promise<string> {
  if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    return process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  }
  // Try gh auth token
  const { execSync } = await import("node:child_process");
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      "No GitHub token found. Set GITHUB_PERSONAL_ACCESS_TOKEN or run 'gh auth login'.",
    );
  }
}

// ---------- Test ----------

async function run(): Promise<void> {
  const token = await getGitHubToken();
  console.log("GitHub token acquired.\n");

  console.log(`Spawning github-mcp-server with --toolsets=skills ...`);
  console.log(`Binary: ${SERVER_BINARY}\n`);

  const transport = new StdioClientTransport({
    command: SERVER_BINARY,
    args: ["stdio", "--toolsets=skills,repos"],
    env: {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: token,
    },
  });

  const client = new Client(
    { name: "real-server-integration-test", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("Connected to github-mcp-server.\n");

  // ------------------------------------------------------------------
  // Test 1: resources/list — does it return skills?
  // ------------------------------------------------------------------
  console.log("Test 1: resources/list behavior");

  const listedSkills = await listSkillResources(client);
  console.log(`  listSkillResources() returned ${listedSkills.length} skill(s)`);
  // Sam's server uses templates, not static resources — expect 0
  assertEqual(listedSkills.length, 0,
    "Template-only server returns no skills via resources/list (gap confirmed)");

  // ------------------------------------------------------------------
  // Test 2: resources/templates/list — find skill templates
  // ------------------------------------------------------------------
  console.log("\nTest 2: listSkillTemplates() against real server");

  const templates = await listSkillTemplates(client);
  console.log(`  Found ${templates.content.length} content template(s), ${templates.manifest.length} manifest template(s)`);

  assert(templates.content.length >= 1,
    `Found skill content template(s)`);
  assert(templates.manifest.length >= 1,
    `Found skill manifest template(s)`);

  if (templates.content.length === 0) {
    console.error("\n  FATAL: No skill templates found. Cannot continue.");
    await client.close();
    process.exit(1);
  }

  const contentTemplate = templates.content[0];
  console.log(`  Content template: ${contentTemplate.uriTemplate}`);
  console.log(`  Variables: ${contentTemplate.variables.join(", ")}`);
  console.log(`  Skill name var: ${contentTemplate.skillNameVariable}`);

  assert(contentTemplate.uriTemplate.includes("SKILL.md"),
    "Content template URI includes SKILL.md");
  assertEqual(contentTemplate.skillNameVariable, "skill_name",
    "Detected skill_name variable");

  const manifestTemplate = templates.manifest.length > 0 ? templates.manifest[0] : undefined;
  if (manifestTemplate) {
    console.log(`  Manifest template: ${manifestTemplate.uriTemplate}`);
  }

  // ------------------------------------------------------------------
  // Test 3: completion/complete — enumerate skills in awesome-copilot
  // ------------------------------------------------------------------
  console.log(`\nTest 3: completeTemplateArg() for ${OWNER}/${REPO}`);

  const skillNames = await completeTemplateArg(
    client,
    contentTemplate.uriTemplate,
    "skill_name",
    "",
    { owner: OWNER, repo: REPO },
  );

  console.log(`  Found ${skillNames.length} skill name(s) via completions`);
  if (skillNames.length > 0) {
    console.log(`  First 5: ${skillNames.slice(0, 5).join(", ")}`);
  }
  assert(skillNames.length >= 5,
    `Found at least 5 skills in ${OWNER}/${REPO} (got ${skillNames.length})`);

  // Look for a known skill
  const knownSkill = skillNames.find((n) => n === "copilot-sdk") ?? skillNames[0];
  console.log(`  Using skill "${knownSkill}" for remaining tests`);

  // ------------------------------------------------------------------
  // Test 4: discoverSkillsFromTemplate()
  // ------------------------------------------------------------------
  console.log("\nTest 4: discoverSkillsFromTemplate()");

  const discovered = await discoverSkillsFromTemplate(
    client, contentTemplate, { owner: OWNER, repo: REPO },
  );

  assert(discovered.length >= 5,
    `Discovered ${discovered.length} skill(s) from template`);

  const targetSkill = discovered.find((s) => s.name === knownSkill);
  assert(targetSkill !== undefined,
    `Found "${knownSkill}" in discovered skills`);
  console.log(`  URI: ${targetSkill?.uri}`);

  // ------------------------------------------------------------------
  // Test 5: loadSkillFromTemplate() — read real skill content
  // ------------------------------------------------------------------
  console.log(`\nTest 5: loadSkillFromTemplate() for "${knownSkill}"`);

  const loaded = await loadSkillFromTemplate(
    client,
    contentTemplate,
    { owner: OWNER, repo: REPO, skill_name: knownSkill },
    manifestTemplate,
  );

  assert(loaded.content.length > 0,
    `Loaded skill content (${loaded.content.length} chars)`);
  console.log(`  Content preview: ${loaded.content.slice(0, 100).replace(/\n/g, "\\n")}...`);

  if (loaded.frontmatter) {
    console.log(`  Frontmatter name: ${loaded.frontmatter.name}`);
    console.log(`  Frontmatter desc: ${loaded.frontmatter.description?.slice(0, 80)}...`);
    assert(loaded.frontmatter.name.length > 0,
      "Parsed frontmatter name from real skill");
  } else {
    console.log("  (No frontmatter parsed — skill may not use standard format)");
  }

  if (loaded.manifest) {
    console.log(`  Manifest: ${loaded.manifest.files.length} file(s)`);
    assert(loaded.manifest.files.length >= 1,
      `Manifest has ${loaded.manifest.files.length} file(s)`);

    // Check that manifest URIs use repo:// scheme (GitHub's pattern)
    const firstFile = loaded.manifest.files[0];
    console.log(`  First file URI: ${firstFile.uri}`);
    assert(firstFile.uri.startsWith("repo://"),
      `Manifest URIs use repo:// scheme`);

    // ------------------------------------------------------------------
    // Test 6: resolveManifestFiles() — follow repo:// URIs
    // ------------------------------------------------------------------
    console.log("\nTest 6: resolveManifestFiles() follows repo:// URIs");

    const resolved = await resolveManifestFiles(
      client,
      loaded.manifest as SkillManifestWithUris,
    );

    console.log(`  Resolved ${resolved.size} of ${loaded.manifest.files.length} file(s)`);
    assert(resolved.size >= 1,
      `Resolved at least 1 file from manifest`);

    // Check SKILL.md was resolved
    const skillMdContent = resolved.get("SKILL.md");
    if (skillMdContent) {
      assert(skillMdContent.length > 0,
        "Resolved SKILL.md content via repo:// URI");
      // Verify it matches the direct read
      assertEqual(skillMdContent, loaded.content,
        "Manifest-resolved SKILL.md matches direct read");
    }
  } else {
    console.log("  (No manifest loaded)");
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Server: github-mcp-server (skills-resources branch)`);
  console.log(`Repo:   ${OWNER}/${REPO}`);
  console.log(`${"=".repeat(60)}`);

  await client.close();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
