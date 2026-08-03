/**
 * Tests for registerSkillResources() — resource registration, `_meta`
 * threading, the SEP-2640 v1 `skills/list` / `skills/get` handlers, the
 * capability declaration, and the optional `resources/directory/read`
 * handler.
 */

import { describe, it, expect } from "vitest";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import {
  registerSkillResources,
  buildSkillEntry,
  makeSkillsListHandler,
  makeSkillsGetHandler,
  sha256Digest,
} from "./_server.js";
import {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
} from "./skills-methods.js";
import { DIRECTORY_READ_METHOD } from "./directory.js";
import { SKILLS_EXTENSION_ID } from "./resource-extensions.js";
import type { SkillMetadata } from "./types.js";

// ---------------------------------------------------------------------------
// Stub MCP server that records registerResource(), setRequestHandler(), and
// registerCapabilities() calls, mirroring the v2 SDK surface.
// ---------------------------------------------------------------------------

interface RegisteredCall {
  name: string;
  uriOrTemplate: string | ResourceTemplate;
  metadata: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (...args: any[]) => any;
}

interface HandlerCall {
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...a: any[]) => any;
}

function makeStubServer() {
  const calls: RegisteredCall[] = [];
  const handlers: HandlerCall[] = [];
  const capabilities: unknown[] = [];
  return {
    calls,
    handlers,
    capabilities,
    registerResource(...args: unknown[]) {
      const [name, uriOrTemplate, metadata, callback] = args as [
        string,
        string | ResourceTemplate,
        Record<string, unknown>,
        (...a: unknown[]) => unknown,
      ];
      calls.push({ name, uriOrTemplate, metadata, callback });
    },
    // v2 signature for non-spec methods: (method, { params, result }, handler)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRequestHandler(method: string, schemas: any, handler: (...a: any[]) => any) {
      handlers.push({ method, schemas, handler });
    },
    registerCapabilities(caps: unknown) {
      capabilities.push(caps);
    },
  };
}

type StubServer = ReturnType<typeof makeStubServer>;

function handlerFor(server: StubServer, method: string) {
  return server.handlers.find((h) => h.method === method)?.handler;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIGEST_A = sha256Digest("a");
const DIGEST_B = sha256Digest("b");

function emptySkillMap(): Map<string, SkillMetadata> {
  return new Map();
}

function skill(overrides: Partial<SkillMetadata> & {
  name: string;
  skillPath: string;
}): SkillMetadata {
  return {
    description: "desc",
    absolutePath: `/skills/${overrides.skillPath}/SKILL.md`,
    skillDir: `/skills/${overrides.skillPath}`,
    documents: [],
    size: 100,
    lastModified: "2026-01-01T00:00:00.000Z",
    frontmatter: { name: overrides.name, description: "desc" },
    digest: DIGEST_A,
    ...overrides,
  };
}

function mapOf(...skills: SkillMetadata[]): Map<string, SkillMetadata> {
  return new Map(skills.map((s) => [s.skillPath, s]));
}

// ---------------------------------------------------------------------------
// _meta threading
// ---------------------------------------------------------------------------

describe("registerSkillResources — _meta threading", () => {
  it("threads SkillMetadata.meta into the SKILL.md resource _meta", () => {
    const server = makeStubServer();
    const skillMap = mapOf(
      skill({
        name: "code-review",
        skillPath: "code-review",
        description: "Review code",
        meta: { "io.modelcontextprotocol.skills/provenance": "acme/internal" },
      }),
    );

    registerSkillResources(server, skillMap, "/skills", { template: false });

    const skillCall = server.calls.find((c) => c.name === "code-review");
    expect(skillCall).toBeDefined();
    expect(skillCall!.metadata._meta).toEqual({
      "io.modelcontextprotocol.skills/provenance": "acme/internal",
    });
  });

  it("omits _meta from registration when SkillMetadata.meta is unset", () => {
    const server = makeStubServer();
    const skillMap = mapOf(
      skill({ name: "code-review", skillPath: "code-review", description: "Review code" }),
    );

    registerSkillResources(server, skillMap, "/skills", { template: false });
    const skillCall = server.calls.find((c) => c.name === "code-review");
    expect(skillCall!.metadata._meta).toBeUndefined();
  });

  it("registers the catch-all skill-file template when template: true", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: true });
    const catchAll = server.calls.find((c) => c.name === "skill-file");
    expect(catchAll).toBeDefined();
    expect(catchAll!.uriOrTemplate).toBeInstanceOf(ResourceTemplate);
  });
});

