#!/usr/bin/env node
/**
 * Smoke test for the Skills as Resources MCP server (SEP-2640).
 *
 * Spawns the server, performs the MCP handshake, and exercises:
 *   - skill://index.json discovery
 *   - skill://<skillPath>/SKILL.md reads
 *   - skill://<skillPath>/<filePath> reads via per-skill resource templates
 *
 * Usage: node smoke-test.js [skillsDir]
 */

import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir =
  process.argv[2] || path.resolve(__dirname, "../../sample-skills");
const serverScript = path.resolve(__dirname, "dist/index.js");

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

async function main() {
  console.log("Skills as Resources MCP Server — Smoke Test (SEP-2640)");
  console.log(`Server: ${serverScript}`);
  console.log(`Skills: ${skillsDir}`);
  console.log("");

  const TIMEOUT_MS = 30_000;
  const timer = setTimeout(() => {
    console.error(`Smoke test timed out after ${TIMEOUT_MS / 1000}s`);
    process.exit(1);
  }, TIMEOUT_MS);
  timer.unref();

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverScript, skillsDir],
    stderr: "pipe",
  });

  const client = new Client(
    { name: "smoke-test-client", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } },
  );

  let stderrOutput = "";
  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });
  }

  await client.connect(transport);

  try {
    await runTest("Server initialization and capabilities", async () => {
      const caps = client.getServerCapabilities();
      const ver = client.getServerVersion();
      assert(
        ver.name === "skills-as-resources-example",
        `server name: ${ver.name}`,
      );
      assert(ver.version === "0.1.0", `server version: ${ver.version}`);
      assert(caps.resources, "resources capability missing");
      assert(caps.resources.listChanged === true, "listChanged not true");
      assert(caps.resources.subscribe === true, "subscribe not true");
      // Note: the server advertises capabilities.extensions per SEP-2133,
      // but ServerCapabilitiesSchema in @modelcontextprotocol/sdk does not
      // yet allow `extensions`, so it's stripped from the client's view.
      // The wire-level capability is still sent — re-enable this assertion
      // when the SDK adopts SEP-2133.
    });

    await runTest("List resources includes SKILL.md and index.json", async () => {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      assert(
        uris.includes("skill://code-review/SKILL.md"),
        "missing code-review SKILL.md",
      );
      assert(
        uris.includes("skill://git-commit-review/SKILL.md"),
        "missing git-commit-review SKILL.md",
      );
      assert(uris.includes("skill://index.json"), "missing skill://index.json");

      const cr = resources.find(
        (r) => r.uri === "skill://code-review/SKILL.md",
      );
      assert(cr.name === "code-review", `code-review resource name: ${cr.name}`);
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
    });

    await runTest(
      "skill://index.json content matches SEP-2640 schema",
      async () => {
        const res = await client.readResource({ uri: "skill://index.json" });
        const index = JSON.parse(res.contents[0].text);
        assert(
          index.$schema ===
            "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
          `unexpected $schema: ${index.$schema}`,
        );
        assert(Array.isArray(index.skills), "skills not an array");
        const skillMd = index.skills.filter((s) => s.type === "skill-md");
        assert(
          skillMd.length === 2,
          `expected 2 skill-md entries, got ${skillMd.length}`,
        );

        const cr = skillMd.find((s) => s.name === "code-review");
        assert(cr, "code-review entry missing");
        assert(cr.type === "skill-md", `code-review type: ${cr.type}`);
        assert(
          cr.url === "skill://code-review/SKILL.md",
          `code-review url: ${cr.url}`,
        );
        assert(
          typeof cr.description === "string" && cr.description.length > 0,
          "code-review description missing",
        );
      },
    );

    await runTest(
      "List resource templates includes per-skill file template",
      async () => {
        const { resourceTemplates } = await client.listResourceTemplates();
        assert(resourceTemplates.length >= 2, "expected >= 2 resource templates");
        const tmpl = resourceTemplates.find(
          (t) => t.uriTemplate === "skill://code-review/{+filePath}",
        );
        assert(tmpl, "missing skill://code-review/{+filePath} template");
      },
    );

    await runTest("Read SKILL.md content for both skills", async () => {
      const cr = await client.readResource({
        uri: "skill://code-review/SKILL.md",
      });
      assert(cr.contents.length === 1, "expected 1 content");
      assert(
        cr.contents[0].uri === "skill://code-review/SKILL.md",
        "uri mismatch",
      );
      assert(cr.contents[0].text.includes("---"), "missing frontmatter");
      assert(
        cr.contents[0].text.includes("name: code-review"),
        "missing name field",
      );

      const gc = await client.readResource({
        uri: "skill://git-commit-review/SKILL.md",
      });
      assert(
        gc.contents[0].text.includes("name: git-commit-review"),
        "missing git-commit name",
      );
    });

    await runTest("Read supporting file via resource template", async () => {
      const res = await client.readResource({
        uri: "skill://code-review/references/REFERENCE.md",
      });
      assert(
        res.contents[0].uri ===
          "skill://code-review/references/REFERENCE.md",
        "uri mismatch",
      );
      assert(
        res.contents[0].text.includes("Code Review Checklist"),
        "missing checklist title",
      );
    });

    await runTest(
      "skill://index.json includes archive and mcp-resource-template entries",
      async () => {
        const res = await client.readResource({ uri: "skill://index.json" });
        const index = JSON.parse(res.contents[0].text);

        const archive = index.skills.find((s) => s.type === "archive");
        assert(archive, "missing archive entry");
        assert(
          archive.url === "skill://code-review.tar.gz" ||
            archive.url === "skill://git-commit-review.tar.gz",
          `unexpected archive url: ${archive.url}`,
        );

        const tmpl = index.skills.find(
          (s) => s.type === "mcp-resource-template",
        );
        assert(tmpl, "missing mcp-resource-template entry");
        assert(
          tmpl.url === "skill://docs/{product}/SKILL.md",
          `unexpected template url: ${tmpl.url}`,
        );
      },
    );

    await runTest("Read tar.gz archive for code-review", async () => {
      const res = await client.readResource({
        uri: "skill://code-review.tar.gz",
      });
      const content = res.contents[0];
      assert(
        content.mimeType === "application/gzip",
        `mimeType: ${content.mimeType}`,
      );
      assert(typeof content.blob === "string", "blob missing");
      const tar = gunzipSync(Buffer.from(content.blob, "base64"));
      // SKILL.md must be at archive root (SEP-2640)
      assert(
        tar.subarray(0, 9).toString("utf8") === "SKILL.md\0",
        `archive root not SKILL.md (got: ${tar.subarray(0, 9).toString("utf8")})`,
      );
      assert(
        tar.subarray(257, 263).toString("ascii") === "ustar\0",
        "missing USTAR magic",
      );
    });

    await runTest("Resolve a template URI via the registered template", async () => {
      const res = await client.readResource({
        uri: "skill://docs/widget/SKILL.md",
      });
      assert(
        res.contents[0].uri === "skill://docs/widget/SKILL.md",
        "uri mismatch",
      );
      assert(
        res.contents[0].text.includes("name: widget"),
        "missing widget name in resolved template content",
      );
    });
  } finally {
    clearTimeout(timer);
    await client.close();
  }

  console.log("");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`,
  );

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
