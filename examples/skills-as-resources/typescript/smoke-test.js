#!/usr/bin/env node
/**
 * Smoke test for the Skills as Resources MCP server.
 *
 * Uses the MCP Client SDK to spawn the server as a child process,
 * perform the initialization handshake, and exercise all capabilities.
 *
 * Usage: node smoke-test.mjs [skillsDir]
 *   Default skillsDir: ../sample-skills (relative to this script)
 *
 * Exit code 0 = all tests pass, 1 = one or more failures.
 */

import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Configuration ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir =
  process.argv[2] || path.resolve(__dirname, "../../sample-skills");
const serverScript = path.resolve(__dirname, "dist/index.js");

// ── Test harness ───────────────────────────────────────────────────────

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Skills as Resources MCP Server — Smoke Test");
  console.log(`Server: ${serverScript}`);
  console.log(`Skills: ${skillsDir}`);
  console.log("");

  // Global timeout to prevent hangs
  const TIMEOUT_MS = 30_000;
  const timer = setTimeout(() => {
    console.error(`Smoke test timed out after ${TIMEOUT_MS / 1000}s`);
    process.exit(1);
  }, TIMEOUT_MS);
  timer.unref();

  // Spawn the server and connect
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverScript, skillsDir],
    stderr: "pipe",
  });

  const client = new Client(
    { name: "smoke-test-client", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } },
  );

  // Collect stderr for diagnostics on failure
  let stderrOutput = "";
  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });
  }

  await client.connect(transport);

  try {
    // Test 1: initialization / capabilities
    await runTest("Server initialization and capabilities", async () => {
      const caps = client.getServerCapabilities();
      const ver = client.getServerVersion();
      assert(
        ver.name === "skills-as-resources-example",
        `server name: ${ver.name}`,
      );
      assert(ver.version === "0.2.0", `server version: ${ver.version}`);
      assert(caps.resources, "resources capability missing");
      assert(caps.resources.listChanged === true, "listChanged not true");
      assert(caps.resources.subscribe === true, "subscribe not true");
    });

    // Test 2: list resources
    await runTest("List resources discovers all skills", async () => {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      assert(uris.includes("skill://prompt-xml"), "missing skill://prompt-xml");
      assert(
        uris.includes("skill://code-review/SKILL.md"),
        "missing code-review SKILL.md",
      );
      assert(
        uris.includes("skill://code-review/_manifest"),
        "missing code-review _manifest",
      );
      assert(
        uris.includes("skill://git-commit-review/SKILL.md"),
        "missing git-commit-review SKILL.md",
      );
      assert(
        uris.includes("skill://git-commit-review/_manifest"),
        "missing git-commit-review _manifest",
      );
      assert(
        uris.includes("skill://explore-everything/SKILL.md"),
        "missing explore-everything SKILL.md",
      );
      assert(
        uris.includes("skill://explore-everything/_manifest"),
        "missing explore-everything _manifest",
      );
      assert(
        resources.length >= 7,
        `expected >= 7 resources, got ${resources.length}`,
      );

      const cr = resources.find(
        (r) => r.uri === "skill://code-review/SKILL.md",
      );
      assert(
        cr.mimeType === "text/markdown",
        `code-review mimeType: ${cr.mimeType}`,
      );
      assert(
        cr.description?.toLowerCase().includes("code review"),
        "code-review description missing 'code review'",
      );
      assert(
        cr.annotations?.audience?.includes("assistant"),
        "code-review audience missing 'assistant'",
      );
      assert(
        cr.annotations?.priority === 1.0,
        `code-review priority: ${cr.annotations?.priority}`,
      );

      const px = resources.find((r) => r.uri === "skill://prompt-xml");
      assert(
        px.mimeType === "application/xml",
        `prompt-xml mimeType: ${px.mimeType}`,
      );
      assert(
        px.annotations?.priority === 0.3,
        `prompt-xml priority: ${px.annotations?.priority}`,
      );
    });

    // Test 2b: skill with dependencies has requirements in description
    await runTest("Skill with dependencies shows requirements in description", async () => {
      const { resources } = await client.listResources();
      const ee = resources.find(
        (r) => r.uri === "skill://explore-everything/SKILL.md",
      );
      assert(ee, "explore-everything resource not found");
      assert(
        ee.description?.includes("(requires: everything-server)"),
        `expected '(requires: everything-server)' in description, got: ${ee.description}`,
      );
    });

    // Test 3: list resource templates
    await runTest(
      "List resource templates includes supporting-file template",
      async () => {
        const { resourceTemplates } = await client.listResourceTemplates();
        assert(resourceTemplates.length >= 1, "no resource templates");
        const tmpl = resourceTemplates.find(
          (t) => t.uriTemplate === "skill://{skillName}/{+path}",
        );
        assert(tmpl, "missing skill://{skillName}/{+path} template");
      },
    );

    // Test 4: read SKILL.md content
    await runTest("Read SKILL.md content for both skills", async () => {
      const cr = await client.readResource({
        uri: "skill://code-review/SKILL.md",
      });
      assert(
        cr.contents.length === 1,
        `expected 1 content, got ${cr.contents.length}`,
      );
      assert(
        cr.contents[0].uri === "skill://code-review/SKILL.md",
        "uri mismatch",
      );
      assert(cr.contents[0].text.includes("---"), "missing frontmatter");
      assert(
        cr.contents[0].text.includes("name: code-review"),
        "missing name field",
      );
      assert(
        cr.contents[0].text.includes("# Code Review"),
        "missing heading",
      );

      const gc = await client.readResource({
        uri: "skill://git-commit-review/SKILL.md",
      });
      assert(
        gc.contents[0].text.includes("name: git-commit-review"),
        "missing git-commit name",
      );
      assert(
        gc.contents[0].text.includes("# Git Commit Review"),
        "missing git-commit heading",
      );
    });

    // Test 5: read _manifest
    await runTest("Read _manifest for code-review", async () => {
      const res = await client.readResource({
        uri: "skill://code-review/_manifest",
      });
      const manifest = JSON.parse(res.contents[0].text);
      assert(
        manifest.skill === "code-review",
        `manifest skill: ${manifest.skill}`,
      );
      assert(Array.isArray(manifest.files), "manifest.files not an array");

      const skillMd = manifest.files.find((f) => f.path === "SKILL.md");
      assert(skillMd, "SKILL.md not in manifest");
      assert(
        typeof skillMd.size === "number" && skillMd.size > 0,
        "SKILL.md size invalid",
      );
      assert(
        /^sha256:[a-f0-9]{64}$/.test(skillMd.hash),
        `SKILL.md hash format: ${skillMd.hash}`,
      );

      const ref = manifest.files.find(
        (f) => f.path === "references/REFERENCE.md",
      );
      assert(ref, "references/REFERENCE.md not in manifest");
      assert(
        /^sha256:[a-f0-9]{64}$/.test(ref.hash),
        `REFERENCE.md hash format: ${ref.hash}`,
      );
    });

    // Test 6: read supporting file via template
    await runTest("Read supporting file via resource template", async () => {
      const res = await client.readResource({
        uri: "skill://code-review/references/REFERENCE.md",
      });
      assert(
        res.contents[0].uri === "skill://code-review/references/REFERENCE.md",
        "uri mismatch",
      );
      assert(
        res.contents[0].text.includes("Code Review Checklist"),
        "missing checklist title",
      );
    });

    // Test 7: read prompt-xml
    await runTest("Read prompt-xml resource", async () => {
      const res = await client.readResource({ uri: "skill://prompt-xml" });
      const xml = res.contents[0].text;
      assert(xml.includes("<available_skills>"), "missing <available_skills>");
      assert(
        xml.includes("<name>code-review</name>"),
        "missing code-review in XML",
      );
      assert(
        xml.includes("<name>git-commit-review</name>"),
        "missing git-commit-review in XML",
      );
      assert(
        xml.includes("<name>explore-everything</name>"),
        "missing explore-everything in XML",
      );
      assert(
        xml.includes("</available_skills>"),
        "missing </available_skills>",
      );
    });

    // Test 8: read explore-everything SKILL.md (skill with dependencies)
    await runTest("Read SKILL.md for skill with dependencies", async () => {
      const res = await client.readResource({
        uri: "skill://explore-everything/SKILL.md",
      });
      assert(
        res.contents[0].text.includes("name: explore-everything"),
        "missing name field",
      );
      assert(
        res.contents[0].text.includes("dependencies: [everything-server]"),
        "missing dependencies field in frontmatter",
      );
      assert(
        res.contents[0].text.includes("# Explore Everything Server"),
        "missing heading",
      );
    });

    // Test 9: prompt-xml includes dependencies element
    await runTest("Prompt XML includes dependencies for explore-everything", async () => {
      const res = await client.readResource({ uri: "skill://prompt-xml" });
      const xml = res.contents[0].text;
      assert(
        xml.includes("<dependencies>everything-server</dependencies>"),
        "missing <dependencies> element in XML for explore-everything",
      );
    });

  } finally {
    clearTimeout(timer);
    await client.close();
  }

  // Summary
  console.log("");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log("");
    console.log("Server stderr output:");
    console.log(stderrOutput || "(empty)");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
