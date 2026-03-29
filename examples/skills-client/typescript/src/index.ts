#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Client
 *
 * Demonstrates client-side SDK usage for the Skills Extension SEP:
 *
 *   1. READ_RESOURCE_TOOL      — Host-provided tool for model-driven loading
 *   2. listSkillsFromIndex()   — Discover skills via skill://index.json
 *   3. listSkills()            — Discover all skills via resources/list
 *   4. readSkillContent()      — Load a multi-segment skill by path
 *   5. readSkillManifest()     — Get file inventory with SHA256 hashes
 *   6. readSkillDocument()     — Load a supporting file via resource template
 *
 * Connects to the skills-server via stdio (spawns as child process).
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  READ_RESOURCE_TOOL,
  listSkills,
  listSkillsFromIndex,
  readSkillContent,
  readSkillManifest,
  readSkillDocument,
  buildSkillsSummary,
} from "@modelcontextprotocol/ext-skills/client";
import { buildSkillUri } from "@modelcontextprotocol/ext-skills";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function header(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

function subheader(title: string) {
  console.log(`\n--- ${title} ---\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Connect to the skills server via stdio
  const serverPath = path.resolve(
    __dirname,
    "../../../skills-server/typescript/dist/index.js",
  );

  console.log("Connecting to skills-sep-example server...");
  console.log(`Server path: ${serverPath}\n`);

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
  });

  const client = new Client(
    { name: "skills-sep-example-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("Connected!\n");

  try {
    // -----------------------------------------------------------------------
    // 1. Host-provided read_resource tool (SEP requirement)
    // -----------------------------------------------------------------------
    header("1. READ_RESOURCE_TOOL — Host Tool for Model-Driven Loading");

    console.log("Per the SEP, hosts SHOULD expose a read_resource tool so the");
    console.log("model can load skill content on demand. The SDK provides the");
    console.log("tool schema; the host wires it to route calls by server name.\n");
    console.log(JSON.stringify(READ_RESOURCE_TOOL, null, 2));

    // -----------------------------------------------------------------------
    // 2. Discover skills via skill://index.json (SEP enumeration)
    // -----------------------------------------------------------------------
    header("2. listSkillsFromIndex() — skill://index.json Discovery");

    console.log("Per the SEP, servers whose skill set is enumerable SHOULD expose");
    console.log("a skill://index.json resource following the Agent Skills discovery format.\n");

    const indexSkills = await listSkillsFromIndex(client);
    if (indexSkills) {
      console.log(`Found ${indexSkills.length} skill(s) in index:\n`);
      for (const skill of indexSkills) {
        console.log(`  Name:        ${skill.name}`);
        console.log(`  Skill Path:  ${skill.skillPath}`);
        console.log(`  URI:         ${skill.uri}`);
        console.log(`  Description: ${skill.description}`);
        console.log();
      }
    } else {
      console.log("Server does not expose skill://index.json (enumeration is optional)");
    }

    // -----------------------------------------------------------------------
    // 3. List all skills via resources/list — show multi-segment paths
    // -----------------------------------------------------------------------
    header("3. listSkills() — Discover Skills via resources/list");

    const skills = await listSkills(client);
    console.log(`Found ${skills.length} skill(s):\n`);

    for (const skill of skills) {
      const hasPrefix = skill.name !== skill.skillPath;
      console.log(`  URI:         ${skill.uri}`);
      console.log(`  Name:        ${skill.name} (= final path segment)`);
      console.log(`  Skill Path:  ${skill.skillPath}`);
      if (hasPrefix) {
        const prefix = skill.skillPath.slice(0, skill.skillPath.lastIndexOf("/"));
        console.log(`  Prefix:      ${prefix} (organizational, server-chosen)`);
      }
      console.log(`  Description: ${skill.description}`);
      console.log();
    }

    subheader("Plain-text summary (for context injection)");
    console.log(buildSkillsSummary(skills));

    // -----------------------------------------------------------------------
    // 4. Read a multi-segment skill
    // -----------------------------------------------------------------------
    header("4. readSkillContent() — Load Multi-Segment Skill");

    const refundSkill = skills.find((s) => s.skillPath === "acme/billing/refunds");
    if (refundSkill) {
      console.log(`Reading: ${refundSkill.uri}\n`);
      const content = await readSkillContent(client, refundSkill.skillPath);
      // Show first 20 lines
      const lines = content.split("\n");
      console.log(lines.slice(0, 20).join("\n"));
      if (lines.length > 20) {
        console.log(`\n... (${lines.length - 20} more lines)`);
      }
    } else {
      console.log("(acme/billing/refunds skill not found)");
    }

    // -----------------------------------------------------------------------
    // 5. Read skill manifest
    // -----------------------------------------------------------------------
    header("5. readSkillManifest() — File Inventory");

    if (refundSkill) {
      const manifest = await readSkillManifest(client, refundSkill.skillPath);
      console.log(`Skill:     ${manifest.skill}`);
      console.log(`Path:      ${manifest.skillPath}`);
      console.log(`Files (${manifest.files.length}):\n`);
      for (const file of manifest.files) {
        console.log(
          `  ${file.path.padEnd(40)} ${file.size.toString().padStart(6)} bytes  ${file.hash}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 6. Read a supporting file via resource template
    // -----------------------------------------------------------------------
    header("6. readSkillDocument() — Supporting File");

    if (refundSkill) {
      const docPath = "templates/refund-email-template.md";
      console.log(
        `Reading: ${buildSkillUri(refundSkill.skillPath, docPath)}\n`,
      );
      const doc = await readSkillDocument(
        client,
        refundSkill.skillPath,
        docPath,
      );
      if (doc.text) {
        const lines = doc.text.split("\n");
        console.log(lines.slice(0, 15).join("\n"));
        if (lines.length > 15) {
          console.log(`\n... (${lines.length - 15} more lines)`);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    header("Demo Complete");

    console.log("Features demonstrated:");
    console.log("  [SEP]      Skills Extension — skill:// resource convention");
    console.log("  [SEP]      Multi-segment paths (prefix + name = last segment)");
    console.log("  [SEP]      skill://index.json — well-known discovery index");
    console.log("  [SEP-2133] Extension declaration: io.modelcontextprotocol/skills");
    console.log();
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
