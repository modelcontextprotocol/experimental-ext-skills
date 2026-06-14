/**
 * Tests for registerSkillResources() — resource registration, `_meta`
 * threading, the optional `skill://index.json`, and the SEP-2640
 * `resources/directory/read` handler.
 */

import { describe, it, expect } from "vitest";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSkillResources } from "./_server.js";
import { DIRECTORY_READ_METHOD } from "./directory.js";
import type { SkillMetadata } from "./types.js";

// ---------------------------------------------------------------------------
// Stub MCP server that records resource() and setRequestHandler() calls.
// ---------------------------------------------------------------------------

interface RegisteredCall {
  name: string;
  uriOrTemplate: string | ResourceTemplate;
  metadata: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (...args: any[]) => any;
}

interface HandlerCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => any;
}

function makeStubServer() {
  const calls: RegisteredCall[] = [];
  const handlers: HandlerCall[] = [];
  return {
    calls,
    handlers,
    resource(...args: unknown[]) {
      const [name, uriOrTemplate, metadata, callback] = args as [
        string,
        string | ResourceTemplate,
        Record<string, unknown>,
        (...a: unknown[]) => unknown,
      ];
      calls.push({ name, uriOrTemplate, metadata, callback });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRequestHandler(schema: any, handler: (...a: any[]) => any) {
      handlers.push({ schema, handler });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    digest: "sha256:" + "0".repeat(64),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _meta threading
// ---------------------------------------------------------------------------

describe("registerSkillResources — _meta threading", () => {
  it("threads SkillMetadata.meta into the SKILL.md resource _meta", () => {
    const server = makeStubServer();
    const skillMap = new Map<string, SkillMetadata>([
      [
        "code-review",
        skill({
          name: "code-review",
          skillPath: "code-review",
          description: "Review code",
          meta: { "io.modelcontextprotocol.skills/provenance": "acme/internal" },
        }),
      ],
    ]);

    registerSkillResources(server, skillMap, "/skills", { template: false });

    const skillCall = server.calls.find((c) => c.name === "code-review");
    expect(skillCall).toBeDefined();
    expect(skillCall!.metadata._meta).toEqual({
      "io.modelcontextprotocol.skills/provenance": "acme/internal",
    });
  });

  it("omits _meta from registration when SkillMetadata.meta is unset", () => {
    const server = makeStubServer();
    const skillMap = new Map<string, SkillMetadata>([
      ["code-review", skill({ name: "code-review", skillPath: "code-review", description: "Review code" })],
    ]);

    registerSkillResources(server, skillMap, "/skills", { template: false });
    const skillCall = server.calls.find((c) => c.name === "code-review");
    expect(skillCall!.metadata._meta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// skill://index.json registration
// ---------------------------------------------------------------------------

describe("registerSkillResources — index resource", () => {
  it("registers skill://index.json by default", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: false });
    expect(server.calls.find((c) => c.name === "skills-index")).toBeDefined();
  });

  it("omits skill://index.json when index: false", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      index: false,
    });
    expect(server.calls.find((c) => c.name === "skills-index")).toBeUndefined();
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
// resources/directory/read handler
// ---------------------------------------------------------------------------

describe("registerSkillResources — directoryRead", () => {
  it("does not register a directory/read handler by default", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", { template: false });
    expect(server.handlers).toHaveLength(0);
  });

  it("registers a resources/directory/read handler when directoryRead: true", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      directoryRead: true,
    });

    expect(server.handlers).toHaveLength(1);
    // The schema routes by its `method` literal.
    const method = server.handlers[0].schema.shape.method.value;
    expect(method).toBe(DIRECTORY_READ_METHOD);
  });

  it("registers the handler on the low-level server (server.server) when present", () => {
    const low = makeStubServer();
    const high = { resource: low.resource, server: low };
    registerSkillResources(high, emptySkillMap(), "/skills", {
      template: false,
      directoryRead: true,
    });
    expect(low.handlers).toHaveLength(1);
  });

  it("serves a directory listing for a registered skill", async () => {
    const server = makeStubServer();
    const skillMap = new Map<string, SkillMetadata>([
      [
        "code-review",
        skill({
          name: "code-review",
          skillPath: "code-review",
          documents: [
            { path: "references/GUIDE.md", mimeType: "text/markdown", size: 10 },
          ],
        }),
      ],
    ]);

    registerSkillResources(server, skillMap, "/skills", {
      template: false,
      directoryRead: true,
    });

    const handler = server.handlers[0].handler;
    const result = await handler({
      method: DIRECTORY_READ_METHOD,
      params: { uri: "skill://code-review" },
    });

    const names = result.resources.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(["SKILL.md", "references"]);
    const refDir = result.resources.find((r: { name: string }) => r.name === "references");
    expect(refDir.mimeType).toBe("inode/directory");
  });
});
