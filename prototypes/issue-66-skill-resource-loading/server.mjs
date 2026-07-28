// Minimal MCP server implementing the SEP-2640 "Skills Extension" resource
// mapping (docs/sep-draft-skills-extension.md in this repo), used as the test
// fixture for issue #66 (client-side skill:// resource discovery/loading).
//
// Skill content is inlined rather than read from disk: this prototype is about
// the transport binding (path -> skill:// URI, index, read semantics), not
// about filesystem loading.
//
// Three skills are served:
//   - git-workflow          flat skill-path, listed + enumerated
//   - acme/billing/refunds  nested skill-path + a sub-resource, listed +
//                           enumerated
//   - hidden-skill          deliberately absent from BOTH resources/list AND
//                           skill://index.json, to prove direct
//                           resources/read still works for a URI the client
//                           never saw enumerated anywhere
//
// Uses the low-level Server rather than McpServer.registerResource() so
// listing and reading can be controlled independently -- registerResource()
// auto-lists anything registered through it, which cannot express the
// hidden-skill case.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

const SKILLS_CAPABILITY = "io.modelcontextprotocol/skills";

const SKILLS = [
  {
    skillPath: "git-workflow",
    listed: true,
    files: {
      "SKILL.md": `---
name: git-workflow
description: Follow this team's Git conventions for branching and commits.
---

# Git Workflow

Branch names: \`type/short-description\` (e.g. \`fix/login-timeout\`).
Commit messages: imperative mood, under 72 chars for the summary line.
Never force-push to \`main\`.
`,
    },
  },
  {
    skillPath: "acme/billing/refunds",
    listed: true,
    files: {
      "SKILL.md": `---
name: refunds
description: Process customer refund requests per company policy.
---

# Refund Handling

1. Verify the order is within the 30-day window.
2. Check \`templates/email.md\` for the customer-facing wording.
3. Refunds over $500 require manager approval.
`,
      "templates/email.md": `# Refund Notification Template

Subject: Your refund has been processed

Your refund of {{amount}} for order {{order_id}} has been processed and
should appear on your statement within 5-7 business days.
`,
    },
  },
  {
    skillPath: "hidden-skill",
    listed: false,
    files: {
      "SKILL.md": `---
name: hidden-skill
description: Deliberately omitted from enumeration to test baseline direct-read.
---

# Hidden Skill

If you can read this, your client correctly treated a \`skill://\` URI as
directly readable via \`resources/read\` even though it never appeared in
\`skill://index.json\` or in resources/list.
`,
    },
  },
];

function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return {};
  const result = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const sep = rawLine.indexOf(":");
    if (sep === -1) continue;
    result[rawLine.slice(0, sep).trim()] = rawLine.slice(sep + 1).trim();
  }
  return result;
}

const mimeTypeFor = (path) => (path.endsWith(".md") ? "text/markdown" : "text/plain");

// SEP-2640 §Resource Mapping: the final <skill-path> segment MUST equal the
// frontmatter `name`, so the name is recoverable from the URI alone.
function describeSkill(skill) {
  const frontmatter = parseFrontmatter(skill.files["SKILL.md"]);
  const finalSegment = skill.skillPath.split("/").pop();
  if (frontmatter.name !== finalSegment) {
    throw new Error(
      `Skill at "${skill.skillPath}" declares name "${frontmatter.name}", but the ` +
        `final skill-path segment MUST equal it (SEP-2640 §Resource Mapping).`
    );
  }
  return { name: frontmatter.name, description: frontmatter.description };
}

async function main() {
  // Every file by URI -- what resources/read consults, including hidden-skill.
  const filesByUri = new Map();
  // Only skills marked listed -- what resources/list advertises.
  const listedResources = [];

  for (const skill of SKILLS) {
    const { name, description } = describeSkill(skill);
    for (const [filePath, text] of Object.entries(skill.files)) {
      const uri = `skill://${skill.skillPath}/${filePath}`;
      const mimeType = mimeTypeFor(filePath);
      filesByUri.set(uri, { uri, mimeType, text });
      if (skill.listed) {
        listedResources.push({
          uri,
          mimeType,
          name: filePath === "SKILL.md" ? name : `${name} — ${filePath}`,
          ...(filePath === "SKILL.md" ? { description } : {}),
        });
      }
    }
  }

  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: SKILLS.filter((s) => s.listed).map((skill) => ({
      ...describeSkill(skill),
      type: "skill-md",
      url: `skill://${skill.skillPath}/SKILL.md`,
    })),
  };

  filesByUri.set("skill://index.json", {
    uri: "skill://index.json",
    mimeType: "application/json",
    text: JSON.stringify(index, null, 2),
  });
  listedResources.push({ uri: "skill://index.json", name: "Skill index", mimeType: "application/json" });

  const server = new Server(
    { name: "issue-66-skills-fixture", version: "0.1.0" },
    { capabilities: { resources: {}, extensions: { [SKILLS_CAPABILITY]: {} } } }
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listedResources }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const file = filesByUri.get(request.params.uri);
    if (!file) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${request.params.uri}`);
    }
    return { contents: [{ uri: file.uri, mimeType: file.mimeType, text: file.text }] };
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
