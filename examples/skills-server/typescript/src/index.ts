#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Server
 *
 * Demonstrates the SEP-2640 `skill://index.json` index, whose entries are
 * type-less: each carries the skill's verbatim `frontmatter` plus a `url`
 * (with `digest`) and/or an `archives` array. This server exposes both
 * forms:
 *
 *   - individually-served file skills (entry has `url` + `digest`)
 *   - an archive distribution (entry has an `archives` array)
 *
 * Plus the SEP-2640 capability declaration (`io.modelcontextprotocol/skills`
 * with `directoryRead: true`), the `resources/directory/read` method for
 * enumerating skill directories, and multi-segment skill paths.
 *
 * Resource layout:
 *   skill://index.json                                — discovery index
 *   skill://code-review/SKILL.md                      — file skill (single segment)
 *   skill://git-commit-review/SKILL.md                — file skill
 *   skill://acme/onboarding/SKILL.md                  — file skill (multi-segment)
 *   skill://acme/billing/refunds/SKILL.md             — file skill (multi-segment)
 *   skill://pdf-processing.tar.gz                     — archive distribution
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
  `[skills-server] Discovered ${skillMap.size} file skill(s) in ${skillsDir}`,
);
for (const [skillPath, skill] of skillMap) {
  console.error(`  - skill://${skillPath}/SKILL.md (name: "${skill.name}")`);
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
// Create MCP server and declare the extension (SEP-2640)
// ---------------------------------------------------------------------------

// Server `instructions` is the SEP's third discovery path — a host MAY mine
// it for skill URIs the server explicitly names (separate from the index).
// We name git-commit-review here as a demo URI; it would also still appear
// via the index, which is fine: the client dedups by URI.
const serverInstructions = [
  "This server exposes Agent Skills under the skill:// scheme.",
  "When reviewing a commit, read skill://git-commit-review/SKILL.md first.",
].join("\n");

const server = new McpServer(
  { name: "skills-sep-example", version: "0.1.0" },
  { capabilities: { resources: {} }, instructions: serverInstructions },
);
// Declare the extension and advertise the directory-read capability. This
// MUST happen before connect() — capabilities ship in the initialize
// handshake — and is paired with `directoryRead: true` below.
declareSkillsExtension(server.server, { directoryRead: true });

// ---------------------------------------------------------------------------
// Register all resources via the SDK
// ---------------------------------------------------------------------------

registerSkillResources(server, skillMap, skillsDir, {
  template: true,
  // Implement resources/directory/read so hosts can enumerate skill dirs.
  directoryRead: true,
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
});

console.error(
  "[skills-server] Extension: io.modelcontextprotocol/skills (directoryRead: true)",
);
console.error(
  `[skills-server] Index will list: ${skillMap.size} file skill(s) + ${
    archivePath ? 1 : 0
  } archive entry`,
);

// ---------------------------------------------------------------------------
// Connect via stdio
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skills-server] Connected via stdio");
