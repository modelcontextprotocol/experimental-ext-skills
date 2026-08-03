#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Client (SEP-2640 v1)
 *
 * Walks through the client-side surface of the v1 SEP against the bundled
 * skills-server example:
 *
 *   1. READ_RESOURCE_TOOL                 — host-provided tool schema
 *   2. listSkills()                       — skills/list enumeration (paginated)
 *   3. getSkill()                         — skills/get single-entry retrieval
 *   4. readSkill()                        — digest-verified SKILL.md read
 *                                           + frontmatter identity check
 *   5. readSkillResource()                — verified supporting-file read;
 *                                           unlisted files fail verification
 *   6. readDirectory() / walkDirectory()  — resources/directory/read
 *   7. Server instructions                — URIs confirmed via skills/get
 *   8. discoverAndBuildCatalog()          — system-prompt catalog
 *
 * Connects to the skills-server via stdio (spawns it as a child process).
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  READ_RESOURCE_TOOL,
  serverSupportsSkills,
  serverSupportsDirectoryRead,
  listSkills,
  getSkill,
  readSkill,
  readSkillResource,
  readDirectory,
  walkDirectory,
  discoverAndBuildCatalog,
  extractSkillUrisFromInstructions,
  skillSummariesFromEntries,
  buildSkillsSummary,
} from "@modelcontextprotocol/experimental-ext-skills/client";

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

  const client = new Client({
    name: "skills-sep-example-client",
    version: "0.2.0",
  });

  await client.connect(transport);
  console.log("Connected!\n");

  try {
    // -----------------------------------------------------------------------
    // 0. Capability declaration
    // -----------------------------------------------------------------------
    header("0. Capability declaration — io.modelcontextprotocol/skills");
    console.log(
      `serverSupportsSkills:        ${serverSupportsSkills(client)}`,
    );
    console.log(
      `serverSupportsDirectoryRead: ${serverSupportsDirectoryRead(client)}`,
    );
    console.log(
      "\nDeclaring the extension commits the server to skills/list and",
    );
    console.log(
      "skills/get; resources/directory/read is additionally gated on the",
    );
    console.log("directoryRead capability setting.");

    // -----------------------------------------------------------------------
    // 1. Host-provided read_resource tool
    // -----------------------------------------------------------------------
    header("1. READ_RESOURCE_TOOL — Host Tool for Model-Driven Loading");
    console.log(
      "Per SEP-2640 §Hosts, hosts expose a generic resource-reading tool so",
    );
    console.log("the model can load skill content (and supporting files) on");
    console.log("demand. The SDK provides the tool schema; the host wires it");
    console.log("to route calls by server name.\n");
    console.log(JSON.stringify(READ_RESOURCE_TOOL, null, 2));

    // -----------------------------------------------------------------------
    // 2. skills/list — paginated enumeration of entries
    // -----------------------------------------------------------------------
    header("2. listSkills() — skills/list Enumeration");
    const skills = await listSkills(client);
    console.log(`Server listed ${skills.length} skill(s):\n`);
    for (const entry of skills) {
      console.log(`  URI:         ${entry.uri}`);
      console.log(`  Name:        ${String(entry.frontmatter.name)}`);
      console.log(`  Description: ${String(entry.frontmatter.description)}`);
      console.log(`  Files:       ${entry.resources?.length ?? "(no manifest)"}`);
      console.log();
    }
    console.log(
      "Each entry carries the verbatim SKILL.md frontmatter and a complete",
    );
    console.log(
      "resources manifest — {uri, digest} for SKILL.md and every supporting",
    );
    console.log(
      "file. The manifest is what a host verifies reads against and what a",
    );
    console.log("user's approval content-binds to.");

    subheader("buildSkillsSummary() — plain-text catalog for context injection");
    console.log(buildSkillsSummary(skillSummariesFromEntries(skills)));

    // -----------------------------------------------------------------------
    // 3. skills/get — single-entry retrieval by URI
    // -----------------------------------------------------------------------
    header("3. getSkill() — skills/get Retrieval by URI");
    const refundsUri = "skill://acme/billing/refunds/SKILL.md";
    const refunds = await getSkill(client, refundsUri);
    console.log(`Entry for ${refundsUri}:\n`);
    console.log(JSON.stringify(refunds, null, 2));
    console.log(
      "\nskills/get answers for every skill the server serves — including",
    );
    console.log(
      "skills absent from a partial listing — so an unlisted skill can be",
    );
    console.log("verified and content-bound on the same terms as a listed one.");

    subheader("skills/get for a non-skill URI errors (-32602)");
    try {
      await getSkill(client, "skill://not-a-skill/SKILL.md");
      console.log("UNEXPECTED: server answered for a non-skill URI");
    } catch (err) {
      console.log(
        `Server correctly rejected it: ${err instanceof Error ? err.message : err}`,
      );
    }

    // -----------------------------------------------------------------------
    // 4. Verified SKILL.md read
    // -----------------------------------------------------------------------
    header("4. readSkill() — Digest-Verified Read + Frontmatter Identity");
    console.log(`Reading ${refunds.uri} verified against its entry...\n`);
    const content = await readSkill(client, refunds);
    preview(content, 15);
    console.log(
      "\nreadSkill() verified the SHA-256 digest of the fetched bytes against",
    );
    console.log(
      "the manifest and compared the parsed frontmatter field-by-field with",
    );
    console.log(
      "the entry's frontmatter — both MUSTs for hosts under SEP-2640.",
    );

    // -----------------------------------------------------------------------
    // 5. Verified supporting-file read + unlisted-file rule
    // -----------------------------------------------------------------------
    header("5. readSkillResource() — Manifest-Bound Supporting Files");
    const templateUri = refunds.resources?.find((r) =>
      r.uri.includes("templates/"),
    )?.uri;
    if (templateUri) {
      console.log(`Reading listed file: ${templateUri}\n`);
      const doc = await readSkillResource(client, refunds, templateUri);
      if (doc.text) preview(doc.text, 10);
    }

    subheader("Reading an unlisted file fails verification");
    try {
      await readSkillResource(
        client,
        refunds,
        "skill://acme/billing/refunds/templates/never-listed.md",
      );
      console.log("UNEXPECTED: unlisted read succeeded");
    } catch (err) {
      console.log(`${err instanceof Error ? err.message : err}`);
    }

    // -----------------------------------------------------------------------
    // 6. resources/directory/read — enumerate a skill directory
    // -----------------------------------------------------------------------
    header("6. readDirectory() — resources/directory/read enumeration");
    if (!serverSupportsDirectoryRead(client)) {
      console.log(
        "(server did not declare the directoryRead capability — skipping)",
      );
    } else {
      const refundsRoot = "skill://acme/billing/refunds";
      console.log(`Listing ${refundsRoot} (metadata only, non-recursive):\n`);
      const { resources } = await readDirectory(client, refundsRoot);
      for (const child of resources) {
        const kind = child.mimeType === "inode/directory" ? "dir " : "file";
        console.log(`  [${kind}] ${child.name}  (${child.uri})`);
      }

      subheader("walkDirectory() — recurse to list every descendant file");
      const files = await walkDirectory(client, refundsRoot);
      for (const f of files.sort((a, b) => a.uri.localeCompare(b.uri))) {
        console.log(`  ${f.uri}`);
      }
    }

    // -----------------------------------------------------------------------
    // 7. Server instructions — explicit references confirmed via skills/get
    // -----------------------------------------------------------------------
    header("7. Server instructions — URIs confirmed via skills/get");
    const serverInstructions = client.getInstructions();
    console.log(`Server instructions:\n${serverInstructions ?? "(none)"}\n`);
    const namedUris = extractSkillUrisFromInstructions(serverInstructions);
    console.log(
      `URIs the server names in instructions: ${
        namedUris.length ? namedUris.join(", ") : "(none)"
      }`,
    );
    console.log(
      "\nPer SEP-2640 no URI scheme is privileged: a host confirms an",
    );
    console.log(
      "explicitly referenced URI is a skill by asking the server (skills/get),",
    );
    console.log("never by inspecting the scheme.");

    // -----------------------------------------------------------------------
    // 8. discoverAndBuildCatalog — system-prompt catalog
    // -----------------------------------------------------------------------
    header("8. discoverAndBuildCatalog() — system-prompt catalog");
    // Two opt-ins on top of the SEP-prescribed defaults:
    //   - `instructions: true` mines server instructions, confirming each
    //     URI via skills/get and merging entries (deduplicated by URI)
    //   - `serverInEntries: true` injects <server> per <skill> entry, the
    //     host SKILL.md's recommended placement for the model to copy
    //     alongside the URI when calling a (server, uri) reader tool.
    const { skills: catalogSkills, catalog } = await discoverAndBuildCatalog(
      client,
      {
        serverName: "skills-sep-example",
        instructions: true,
        serverInEntries: true,
      },
    );
    console.log(
      `Catalog covers ${catalogSkills.length} skill(s) (listing + instructions).\n`,
    );
    preview(catalog, 30);

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    header("Demo Complete");
    console.log("Demonstrated SEP-2640 v1 features:");
    console.log("  [SEP-2640]  Extension declaration (io.modelcontextprotocol/skills)");
    console.log("  [SEP-2640]  skills/list enumeration (verbatim frontmatter, per-file digests)");
    console.log("  [SEP-2640]  skills/get single-entry retrieval (+ -32602 for non-skills)");
    console.log("  [SEP-2640]  Digest verification + frontmatter identity check");
    console.log("  [SEP-2640]  Unlisted-file reads treated as verification failures");
    console.log("  [SEP-2640]  resources/directory/read (directoryRead capability setting)");
    console.log("  [SEP-2640]  skill:// URI scheme + multi-segment paths");
    console.log("  [Hosts]     read_resource tool surface + per-entry <server> in catalog");
    console.log();
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