// ---------------------------------------------------------------------------
// Capability declaration
// ---------------------------------------------------------------------------

describe("registerSkillResources — capability declaration", () => {
  it("declares the extension with an empty settings object by default", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: false });
    expect(server.capabilities).toEqual([
      { extensions: { [SKILLS_EXTENSION_ID]: {} } },
    ]);
  });

  it("declares directoryRead: true when the handler is enabled", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      directoryRead: true,
    });
    expect(server.capabilities).toEqual([
      { extensions: { [SKILLS_EXTENSION_ID]: { directoryRead: true } } },
    ]);
  });

  it("skips the declaration when declareCapability: false", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      declareCapability: false,
    });
    expect(server.capabilities).toEqual([]);
  });

  it("registers on the low-level server (server.server) when present", () => {
    const low = makeStubServer();
    const high = { registerResource: low.registerResource, server: low };
    registerSkillResources(high, emptySkillMap(), "/skills", {
      template: false,
      directoryRead: true,
    });
    expect(low.capabilities).toHaveLength(1);
    expect(low.handlers.map((h) => h.method).sort()).toEqual([
      DIRECTORY_READ_METHOD,
      SKILLS_GET_METHOD,
      SKILLS_LIST_METHOD,
    ]);
  });
});

// ---------------------------------------------------------------------------
// skills/list and skills/get registration
// ---------------------------------------------------------------------------

describe("registerSkillResources — skills methods", () => {
  it("always registers skills/list and skills/get handlers", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: false });
    expect(server.handlers.map((h) => h.method).sort()).toEqual([
      SKILLS_GET_METHOD,
      SKILLS_LIST_METHOD,
    ]);
    for (const h of server.handlers) {
      expect(h.schemas.params).toBeDefined();
      expect(h.schemas.result).toBeDefined();
    }
  });

  it("does not register a directory/read handler by default", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: false });
    expect(handlerFor(server, DIRECTORY_READ_METHOD)).toBeUndefined();
  });

  it("registers resources/directory/read when directoryRead: true", async () => {
    const server = makeStubServer();
    const skillMap = mapOf(
      skill({
        name: "code-review",
        skillPath: "code-review",
        documents: [
          { path: "references/GUIDE.md", mimeType: "text/markdown", size: 10, digest: DIGEST_B },
        ],
      }),
    );

    registerSkillResources(server, skillMap, "/skills", {
      template: false,
      directoryRead: true,
    });

    const handler = handlerFor(server, DIRECTORY_READ_METHOD)!;
    const result = await handler({ uri: "skill://code-review" });
    const names = result.resources.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(["SKILL.md", "references"]);
    const refDir = result.resources.find((r: { name: string }) => r.name === "references");
    expect(refDir.mimeType).toBe("inode/directory");
  });

  it("serves skill entries from skills/list with the caching attributes on 2026-07-28+", async () => {
    const server = makeStubServer();
    const skillMap = mapOf(
      skill({
        name: "code-review",
        skillPath: "code-review",
        documents: [
          { path: "references/GUIDE.md", mimeType: "text/markdown", size: 10, digest: DIGEST_B },
        ],
      }),
    );

    registerSkillResources(server, skillMap, "/skills", {
      template: false,
      ttlMs: 60_000,
      cacheScope: "public",
    });

    const modernCtx = {
      mcpReq: {
        envelope: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
      },
    };
    const result = await handlerFor(server, SKILLS_LIST_METHOD)!({}, modernCtx);
    expect(result.ttlMs).toBe(60_000);
    expect(result.cacheScope).toBe("public");
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toEqual({
      uri: "skill://code-review/SKILL.md",
      frontmatter: { name: "code-review", description: "desc" },
      resources: [
        { uri: "skill://code-review/SKILL.md", digest: DIGEST_A },
        { uri: "skill://code-review/references/GUIDE.md", digest: DIGEST_B },
      ],
    });
  });

  it("omits ttlMs/cacheScope for pre-2026-07-28 requests (no envelope)", async () => {
    const server = makeStubServer();
    registerSkillResources(server, mapOf(skill({ name: "a", skillPath: "a" })), "/skills", {
      template: false,
      ttlMs: 60_000,
      cacheScope: "public",
    });

    const result = await handlerFor(server, SKILLS_LIST_METHOD)!({});
    expect(result.ttlMs).toBeUndefined();
    expect(result.cacheScope).toBeUndefined();
    expect(result.skills).toHaveLength(1);
  });

  it("filters listed: false skills from skills/list but still answers skills/get", async () => {
    const server = makeStubServer();
    const skillMap = mapOf(
      skill({ name: "public-skill", skillPath: "public-skill" }),
      skill({ name: "hidden-skill", skillPath: "hidden-skill", listed: false }),
    );
    registerSkillResources(server, skillMap, "/skills", { template: false });

    const listing = await handlerFor(server, SKILLS_LIST_METHOD)!({});
    expect(listing.skills.map((s: { uri: string }) => s.uri)).toEqual([
      "skill://public-skill/SKILL.md",
    ]);

    const got = await handlerFor(server, SKILLS_GET_METHOD)!({
      uri: "skill://hidden-skill/SKILL.md",
    });
    expect(got.skill.uri).toBe("skill://hidden-skill/SKILL.md");
  });

  it("serves a single entry from skills/get and errors -32602 for unknown URIs", async () => {
    const server = makeStubServer();
    const skillMap = mapOf(skill({ name: "code-review", skillPath: "code-review" }));
    registerSkillResources(server, skillMap, "/skills", { template: false });

    const handler = handlerFor(server, SKILLS_GET_METHOD)!;
    const ok = await handler({ uri: "skill://code-review/SKILL.md" });
    expect(ok.skill.uri).toBe("skill://code-review/SKILL.md");
    expect(ok.skill.resources).toEqual([
      { uri: "skill://code-review/SKILL.md", digest: DIGEST_A },
    ]);

    await expect(handler({ uri: "skill://nope/SKILL.md" })).rejects.toMatchObject({
      code: -32602,
    });
  });
});

