#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Client
 *
 * Walks through the client-side surface of SEP-2640 against the bundled
 * skills-server example:
 *
 *   1. READ_RESOURCE_TOOL                 — host-provided tool schema
 *   2. listSkillsFromIndex()              — `skill://index.json` discovery
 *      - includes both `skill-md` and `archive` entries
 *   3. listSkillTemplatesFromIndex()      — `mcp-resource-template` entries
 *   4. listSkills()                       — fallback via `resources/list`
 *   5. readSkillContent()                 — read an individual SKILL.md
 *   6. readSkillArchive()                 — fetch + safely unpack a .tar.gz
 *   7. readSkillManifest() / readSkillDocument() — supporting-file flows
 *
 * Connects to the skills-server via stdio (spawns it as a child process).
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
  listSkillTemplatesFromIndex,
  readSkillContent,
  readSkillArchive,
  readSkillManifest,
  readSkillDocument,
  buildSkillsSummary,
} from "@modelcontextprotocol/experimental-ext-skills/client";
import { buildSkillUri } from "@modelcontextprotocol/experimental-ext-skills";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function header(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

function subheader(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

function preview(text: string, maxLines: number): void {
  const lines = text.split("\n");
  console.log(lines.slice(0, maxLines).join("\n"));
  if (lines.length > maxLines) {
    console.log(`\n... (${lines.length - maxLines} more lines)`);
  }
}

async function main(): Promise<void> {
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
    // 1. Host-provided read_resource tool
    // -----------------------------------------------------------------------
    header("1. READ_RESOURCE_TOOL — Host Tool for Model-Driven Loading");
    console.log(
      "Per SEP-2640 §Hosts, hosts SHOULD expose a generic resource-reading",
    );
    console.log("tool so the model can load skill content (and supporting");
    console.log("files) on demand. The SDK provides the tool schema; the host");
    console.log("wires it to route calls by server name.\n");
    console.log(JSON.stringify(READ_RESOURCE_TOOL, null, 2));

    // -----------------------------------------------------------------------
    // 2. skill://index.json — covers all entry types
    // -----------------------------------------------------------------------
    header("2. listSkillsFromIndex() — skill://index.json Discovery");
    const indexSkills = await listSkillsFromIndex(client);
    if (!indexSkills) {
      console.log(
        "Server does not expose skill://index.json (enumeration is optional)",
      );
    } else {
      console.log(`Found ${indexSkills.length} skill(s) in index:\n`);
      for (const s of indexSkills) {
        console.log(`  Name:        ${s.name}`);
        console.log(`  Type:        ${s.type ?? "skill-md"}`);
        console.log(`  Skill Path:  ${s.skillPath}`);
        console.log(`  URI:         ${s.uri}`);
        console.log(`  Description: ${s.description}`);
        console.log();
      }
    }

    // -----------------------------------------------------------------------
    // 3. Resource templates (third SEP entry type)
    // -----------------------------------------------------------------------
    header("3. listSkillTemplatesFromIndex() — mcp-resource-template entries");
    const templates = await listSkillTemplatesFromIndex(client);
    if (!templates || templates.length === 0) {
      console.log("(no template entries in this server's index)");
    } else {
      console.log(`Found ${templates.length} template(s):\n`);
      for (const t of templates) {
        console.log(`  Name:         ${t.name ?? "(unnamed)"}`);
        console.log(`  URI Template: ${t.uriTemplate}`);
        console.log(`  Description:  ${t.description}`);
        console.log();
      }
      console.log(
        "Hosts wire {variables} in the template to the MCP completion API",
      );
      console.log(
        "so users can interactively browse parameterized skill namespaces.",
      );
    }

    // -----------------------------------------------------------------------
    // 4. Fallback path — resources/list
    // -----------------------------------------------------------------------
    header("4. listSkills() — Fallback via resources/list");
    const listed = await listSkills(client);
    console.log(`Found ${listed.length} skill(s) via resources/list:\n`);
    for (const s of listed) {
      const hasPrefix = s.name !== s.skillPath;
      console.log(`  ${s.uri}`);
      console.log(`    name=${s.name}${hasPrefix ? `  path=${s.skillPath}` : ""}`);
    }
    subheader("buildSkillsSummary() — plain-text catalog for context injection");
    console.log(buildSkillsSummary(listed));

    // -----------------------------------------------------------------------
    // 5. Read a multi-segment skill (skill-md path)
    // -----------------------------------------------------------------------
    header("5. readSkillContent() — Load a Multi-Segment skill-md Skill");
    const refundSkill = listed.find(
      (s) => s.skillPath === "acme/billing/refunds",
    );
    if (refundSkill) {
      console.log(`Reading: ${refundSkill.uri}\n`);
      const content = await readSkillContent(client, refundSkill.skillPath);
      preview(content, 20);
    } else {
      console.log("(acme/billing/refunds skill not found)");
    }

    // -----------------------------------------------------------------------
    // 6. Archive distribution — fetch + safely unpack
    // -----------------------------------------------------------------------
    header("6. readSkillArchive() — Fetch + Unpack archive distribution");
    const archiveSkill = (indexSkills ?? []).find((s) => s.type === "archive");
    if (archiveSkill) {
      console.log(`Archive URI: ${archiveSkill.uri}`);
      console.log(`Post-unpack skill path: skill://${archiveSkill.skillPath}/\n`);
      const archive = await readSkillArchive(client, archiveSkill.uri);
      console.log(
        `Unpacked ${archive.files.size} file(s), ${archive.totalSize} bytes total:`,
      );
      for (const filePath of [...archive.files.keys()].sort()) {
        const size = archive.files.get(filePath)!.length;
        console.log(`  ${filePath.padEnd(40)} ${size.toString().padStart(6)} bytes`);
      }
      subheader("Unpacked SKILL.md (first 15 lines)");
      preview(archive.files.get("SKILL.md")!.toString("utf-8"), 15);
    } else {
      console.log("(no archive entries in this server's index)");
    }

    // -----------------------------------------------------------------------
    // 7. Manifest + supporting file (per-resource template flow)
    // -----------------------------------------------------------------------
    header("7. readSkillManifest() + readSkillDocument()");
    if (refundSkill) {
      const manifest = await readSkillManifest(client, refundSkill.skillPath);
      console.log(`Files (${manifest.files.length}):\n`);
      for (const f of manifest.files) {
        console.log(
          `  ${f.path.padEnd(40)} ${f.size.toString().padStart(6)} bytes  ${f.hash}`,
        );
      }

      const docPath = "templates/refund-email-template.md";
      subheader(`Reading ${buildSkillUri(refundSkill.skillPath, docPath)}`);
      const doc = await readSkillDocument(
        client,
        refundSkill.skillPath,
        docPath,
      );
      if (doc.text) preview(doc.text, 15);
    }

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    header("Demo Complete");
    console.log("Demonstrated SEP-2640 features:");
    console.log("  [SEP-2133]  Extension declaration (io.modelcontextprotocol/skills)");
    console.log("  [SEP-2640]  skill:// URI scheme + multi-segment paths");
    console.log("  [SEP-2640]  skill://index.json discovery");
    console.log("  [SEP-2640]  All three entry types: skill-md, archive, mcp-resource-template");
    console.log("  [SEP-2640]  Archive fetch + safe unpack (.tar.gz, archive safety)");
    console.log("  [Hosts]     read_resource tool surface + supporting-file flow");
    console.log();
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
