/**
 * End-to-end integration test against the real v2 MCP SDK: an McpServer
 * with registerSkillResources() wired to a Client over an in-memory
 * transport pair. Exercises the actual protocol path for the SEP-2640 v1
 * surface: capability declaration, skills/list, skills/get, verified
 * reads, and resources/directory/read.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
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
license: Apache-2.0
---
# Refunds

Use the template in templates/.
`;

const TEMPLATE_MD = "# Refund email template\n";

let tmpDir: string;
let client: Client;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-skills-e2e-"));
  const skillDir = path.join(tmpDir, "acme", "billing", "refunds");
  fs.mkdirSync(path.join(skillDir, "templates"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "assets"), { recursive: true }); // stays empty
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_MD);
  fs.writeFileSync(
    path.join(skillDir, "templates", "refund-email.md"),
    TEMPLATE_MD,
  );

  const server = new McpServer(
    { name: "skills-e2e", version: "0.0.0" },
    {
      capabilities: { resources: {} },
      instructions: "Read skill://acme/billing/refunds/SKILL.md for refunds.",
    },
  );
  const skillMap = discoverSkillsFs(tmpDir);
  registerSkillResources(server, skillMap, tmpDir, { directoryRead: true });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "skills-e2e-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport as never),
    client.connect(clientTransport),
  ]);
  cleanup = async () => {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
});

afterAll(async () => {
  await cleanup();
});

describe("e2e over the v2 SDK", () => {
  it("advertises the extension capability with directoryRead", () => {
    const caps = client.getServerCapabilities();
    expect(caps?.extensions?.[SKILLS_EXTENSION_ID]).toEqual({
      directoryRead: true,
    });
    expect(serverSupportsSkills(client)).toBe(true);
    expect(serverSupportsDirectoryRead(client)).toBe(true);
  });

  it("lists the skill via skills/list with a complete resources manifest", async () => {
    const skills = await listSkills(client);
    expect(skills).toHaveLength(1);
    const entry = skills[0];
    expect(entry.uri).toBe("skill://acme/billing/refunds/SKILL.md");
    expect(entry.frontmatter).toEqual({
      name: "refunds",
      description: "Process customer refund requests per company policy",
      license: "Apache-2.0",
    });
    expect(entry.resources?.map((r) => r.uri).sort()).toEqual([
      "skill://acme/billing/refunds/SKILL.md",
      "skill://acme/billing/refunds/templates/refund-email.md",
    ]);
  });

  it("retrieves the same entry via skills/get", async () => {
    const entry = await getSkill(client, "skill://acme/billing/refunds/SKILL.md");
    expect(entry.frontmatter.name).toBe("refunds");
    expect(entry.resources).toHaveLength(2);
  });

  it("rejects skills/get for a URI it does not serve as a skill", async () => {
    await expect(
      getSkill(client, "skill://not-a-skill/SKILL.md"),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("reads and verifies SKILL.md and a supporting file against the entry", async () => {
    const entry = await getSkill(client, "skill://acme/billing/refunds/SKILL.md");
    const text = await readSkill(client, entry);
    const raw = await client.readResource({ uri: entry.uri });
    expect(raw.contents[0]?.mimeType).toBe("text/markdown");
    expect(text).toBe(SKILL_MD);

    const template = await readSkillResource(
      client,
      entry,
      "skill://acme/billing/refunds/templates/refund-email.md",
    );
    expect(template.text).toBe(TEMPLATE_MD);
  });

  it("treats a read of an unlisted file as a verification failure", async () => {
    const entry = await getSkill(client, "skill://acme/billing/refunds/SKILL.md");
    await expect(
      readSkillResource(
        client,
        entry,
        "skill://acme/billing/refunds/templates/other.md",
      ),
    ).rejects.toThrow(/not listed in the resources manifest/);
  });

  it("returns -32602 for a resources/read of a file the skill does not have", async () => {
    await expect(
      client.readResource({ uri: "skill://acme/billing/refunds/templates/missing.md" }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("enumerates a skill directory via resources/directory/read", async () => {
    const { resources } = await readDirectory(
      client,
      "skill://acme/billing/refunds",
    );
    expect(resources.map((r) => r.name).sort()).toEqual([
      "SKILL.md",
      "assets",
      "templates",
    ]);
    const templates = resources.find((r) => r.name === "templates");
    expect(templates?.mimeType).toBe("inode/directory");
  });

  it("lists an empty directory as an empty result, not an error", async () => {
    const { resources } = await readDirectory(
      client,
      "skill://acme/billing/refunds/assets",
    );
    expect(resources).toEqual([]);
  });

  it("serves the discovery-time snapshot even if the file changes on disk", async () => {
    // The SEP binds the entry (digest + frontmatter) to the served content;
    // snapshot serving keeps them consistent regardless of on-disk drift.
    const skillMdPath = path.join(
      tmpDir,
      "acme",
      "billing",
      "refunds",
      "SKILL.md",
    );
    const original = fs.readFileSync(skillMdPath, "utf-8");
    try {
      fs.writeFileSync(
        skillMdPath,
        original.replace("# Refunds", "# Refunds (edited on disk)"),
      );
      const entry = await getSkill(
        client,
        "skill://acme/billing/refunds/SKILL.md",
      );
      // Digest verification and the frontmatter identity check still pass:
      // entry and served content both come from the discovery snapshot.
      const text = await readSkill(client, entry);
      expect(text).toBe(SKILL_MD);
    } finally {
      fs.writeFileSync(skillMdPath, original);
    }
  });

  it("omits ttlMs/cacheScope on this pre-2026-07-28 connection", async () => {
    // InMemoryTransport pairs negotiate a 2025-era protocol version, whose
    // requests carry no _meta envelope — so per SEP-2640 the list-caching
    // attributes must be absent from the result.
    const result = (await client.request(
      { method: SKILLS_LIST_METHOD, params: {} },
      SkillsListResultSchema,
    )) as { ttlMs?: number; cacheScope?: string };
    expect(result.ttlMs).toBeUndefined();
    expect(result.cacheScope).toBeUndefined();
  });

  it("errors -32602 for directory read of a non-directory", async () => {
    await expect(
      readDirectory(client, "skill://acme/billing/refunds/SKILL.md"),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("discoverSkills merges the listing with instructions-confirmed entries", async () => {
    const skills = await discoverSkills(client, { instructions: true });
    expect(skills).toHaveLength(1);
    expect(skills[0].uri).toBe("skill://acme/billing/refunds/SKILL.md");
  });
});