// ---------------------------------------------------------------------------
// buildSkillEntry / makeSkillsListHandler pagination
// ---------------------------------------------------------------------------

describe("buildSkillEntry", () => {
  it("lists SKILL.md first, then every supporting file", () => {
    const entry = buildSkillEntry(
      skill({
        name: "refunds",
        skillPath: "acme/billing/refunds",
        documents: [
          { path: "examples/email.md", mimeType: "text/markdown", size: 5, digest: DIGEST_B },
        ],
      }),
    );
    expect(entry.uri).toBe("skill://acme/billing/refunds/SKILL.md");
    expect(entry.resources).toEqual([
      { uri: "skill://acme/billing/refunds/SKILL.md", digest: DIGEST_A },
      { uri: "skill://acme/billing/refunds/examples/email.md", digest: DIGEST_B },
    ]);
  });
});

describe("makeSkillsListHandler pagination", () => {
  const map = mapOf(
    skill({ name: "a", skillPath: "a" }),
    skill({ name: "b", skillPath: "b" }),
    skill({ name: "c", skillPath: "c" }),
  );

  it("pages entries atomically with an opaque cursor", async () => {
    const handler = makeSkillsListHandler(map, { pageSize: 2 });

    const page1 = await handler({});
    expect(page1.skills.map((s) => s.uri)).toEqual([
      "skill://a/SKILL.md",
      "skill://b/SKILL.md",
    ]);
    expect(page1.nextCursor).toBeTypeOf("string");

    const page2 = await handler({ cursor: page1.nextCursor });
    expect(page2.skills.map((s) => s.uri)).toEqual(["skill://c/SKILL.md"]);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("defaults to ttlMs 0 and cacheScope private on 2026-07-28+ requests", async () => {
    const handler = makeSkillsListHandler(map);
    const result = await handler(
      {},
      {
        mcpReq: {
          envelope: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
        },
      },
    );
    expect(result.ttlMs).toBe(0);
    expect(result.cacheScope).toBe("private");
  });

  it("returns an empty listing for an empty map (never an error)", async () => {
    const handler = makeSkillsListHandler(new Map());
    const result = await handler({});
    expect(result.skills).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });
});

describe("makeSkillsGetHandler", () => {
  it("answers by exact SKILL.md URI only", async () => {
    const handler = makeSkillsGetHandler(mapOf(skill({ name: "a", skillPath: "a" })));
    await expect(handler({ uri: "skill://a" })).rejects.toMatchObject({ code: -32602 });
    await expect(handler({ uri: "skill://a/SKILL.md" })).resolves.toMatchObject({
      skill: { uri: "skill://a/SKILL.md" },
    });
  });
});
