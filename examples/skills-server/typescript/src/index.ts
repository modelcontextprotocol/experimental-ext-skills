#!/usr/bin/env node
/**
 * Skills Extension SEP — Reference MCP Server (SEP-2640 v1)
 *
 * Demonstrates the v1 protocol surface:
 *
 *   - `skills/list` — paginated enumeration of skill entries, each carrying
 *     the skill's verbatim `frontmatter` and a complete per-file `resources`
 *     manifest (`{uri, digest}` for SKILL.md and every supporting file)
 *   - `skills/get` — single-skill entry retrieval by URI
 *   - `resources/directory/read` — optional directory enumeration, gated
 *     behind the `directoryRead` capability setting
 *   - capability declaration `io.modelcontextprotocol/skills`
 *   - multi-segment skill paths (`acme/billing/refunds`)
 *
 * A skill is always retrieved as individually addressable resources —
 * archive distribution was removed from the SEP during core-maintainer
 * review (see the SEP's "Appendix: Deferred Features").
 *
 * Resource layout:
 *   skill://code-review/SKILL.md                      — file skill (single segment)
 *   skill://git-commit-review/SKILL.md                — file skill
 *   skill://pdf-processing/SKILL.md                   — file skill with references/
 *   skill://acme/onboarding/SKILL.md                  — file skill (multi-segment)
 *   skill://acme/billing/refunds/SKILL.md             — file skill (multi-segment)
 *
 * @license Apache-2.0
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  discoverSkills,
  registerSkillResources,
} from "@modelcontextprotocol/experimental-ext-skills/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
});

// Default to the bundled sample-skills directory if no path is provided.
const skillsDir = positionals[0]
  ? path.resolve(positionals[0])
  : path.resolve(__dirname, "../../../sample-skills");

// ---------------------------------------------------------------------------
// Discover skills (per-file digests computed at discovery time)
// ---------------------------------------------------------------------------

const skillMap = discoverSkills(skillsDir);
console.error(
  `[skills-server] Discovered ${skillMap.size} skill(s) in ${skillsDir}`,
);
for (const [skillPath, skill] of skillMap) {
  console.error(
    `  - skill://${skillPath}/SKILL.md (name: "${skill.name}", ${
      1 + skill.documents.length
    } file(s))`,
  );
}

// ---------------------------------------------------------------------------
// Serve via stdio, both protocol eras (SEP-2640 v1 on MCP 2026-07-28)
// ---------------------------------------------------------------------------

// Server `instructions` may name specific skill URIs — a host confirms each
// via `skills/get` (the server answers for skills it serves and errors
// otherwise). git-commit-review also appears in the skills/list result; the
// client dedups by URI.
const serverInstructions = [
  "This server exposes Agent Skills under the skill:// scheme.",
  "When reviewing a commit, read skill://git-commit-review/SKILL.md first.",
].join("\n");

// serveStdio owns the era decision: a client probing with `server/discover`
// gets the 2026-07-28 ("modern") era; a client opening with `initialize`
// gets a 2025-era connection from the same factory. The factory builds one
// server per connection, and registerSkillResources runs before the
// connection serves anything — capabilities reach the client via
// `server/discover` (modern) or the `initialize` result (legacy).
serveStdio(({ era }) => {
  const server = new McpServer(
    { name: "skills-sep-example", version: "0.2.0" },
    { capabilities: { resources: {} }, instructions: serverInstructions },
  );

  registerSkillResources(server, skillMap, skillsDir, {
    template: true,
    // Implement resources/directory/read so hosts can enumerate skill dirs;
    // this also flips directoryRead: true in the capability declaration.
    directoryRead: true,
    // SEP-2549 list-caching attributes on skills/list results (emitted on
    // 2026-07-28+ connections only, per the SEP): this catalog is static
    // filesystem content with nothing user-specific, so it may be cached
    // for a minute and shared across authorization contexts.
    ttlMs: 60_000,
    cacheScope: "public",
  });

  console.error(`[skills-server] Serving a ${era}-era connection`);
  return server;
});

console.error(
  "[skills-server] Extension: io.modelcontextprotocol/skills (directoryRead: true)",
);
console.error(
  `[skills-server] skills/list will serve ${skillMap.size} entr${
    skillMap.size === 1 ? "y" : "ies"
  }; skills/get answers for each by URI`,
);
console.error("[skills-server] Listening on stdio (2026-07-28 + legacy)");
