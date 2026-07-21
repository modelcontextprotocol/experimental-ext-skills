// Client-side prototype for issue #66: discover and load skill:// resources
// from a connected MCP server, per the merged SEP-2640 draft
// (docs/sep-draft-skills-extension.md). Connects to ./server.mjs over stdio.
//
// Demonstrates:
//   1. Capability declaration check (initialize result).
//   2. Discovery via resources/list (skill:// resources appear as ordinary
//      resources, no special method required).
//   3. Discovery via the well-known skill://index.json resource.
//   4. Loading via resources/read, including resolving a relative reference
//      from a SKILL.md body to a sub-resource sibling.
//   5. Baseline direct-read: a skill URI that was never enumerated anywhere
//      is still readable if the model/user already has it.
//   6. A simulated "inject into model context" step, since this prototype
//      has no live LLM call.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SKILLS_CAPABILITY = "io.modelcontextprotocol/skills";
const here = dirname(fileURLToPath(import.meta.url));

function resolveRelativeReference(skillUri, relative) {
  const withoutFile = skillUri.slice(0, skillUri.lastIndexOf("/"));
  return `${withoutFile}/${relative}`;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(here, "server.mjs")],
  });
  const client = new Client({ name: "issue-66-discovery-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  section("1. Capability declaration");
  const serverCapabilities = client.getServerCapabilities();
  const declaresSkills = Boolean(serverCapabilities?.extensions?.[SKILLS_CAPABILITY]);
  console.log(`Server advertises "${SKILLS_CAPABILITY}":`, declaresSkills);

  section("2. Discovery via resources/list");
  const { resources } = await client.listResources();
  for (const r of resources) console.log(`  ${r.uri}${r.uri === "skill://index.json" ? "  (well-known index)" : ""}`);

  section("3. Discovery via skill://index.json");
  const indexRead = await client.readResource({ uri: "skill://index.json" });
  const index = JSON.parse(indexRead.contents[0].text);
  console.log(`Index lists ${index.skills.length} skill(s):`);
  for (const entry of index.skills) console.log(`  - ${entry.name}: ${entry.description}  (${entry.url})`);

  section("4. Loading: resources/read for each indexed skill");
  const loaded = [];
  for (const entry of index.skills) {
    const { contents } = await client.readResource({ uri: entry.url });
    const text = contents[0].text;
    loaded.push({ name: entry.name, description: entry.description, uri: entry.url, text });
    console.log(`  Loaded ${entry.url} (${text.length} chars)`);
  }

  section("5. Loading a sub-resource via a relative reference");
  const refunds = loaded.find((s) => s.name === "refunds");
  const relativeRefMatch = /`(templates\/[\w.-]+)`/.exec(refunds.text);
  const relativeRef = relativeRefMatch[1];
  const subResourceUri = resolveRelativeReference(refunds.uri, relativeRef);
  console.log(`  refunds/SKILL.md references "${relativeRef}" -> resolved to ${subResourceUri}`);
  const subResource = await client.readResource({ uri: subResourceUri });
  console.log(`  Loaded ${subResourceUri} (${subResource.contents[0].text.length} chars)`);

  section("6. Baseline direct-read (never enumerated anywhere)");
  const hiddenUri = "skill://hidden-skill/SKILL.md";
  const wasListed = resources.some((r) => r.uri === hiddenUri) || index.skills.some((e) => e.url === hiddenUri);
  console.log(`  "${hiddenUri}" appeared in resources/list or the index:`, wasListed);
  const hidden = await client.readResource({ uri: hiddenUri });
  console.log(`  resources/read succeeded anyway (${hidden.contents[0].text.length} chars) -- confirms`);
  console.log(`  "hosts MUST NOT treat empty/absent enumeration as proof of absence" (SEP-2640 §Discovery).`);

  section("7. Simulated model-context injection");
  console.log("A host would load frontmatter (name + description) of discovered skills into context, e.g.:\n");
  for (const entry of index.skills) {
    console.log(`  <skill name="${entry.name}" uri="${entry.url}">${entry.description}</skill>`);
  }
  console.log("\nThe model then calls a read_resource(server, uri) tool with a concrete URI when a skill applies.");

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
