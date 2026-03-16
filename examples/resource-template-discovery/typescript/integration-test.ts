#!/usr/bin/env node
/**
 * Integration test for resource template skill discovery.
 *
 * Connects to the test fixture server via InMemoryTransport and exercises
 * the full template-based discovery flow:
 *
 * 1. listSkillTemplates() finds skill:// templates (NOT via resources/list)
 * 2. completeTemplateArg() enumerates available skill names
 * 3. discoverSkillsFromTemplate() builds SkillSummary[] from completions
 * 4. loadSkillFromTemplate() reads skill content + manifest
 * 5. resolveManifestFiles() follows manifest URIs to load supporting files
 * 6. listSkillResources() returns EMPTY (proves the gap with resources/list)
 *
 * This test answers the 4 questions from issue #57.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { listSkillResources } from "@modelcontextprotocol/ext-skills/client";
import {
  listSkillTemplates,
  completeTemplateArg,
  discoverSkillsFromTemplate,
  loadSkillFromTemplate,
  resolveManifestFiles,
  discoverAllSkillsFromTemplates,
} from "@modelcontextprotocol/ext-skills";
import type { SkillManifestWithUris } from "@modelcontextprotocol/ext-skills";
import { createServer, OWNER, REPO } from "./src/server.js";

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

// ---------- Test ----------

async function run(): Promise<void> {
  console.log("Setting up InMemoryTransport...");

  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "integration-test-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  console.log("Connected.\n");

  // ------------------------------------------------------------------
  // Test 1: resources/list returns NO skills (proves the gap)
  // ------------------------------------------------------------------
  console.log("Test 1: resources/list returns no skills (gap proof)");

  const listedSkills = await listSkillResources(client);
  assertEqual(listedSkills.length, 0,
    "listSkillResources() returns empty array for template-only server");

  // ------------------------------------------------------------------
  // Test 2: resources/templates/list returns skill templates
  // ------------------------------------------------------------------
  console.log("\nTest 2: listSkillTemplates() finds skill:// templates");

  const templates = await listSkillTemplates(client);
  assert(templates.content.length >= 1,
    `Found ${templates.content.length} skill content template(s)`);
  assert(templates.manifest.length >= 1,
    `Found ${templates.manifest.length} skill manifest template(s)`);

  const contentTemplate = templates.content[0];
  assert(contentTemplate.uriTemplate.includes("SKILL.md"),
    `Content template URI contains SKILL.md: ${contentTemplate.uriTemplate}`);
  assertEqual(contentTemplate.skillNameVariable, "skill_name",
    "Detected skill_name variable in content template");
  assert(contentTemplate.variables.includes("owner"),
    "Content template has 'owner' variable");
  assert(contentTemplate.variables.includes("repo"),
    "Content template has 'repo' variable");

  const manifestTemplate = templates.manifest[0];
  assert(manifestTemplate.uriTemplate.endsWith("_manifest"),
    `Manifest template URI ends with _manifest: ${manifestTemplate.uriTemplate}`);

  // ------------------------------------------------------------------
  // Test 3: completion/complete returns valid skill names
  // ------------------------------------------------------------------
  console.log("\nTest 3: completeTemplateArg() returns valid completions");

  const owners = await completeTemplateArg(
    client, contentTemplate.uriTemplate, "owner", "",
  );
  assert(owners.includes(OWNER),
    `Owner completion includes "${OWNER}"`);

  const repos = await completeTemplateArg(
    client, contentTemplate.uriTemplate, "repo", "", { owner: OWNER },
  );
  assert(repos.includes(REPO),
    `Repo completion includes "${REPO}"`);

  const skillNames = await completeTemplateArg(
    client, contentTemplate.uriTemplate, "skill_name", "",
    { owner: OWNER, repo: REPO },
  );
  assert(skillNames.length >= 2,
    `Found ${skillNames.length} skill name(s) via completions`);
  assert(skillNames.includes("code-review"),
    "Completions include 'code-review'");
  assert(skillNames.includes("git-commit-review"),
    "Completions include 'git-commit-review'");

  // ------------------------------------------------------------------
  // Test 4: discoverSkillsFromTemplate() enumerates skills
  // ------------------------------------------------------------------
  console.log("\nTest 4: discoverSkillsFromTemplate() enumerates skills");

  const discovered = await discoverSkillsFromTemplate(
    client, contentTemplate, { owner: OWNER, repo: REPO },
  );
  assert(discovered.length >= 2,
    `Discovered ${discovered.length} skill(s) from template`);

  const codeReview = discovered.find((s) => s.name === "code-review");
  assert(codeReview !== undefined,
    "Discovered 'code-review' skill");
  assert(
    codeReview?.uri === `skill://${OWNER}/${REPO}/code-review/SKILL.md`,
    `Correct expanded URI: ${codeReview?.uri}`,
  );

  // ------------------------------------------------------------------
  // Test 5: loadSkillFromTemplate() reads content + manifest
  // ------------------------------------------------------------------
  console.log("\nTest 5: loadSkillFromTemplate() reads content and manifest");

  const loaded = await loadSkillFromTemplate(
    client,
    contentTemplate,
    { owner: OWNER, repo: REPO, skill_name: "code-review" },
    manifestTemplate,
  );

  assert(loaded.content.includes("# Code Review"),
    "Loaded skill content contains '# Code Review'");
  assert(loaded.frontmatter !== null,
    "Parsed frontmatter from loaded content");
  assertEqual(loaded.frontmatter?.name, "code-review",
    "Frontmatter name is 'code-review'");
  assert(loaded.manifest !== undefined,
    "Manifest was loaded alongside content");
  assert((loaded.manifest?.files.length ?? 0) >= 1,
    `Manifest has ${loaded.manifest?.files.length} file(s)`);

  // Verify manifest URIs use the file:// scheme
  const manifestFiles = loaded.manifest!.files;
  const skillMdEntry = manifestFiles.find((f) => f.path === "SKILL.md");
  assert(skillMdEntry !== undefined,
    "Manifest includes SKILL.md entry");
  assert(skillMdEntry?.uri.startsWith("file://"),
    `Manifest URI uses file:// scheme: ${skillMdEntry?.uri}`);

  // ------------------------------------------------------------------
  // Test 6: resolveManifestFiles() follows URIs to load content
  // ------------------------------------------------------------------
  console.log("\nTest 6: resolveManifestFiles() follows manifest URIs");

  const resolvedFiles = await resolveManifestFiles(
    client,
    loaded.manifest as SkillManifestWithUris,
  );

  assert(resolvedFiles.size >= 1,
    `Resolved ${resolvedFiles.size} file(s) from manifest`);

  const skillMdContent = resolvedFiles.get("SKILL.md");
  assert(skillMdContent !== undefined,
    "Resolved SKILL.md from manifest URI");
  assert(skillMdContent?.includes("# Code Review") ?? false,
    "Resolved SKILL.md content matches original");

  // Check if reference file was resolved (code-review has references/REFERENCE.md)
  const refContent = resolvedFiles.get("references/REFERENCE.md");
  if (refContent) {
    assert(refContent.length > 0,
      "Resolved references/REFERENCE.md from manifest URI");
  }

  // ------------------------------------------------------------------
  // Test 7: Second skill also works
  // ------------------------------------------------------------------
  console.log("\nTest 7: Second skill (git-commit-review) works end-to-end");

  const loaded2 = await loadSkillFromTemplate(
    client,
    contentTemplate,
    { owner: OWNER, repo: REPO, skill_name: "git-commit-review" },
  );

  assert(loaded2.content.length > 0,
    "Loaded git-commit-review content");
  assert(loaded2.frontmatter !== null,
    "Parsed git-commit-review frontmatter");
  assertEqual(loaded2.frontmatter?.name, "git-commit-review",
    "Frontmatter name is 'git-commit-review'");

  // ------------------------------------------------------------------
  // Test 8: discoverAllSkillsFromTemplates() loads everything in one call
  // ------------------------------------------------------------------
  console.log("\nTest 8: discoverAllSkillsFromTemplates() high-level API");

  const allSkills = await discoverAllSkillsFromTemplates(
    client,
    { owner: OWNER, repo: REPO },
  );

  assert(allSkills.length >= 2,
    `discoverAllSkillsFromTemplates() found ${allSkills.length} skill(s)`);

  const allCodeReview = allSkills.find((s) => s.name === "code-review");
  assert(allCodeReview !== undefined,
    "High-level API found 'code-review'");
  assert(allCodeReview?.content.includes("# Code Review") ?? false,
    "High-level API loaded code-review content");
  assert(allCodeReview?.frontmatter !== null,
    "High-level API parsed code-review frontmatter");
  assert(allCodeReview?.manifest !== undefined,
    "High-level API loaded code-review manifest");

  const allGitReview = allSkills.find((s) => s.name === "git-commit-review");
  assert(allGitReview !== undefined,
    "High-level API found 'git-commit-review'");
  assert(allGitReview?.frontmatter?.description !== undefined,
    "High-level API has description for git-commit-review");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
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
