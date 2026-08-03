/**
 * End-to-end integration test on the 2026-07-28 ("modern") protocol era:
 * the SEP-2640 v1 surface served through `createMcpHandler` and consumed by
 * a real `Client` negotiating via `server/discover`, in-process (the
 * Streamable HTTP transport's fetch is shimmed to the handler — no socket).
 *
 * This covers what the legacy-era in-memory test cannot: the extension
 * capability arriving via `server/discover`, custom methods under the
 * per-request `_meta` envelope, and the SEP-2549 list-caching attributes
 * (`ttlMs`/`cacheScope`), which SEP-2640 scopes to protocol 2026-07-28+.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { discoverSkills as discoverSkillsFs, registerSkillResources } from "./_server.js";
import {
  serverSupportsSkills,
  serverSupportsDirectoryRead,
  listSkills,
  getSkill,
  readSkill,
  readSkillResource,
  readDirectory,
  discoverSkills,
} from "./_client.js";
import { SKILLS_LIST_METHOD, SkillsListResultSchema } from "./skills-methods.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";

const SKILL_MD = `---
name: refunds
description: Process customer refund requests per company policy
---
# Refunds

Use the template in templates/.
`;

const TEMPLATE_MD = "# Refund email template\n";

let tmpDir: string;
let client: Client;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-skills-modern-e2e-"));
  const skillDir = path.join(tmpDir, "acme", "billing", "refunds");
  fs.mkdirSync(path.join(skillDir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_MD);
  fs.writeFileSync(
    path.join(skillDir, "templates", "refund-email.md"),
    TEMPLATE_MD,
  );

  // Discover once; the factory builds a fresh per-request server over the
  // shared snapshot, exactly the shape createMcpHandler deployments use.
  const skillMap = discoverSkillsFs(tmpDir);
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "skills-modern-e2e", version: "0.0.0" },
      {
        capabilities: { resources: {} },
        instructions:
          "Read skill://acme/billing/refunds/SKILL.md for refunds.",
      },
    );
    registerSkillResources(server, skillMap, tmpDir, {
      directoryRead: true,
      ttlMs: 60_000,
      cacheScope: "public",
    });
    return server;
  });

  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    { fetch: (url, init) => handler.fetch(new Request(url, init)) },
  );
  client = new Client(
    { name: "skills-modern-e2e-client", version: "0.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("e2e on the 2026-07-28 era", () => {
  it("negotiates the modern era", () => {
    expect(client.getProtocolEra()).toBe("modern");
  });

  it("advertises the extension capability via server/discover", () => {
    const caps = client.getServerCapabilities();
    expect(caps?.extensions?.[SKILLS_EXTENSION_ID]).toEqual({
      directoryRead: true,
    });
    expect(serverSupportsSkills(client)).toBe(true);
    expect(serverSupportsDirectoryRead(client)).toBe(true);
  });

  it("carries ttlMs and cacheScope on skills/list results (SEP-2549 via SEP-2640)", async () => {
    const result = (await client.request(
      { method: SKILLS_LIST_METHOD, params: {} },
      SkillsListResultSchema,
    )) as { skills: unknown[]; ttlMs?: number; cacheScope?: string };
    expect(result.ttlMs).toBe(60_000);
    expect(result.cacheScope).toBe("public");
    expect(result.skills).toHaveLength(1);
  });

  it("lists, retrieves, and verifies a skill end to end", async () => {
    const skills = await listSkills(client);
    expect(skills).toHaveLength(1);

    const entry = await getSkill(client, "skill://acme/billing/refunds/SKILL.md");
    expect(entry.frontmatter.name).toBe("refunds");
    expect(entry.resources).toHaveLength(2);

    const text = await readSkill(client, entry);
    expect(text).toBe(SKILL_MD);

    const template = await readSkillResource(
      client,
      entry,
      "skill://acme/billing/refunds/templates/refund-email.md",
    );
    expect(template.text).toBe(TEMPLATE_MD);
  });

  it("rejects skills/get for non-skill URIs with -32602", async () => {
    await expect(
      getSkill(client, "skill://not-a-skill/SKILL.md"),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("enumerates directories via resources/directory/read", async () => {
    const { resources } = await readDirectory(
      client,
      "skill://acme/billing/refunds",
    );
    expect(resources.map((r) => r.name).sort()).toEqual([
      "SKILL.md",
      "templates",
    ]);
  });

  it("discoverSkills with instructions mining works over server/discover", async () => {
    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://acme/billing/refunds/SKILL.md");
  });
});
