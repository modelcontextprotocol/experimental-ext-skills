#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Server
 *
 * Demonstrates all three SEP-2640 entry types in `skill://index.json`:
 *
 *   - `skill-md`             — individually-served file skills
 *   - `archive`              — single packed resource (.tar.gz)
 *   - `mcp-resource-template`— parameterized skill namespace
 *
 * Plus the SEP-2133 capability declaration
 * (`io.modelcontextprotocol/skills`) and multi-segment skill paths.
 *
 * Resource layout:
 *   skill://index.json                                — discovery index
 *   skill://code-review/SKILL.md                      — file skill (single segment)
 *   skill://git-commit-review/SKILL.md                — file skill
 *   skill://acme/onboarding/SKILL.md                  — file skill (multi-segment)
 *   skill://acme/billing/refunds/SKILL.md             — file skill (multi-segment)
 *   skill://pdf-processing.tar.gz                     — archive distribution
 *   skill://docs/{product}/SKILL.md                   — resource template
 *
 * @license Apache-2.0
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  discoverSkills,
  registerSkillResources,
  declareSkillsExtension,
} from "@modelcontextprotocol/experimental-ext-skills/server";

import { packTarGz } from "./pack-archive.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
});

// Default to the bundled sample-skills directory if no path is provided.
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../../../sample-skills");
const archiveSourceDir = path.resolve(
  __dirname,
  "../../../sample-archive-source",
);

// ---------------------------------------------------------------------------
// Discover individually-served skills
// ---------------------------------------------------------------------------

const skillMap = discoverSkills(skillsDir);
console.error(
  `[skills-server] Discovered ${skillMap.size} file skill(s) in ${skillsDir}:`,
);
for (const [skillPath, skill] of skillMap) {
  const fileCount = skill.manifest.files.length;
  console.error(
    `  - skill://${skillPath}/SKILL.md (name: "${skill.name}") — ${fileCount} file(s)`,
  );
}

// ---------------------------------------------------------------------------
// Build the archive-distributed skill (pdf-processing.tar.gz)
// ---------------------------------------------------------------------------

const pdfSourceDir = path.join(archiveSourceDir, "pdf-processing");
let archivePath: string | undefined;
if (fs.existsSync(pdfSourceDir)) {
  const archiveBytes = await packTarGz(pdfSourceDir);
  // Write to a tempfile so registerSkillResources() can mmap it via fs.readFileSync().
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "skills-sep-example-archive-"),
  );
  archivePath = path.join(tmpDir, "pdf-processing.tar.gz");
  fs.writeFileSync(archivePath, archiveBytes);
  console.error(
    `[skills-server] Packed pdf-processing → ${archivePath} (${archiveBytes.length} bytes)`,
  );
} else {
  console.error(
    `[skills-server] (no archive source at ${pdfSourceDir}; skipping archive demo)`,
  );
}

// ---------------------------------------------------------------------------
// Create MCP server and declare extension per SEP-2133
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "skills-sep-example", version: "0.1.0" },
  { capabilities: { resources: {} } },
);
declareSkillsExtension(server.server);

// ---------------------------------------------------------------------------
// Register all resource types via the SDK
// ---------------------------------------------------------------------------

registerSkillResources(server, skillMap, skillsDir, {
  template: true,
  promptXml: true,
  // Archive entry — single resource that unpacks to skill://pdf-processing/
  archives: archivePath
    ? [
        {
          name: "pdf-processing",
          description:
            "Extract text and form data from PDFs, fill PDF forms, and merge multi-page documents.",
          skillPath: "pdf-processing",
          archivePath,
          // format inferred from .tar.gz extension
        },
      ]
    : [],
  // Resource-template entry — parameterized namespace
  templates: [
    {
      name: "docs",
      description:
        "Per-product documentation skill (template — bind {product} via the completion API)",
      uriTemplate: "skill://docs/{product}/SKILL.md",
    },
  ],
});

console.error("[skills-server] Extension: io.modelcontextprotocol/skills");
console.error(
  `[skills-server] Index will list: ${skillMap.size} skill-md + ${
    archivePath ? 1 : 0
  } archive + 1 mcp-resource-template entry`,
);

// ---------------------------------------------------------------------------
// Connect via stdio
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-server] Connected via stdio");
