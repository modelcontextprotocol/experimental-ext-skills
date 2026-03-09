#!/usr/bin/env node
/**
 * Smoke test for the Skills Workaround Patterns MCP server.
 *
 * Uses the MCP Client SDK to spawn the server as a child process,
 * perform the initialization handshake, and exercise all four
 * workaround patterns (instructions, skill tool, prompts, resources).
 *
 * Usage: node smoke-test.js [skillsDir]
 *   Default skillsDir: ../../sample-skills (relative to this script)
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
  console.log("Skills Workaround Patterns MCP Server — Smoke Test");
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
    { capabilities: {} },
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
    // ── Pattern 0: Initialization & capabilities ──────────────────────

    await runTest("Server initialization and capabilities", async () => {
      const caps = client.getServerCapabilities();
      const ver = client.getServerVersion();
      assert(
        ver.name === "skills-workaround-patterns",
        `server name: ${ver.name}`,
      );
      assert(ver.version === "0.1.0", `server version: ${ver.version}`);
      assert(caps.resources, "resources capability missing");
      assert(caps.tools, "tools capability missing");
      assert(caps.prompts, "prompts capability missing");
    });

    // ── Pattern 1: Server Instructions (default = off) ─────────────────

    await runTest("Default mode: no server instructions", async () => {
      const instructions = client.getInstructions();
      assert(
        !instructions,
        "expected no instructions in default mode, got: " + instructions,
      );
    });

    // ── Pattern 2: Skill Tool (aligned with skilljack-mcp) ─────────────

    await runTest("Tool list includes load_skill tool", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      assert(names.includes("load_skill"), "missing 'load_skill' tool");
    });

    await runTest("load_skill tool has correct title and annotations", async () => {
      const { tools } = await client.listTools();
      const skillTool = tools.find((t) => t.name === "load_skill");
      assert(skillTool, "load_skill tool not found");
      assert(
        skillTool.annotations?.readOnlyHint === true,
        "missing readOnlyHint annotation",
      );
      assert(
        skillTool.annotations?.idempotentHint === true,
        "missing idempotentHint annotation",
      );
    });

    await runTest("load_skill tool description contains XML catalog", async () => {
      const { tools } = await client.listTools();
      const skillTool = tools.find((t) => t.name === "load_skill");
      assert(skillTool, "load_skill tool not found");
      assert(
        skillTool.description.includes("<available_skills>"),
        "load_skill tool description missing XML catalog",
      );
      assert(
        skillTool.description.includes("<name>code-review</name>"),
        "load_skill tool description missing code-review",
      );
    });

    await runTest("load_skill tool returns SKILL.md content", async () => {
      const result = await client.callTool({
        name: "load_skill",
        arguments: { name: "code-review" },
      });
      assert(!result.isError, `tool returned error: ${JSON.stringify(result)}`);
      assert(result.content.length === 1, "expected 1 content item");
      assert(result.content[0].type === "text", "expected text content");
      assert(
        result.content[0].text.includes("name: code-review"),
        "missing frontmatter",
      );
      assert(
        result.content[0].text.includes("# Code Review"),
        "missing heading",
      );
    });

    await runTest("load_skill tool returns error for unknown skill", async () => {
      const result = await client.callTool({
        name: "load_skill",
        arguments: { name: "nonexistent" },
      });
      assert(result.isError === true, "expected isError: true");
      assert(
        result.content[0].text.includes("not found"),
        "expected 'not found' message",
      );
    });

    // ── Pattern 3: Prompts ────────────────────────────────────────────

    await runTest("Prompt list includes /skills and per-skill prompts", async () => {
      const { prompts } = await client.listPrompts();
      const names = prompts.map((p) => p.name);
      assert(names.includes("skills"), "missing 'skills' prompt");
      assert(
        names.includes("skill-code-review"),
        "missing 'skill-code-review' prompt",
      );
      assert(
        names.includes("skill-git-commit-review"),
        "missing 'skill-git-commit-review' prompt",
      );
    });

    await runTest("/skills prompt lists all skills", async () => {
      const result = await client.getPrompt({ name: "skills" });
      assert(result.messages.length === 1, "expected 1 message");
      assert(result.messages[0].role === "user", "expected user role");
      const text = result.messages[0].content.text;
      assert(text.includes("code-review"), "missing code-review in listing");
      assert(
        text.includes("git-commit-review"),
        "missing git-commit-review in listing",
      );
    });

    await runTest("/skill-code-review prompt returns embedded resource", async () => {
      const result = await client.getPrompt({ name: "skill-code-review" });
      assert(result.messages.length === 1, "expected 1 message");
      const msg = result.messages[0];
      assert(msg.role === "user", "expected user role");
      assert(
        msg.content.type === "resource",
        `expected resource content, got ${msg.content.type}`,
      );
      assert(
        msg.content.resource.uri === "skill://code-review/SKILL.md",
        `unexpected uri: ${msg.content.resource.uri}`,
      );
      assert(
        msg.content.resource.text.includes("# Code Review"),
        "missing heading in embedded resource",
      );
    });

    // ── --use-static-server-instructions mode ──────────────────────────

    await runTest("--use-static-server-instructions embeds skill catalog", async () => {
      // Spawn a second server instance with the flag
      const staticTransport = new StdioClientTransport({
        command: "node",
        args: [serverScript, "--use-static-server-instructions", skillsDir],
        stderr: "pipe",
      });
      const staticClient = new Client(
        { name: "smoke-test-static", version: "1.0.0" },
        { capabilities: {} },
      );
      await staticClient.connect(staticTransport);
      try {
        const instructions = staticClient.getInstructions();
        assert(instructions, "instructions is empty/undefined");
        assert(
          instructions.includes("# Skills"),
          "missing '# Skills' preamble",
        );
        assert(
          instructions.includes("<available_skills>"),
          "missing <available_skills> XML",
        );
        assert(
          instructions.includes("<name>code-review</name>"),
          "missing code-review in catalog",
        );
        assert(
          instructions.includes("<name>git-commit-review</name>"),
          "missing git-commit-review in catalog",
        );

        // Tool description should NOT duplicate the catalog
        const { tools } = await staticClient.listTools();
        const skillTool = tools.find((t) => t.name === "load_skill");
        assert(skillTool, "load_skill tool not found");
        assert(
          !skillTool.description.includes("<available_skills>"),
          "load_skill tool description should not contain catalog in static mode",
        );
      } finally {
        await staticClient.close();
      }
    });

    // ── Resources (canonical path) ────────────────────────────────────

    await runTest("Resources list includes skill:// URIs", async () => {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri);
      assert(
        uris.includes("skill://code-review/SKILL.md"),
        "missing code-review SKILL.md resource",
      );
      assert(
        uris.includes("skill://git-commit-review/SKILL.md"),
        "missing git-commit-review SKILL.md resource",
      );
      assert(
        uris.includes("skill://code-review/_manifest"),
        "missing code-review _manifest resource",
      );
    });

    await runTest("Read skill:// resource returns SKILL.md content", async () => {
      const res = await client.readResource({
        uri: "skill://code-review/SKILL.md",
      });
      assert(res.contents.length === 1, "expected 1 content");
      assert(
        res.contents[0].text.includes("# Code Review"),
        "missing heading",
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
