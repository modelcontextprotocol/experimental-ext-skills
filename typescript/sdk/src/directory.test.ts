/**
 * Tests for the SEP-2640 `resources/directory/read` module, digest
 * verification, the `directoryRead` capability declaration, and the
 * client-side directory helpers.
 */

import { describe, it, expect, vi } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  buildDirectoryTree,
  makeDirectoryReadHandler,
  INODE_DIRECTORY_MIME,
  DIRECTORY_READ_METHOD,
} from "./directory.js";
import {
  declareSkillsExtension,
  SKILLS_EXTENSION_ID,
} from "./resource-extensions.js";
import {
  verifyDigest,
  serverSupportsDirectoryRead,
  readDirectory,
  type SkillsClient,
} from "./_client.js";
import { sha256Digest } from "./_server.js";
import type { SkillMetadata } from "./types.js";

function skill(overrides: Partial<SkillMetadata> & {
  name: string;
  skillPath: string;
}): SkillMetadata {
  return {
    description: "desc",
    absolutePath: `/skills/${overrides.skillPath}/SKILL.md`,
    skillDir: `/skills/${overrides.skillPath}`,
    documents: [],
    size: 42,
    lastModified: "2026-01-01T00:00:00.000Z",
    frontmatter: { name: overrides.name, description: "desc" },
    digest: "sha256:" + "0".repeat(64),
    ...overrides,
  };
}

function skillMap(skills: SkillMetadata[]): Map<string, SkillMetadata> {
  return new Map(skills.map((s) => [s.skillPath, s]));
}

// ---------------------------------------------------------------------------
// buildDirectoryTree
// ---------------------------------------------------------------------------

