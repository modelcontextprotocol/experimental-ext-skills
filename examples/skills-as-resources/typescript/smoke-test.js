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
      assert(caps.tools, "tools capability missing");
    });

    // Test 2: list resources
    await runTest("List resources discovers both skills", async () => {
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
        resources.length >= 5,
        `expected >= 5 resources, got ${resources.length}`,
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
        xml.includes("</available_skills>"),
        "missing </available_skills>",
      );
    });

    // Test 8: list tools and call load_skill (valid + invalid)
    await runTest(
      "load_skill tool: list, call valid, call invalid",
      async () => {
        // List
        const { tools } = await client.listTools();
        assert(tools.length === 1, `expected 1 tool, got ${tools.length}`);
        assert(tools[0].name === "load_skill", `tool name: ${tools[0].name}`);
        assert(
          tools[0].inputSchema?.properties?.skillName,
          "missing skillName in schema",
        );
        assert(
          tools[0].annotations?.readOnlyHint === true,
          "readOnlyHint not true",
        );
        assert(
          tools[0].annotations?.idempotentHint === true,
          "idempotentHint not true",
        );
        assert(
          tools[0].description?.includes("code-review"),
          "description missing code-review",
        );
        assert(
          tools[0].description?.includes("git-commit-review"),
          "description missing git-commit-review",
        );

        // Valid call
        const ok = await client.callTool({
          name: "load_skill",
          arguments: { skillName: "code-review" },
        });
        assert(ok.content?.length === 1, "expected 1 content item");
        assert(ok.content[0].type === "text", "content not text");
        assert(
          ok.content[0].text.includes("# Code Review"),
          "missing heading in tool result",
        );
        assert(!ok.isError, "unexpected isError on valid call");

        // Invalid call
        const err = await client.callTool({
          name: "load_skill",
          arguments: { skillName: "nonexistent-skill" },
        });
        assert(err.isError === true, "expected isError on invalid call");
        assert(
          err.content[0].text.toLowerCase().includes("not found"),
          "missing 'not found' in error",
        );
        assert(
          err.content[0].text.includes("code-review"),
          "missing available skill in error",
        );
      },
    );
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