describe("buildDirectoryTree", () => {
  it("lists the skill root's direct children (files + subdirs)", () => {
    const tree = buildDirectoryTree(
      skillMap([
        skill({
          name: "code-review",
          skillPath: "code-review",
          documents: [
            { path: "references/GUIDE.md", mimeType: "text/markdown", size: 10 },
            { path: "scripts/run.sh", mimeType: "text/x-shellscript", size: 5 },
          ],
        }),
      ]),
    );

    const root = tree.get("skill://code-review")!;
    expect(root.map((c) => c.name).sort()).toEqual([
      "SKILL.md",
      "references",
      "scripts",
    ]);
    // Directories carry inode/directory; files carry their own mime.
    expect(root.find((c) => c.name === "references")!.mimeType).toBe(INODE_DIRECTORY_MIME);
    expect(root.find((c) => c.name === "SKILL.md")!.mimeType).toBe("text/markdown");
  });

  it("uses no trailing slash on directory URIs and lists subdirectory contents", () => {
    const tree = buildDirectoryTree(
      skillMap([
        skill({
          name: "code-review",
          skillPath: "code-review",
          documents: [{ path: "references/GUIDE.md", mimeType: "text/markdown", size: 10 }],
        }),
      ]),
    );

    expect(tree.has("skill://code-review/references")).toBe(true);
    expect(tree.has("skill://code-review/references/")).toBe(false);
    const refs = tree.get("skill://code-review/references")!;
    expect(refs).toHaveLength(1);
    expect(refs[0].uri).toBe("skill://code-review/references/GUIDE.md");
  });

  it("exposes organizational prefix segments as directories", () => {
    const tree = buildDirectoryTree(
      skillMap([skill({ name: "refunds", skillPath: "acme/billing/refunds" })]),
    );

    expect(tree.get("skill://acme")!.map((c) => c.name)).toEqual(["billing"]);
    expect(tree.get("skill://acme/billing")!.map((c) => c.name)).toEqual(["refunds"]);
    expect(tree.get("skill://acme/billing/refunds")!.map((c) => c.name)).toEqual(["SKILL.md"]);
    // No synthetic root.
    expect(tree.has("skill://")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// makeDirectoryReadHandler
// ---------------------------------------------------------------------------

describe("makeDirectoryReadHandler", () => {
  const map = skillMap([
    skill({
      name: "code-review",
      skillPath: "code-review",
      documents: [{ path: "references/GUIDE.md", mimeType: "text/markdown", size: 10 }],
    }),
  ]);

  function call(uri: string, cursor?: string, pageSize?: number) {
    const handler = makeDirectoryReadHandler(map, pageSize ? { pageSize } : undefined);
    return handler({
      method: DIRECTORY_READ_METHOD,
      params: { uri, ...(cursor ? { cursor } : {}) },
    } as never);
  }

  it("returns direct children, metadata only (no contents)", async () => {
    const result = await call("skill://code-review");
    expect(result.resources.map((r) => r.name).sort()).toEqual(["SKILL.md", "references"]);
    for (const child of result.resources) {
      expect("text" in child).toBe(false);
      expect("blob" in child).toBe(false);
    }
  });

  it("is non-recursive (grandchildren absent)", async () => {
    const result = await call("skill://code-review");
    expect(result.resources.find((r) => r.name === "GUIDE.md")).toBeUndefined();
  });

  it("tolerates a trailing slash on the requested URI", async () => {
    const result = await call("skill://code-review/");
    expect(result.resources).toHaveLength(2);
  });

  it("throws -32602 for a file URI", async () => {
    await expect(call("skill://code-review/SKILL.md")).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
    });
  });

  it("throws -32602 for a nonexistent URI", async () => {
    const err = await call("skill://does-not-exist").catch((e) => e);
    expect(err).toBeInstanceOf(McpError);
    expect(err.code).toBe(-32602);
  });

  it("paginates with an opaque nextCursor", async () => {
    const refsMap = skillMap([
      skill({
        name: "many",
        skillPath: "many",
        documents: [
          { path: "a.md", mimeType: "text/markdown", size: 1 },
          { path: "b.md", mimeType: "text/markdown", size: 1 },
          { path: "c.md", mimeType: "text/markdown", size: 1 },
        ],
      }),
    ]);
    const handler = makeDirectoryReadHandler(refsMap, { pageSize: 2 });

    const page1 = await handler({
      method: DIRECTORY_READ_METHOD,
      params: { uri: "skill://many" },
    } as never);
    expect(page1.resources).toHaveLength(2);
    expect(page1.nextCursor).toBeTypeOf("string");

    const page2 = await handler({
      method: DIRECTORY_READ_METHOD,
      params: { uri: "skill://many", cursor: page1.nextCursor },
    } as never);
    // Root has SKILL.md + a.md + b.md + c.md = 4 children → 2 + 2, no more.
    expect(page2.resources).toHaveLength(2);
    expect(page2.nextCursor).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// verifyDigest
// ---------------------------------------------------------------------------

describe("verifyDigest", () => {
  const data = "hello skills";
  const digest = sha256Digest(data);

  it("returns true for matching content", () => {
    expect(verifyDigest(data, digest)).toBe(true);
  });

  it("returns false for mismatched content", () => {
    expect(verifyDigest("tampered", digest)).toBe(false);
  });

  it("is case-insensitive on the hex", () => {
    expect(verifyDigest(data, digest.toUpperCase())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// declareSkillsExtension
// ---------------------------------------------------------------------------

describe("declareSkillsExtension", () => {
  function stubServer() {
    const registered: unknown[] = [];
    return {
      registered,
      registerCapabilities(caps: unknown) {
        registered.push(caps);
      },
    };
  }

  it("declares an empty capability object by default", () => {
    const server = stubServer();
    declareSkillsExtension(server);
    expect(server.registered[0]).toEqual({
      extensions: { [SKILLS_EXTENSION_ID]: {} },
    });
  });

  it("declares directoryRead when requested", () => {
    const server = stubServer();
    declareSkillsExtension(server, { directoryRead: true });
    expect(server.registered[0]).toEqual({
      extensions: { [SKILLS_EXTENSION_ID]: { directoryRead: true } },
    });
  });
});

// ---------------------------------------------------------------------------
// serverSupportsDirectoryRead / readDirectory (client)
// ---------------------------------------------------------------------------

describe("client directory helpers", () => {
  function clientWithCaps(
    cap: { directoryRead?: boolean } | undefined,
    request?: SkillsClient["request"],
  ): SkillsClient {
    return {
      listResources: vi.fn(),
      readResource: vi.fn(),
      getServerCapabilities: () => ({
        extensions: cap ? { [SKILLS_EXTENSION_ID]: cap } : {},
      }),
      request,
    };
  }

  it("serverSupportsDirectoryRead reflects the declared capability", () => {
    expect(serverSupportsDirectoryRead(clientWithCaps({ directoryRead: true }))).toBe(true);
    expect(serverSupportsDirectoryRead(clientWithCaps({ directoryRead: false }))).toBe(false);
    expect(serverSupportsDirectoryRead(clientWithCaps(undefined))).toBe(false);
    expect(serverSupportsDirectoryRead({ listResources: vi.fn(), readResource: vi.fn() })).toBe(false);
  });

  it("readDirectory throws when the capability is absent", async () => {
    await expect(
      readDirectory(clientWithCaps({ directoryRead: false }), "skill://x"),
    ).rejects.toThrow(/did not declare/);
  });

  it("readDirectory issues the correct low-level request when supported", async () => {
    const request = vi.fn().mockResolvedValue({
      resources: [{ uri: "skill://x/SKILL.md", name: "SKILL.md", mimeType: "text/markdown" }],
    });
    const client = clientWithCaps({ directoryRead: true }, request);

    const result = await readDirectory(client, "skill://x");

    expect(request).toHaveBeenCalledWith(
      { method: DIRECTORY_READ_METHOD, params: { uri: "skill://x" } },
      expect.anything(),
    );
    expect(result.resources[0].name).toBe("SKILL.md");
  });

  it("readDirectory forwards a pagination cursor", async () => {
    const request = vi.fn().mockResolvedValue({ resources: [] });
    const client = clientWithCaps({ directoryRead: true }, request);

    await readDirectory(client, "skill://x", { cursor: "abc" });

    expect(request).toHaveBeenCalledWith(
      { method: DIRECTORY_READ_METHOD, params: { uri: "skill://x", cursor: "abc" } },
      expect.anything(),
    );
  });
});
