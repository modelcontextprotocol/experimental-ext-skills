/**
 * Tests for registerSkillResources() — focused on the resource-template
 * registration path (read + completion wiring) introduced for SEP-2640's
 * mcp-resource-template entry type.
 */

import { describe, it, expect } from "vitest";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSkillResources } from "./_server.js";
import type { SkillMetadata } from "./types.js";

// ---------------------------------------------------------------------------
// Stub MCP server that records every resource() call
// ---------------------------------------------------------------------------

interface RegisteredCall {
  name: string;
  uriOrTemplate: string | ResourceTemplate;
  metadata: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (...args: any[]) => any;
}

function makeStubServer(): { calls: RegisteredCall[]; resource: (...args: unknown[]) => void } {
  const calls: RegisteredCall[] = [];
  return {
    calls,
    resource(...args: unknown[]) {
      const [name, uriOrTemplate, metadata, callback] = args as [
        string,
        string | ResourceTemplate,
        Record<string, unknown>,
        (...a: unknown[]) => unknown,
      ];
      calls.push({ name, uriOrTemplate, metadata, callback });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySkillMap(): Map<string, SkillMetadata> {
  return new Map();
}

// ---------------------------------------------------------------------------
// Template registration
// ---------------------------------------------------------------------------

describe("registerSkillResources — template declarations with read + complete", () => {
  it("registers an MCP ResourceTemplate for declarations with a read handler", () => {
    const server = makeStubServer();

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: () => ({ text: "# placeholder" }),
        },
      ],
    });

    const templateCall = server.calls.find((c) => c.name === "template:docs");
    expect(templateCall).toBeDefined();
    expect(templateCall!.uriOrTemplate).toBeInstanceOf(ResourceTemplate);
    expect(
      (templateCall!.uriOrTemplate as ResourceTemplate).uriTemplate.toString(),
    ).toBe("skill://docs/{product}/SKILL.md");
  });

  it("skips registration when no read handler is provided", () => {
    const server = makeStubServer();

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Index-only template",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          // no read, no complete
        },
      ],
    });

    expect(server.calls.find((c) => c.name === "template:docs")).toBeUndefined();
  });

  it("invokes the read handler with the resolved URI and bound variables", async () => {
    const server = makeStubServer();
    let observedUri: string | undefined;
    let observedVars: Record<string, string> | undefined;

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: (uri, vars) => {
            observedUri = uri;
            observedVars = vars;
            return { text: `# Docs for ${vars.product}` };
          },
        },
      ],
    });

    const call = server.calls.find((c) => c.name === "template:docs")!;
    const result = await call.callback(
      new URL("skill://docs/widget-api/SKILL.md"),
      { product: "widget-api" },
    );

    expect(observedUri).toBe("skill://docs/widget-api/SKILL.md");
    expect(observedVars).toEqual({ product: "widget-api" });
    expect(result.contents[0].text).toBe("# Docs for widget-api");
    expect(result.contents[0].mimeType).toBe("text/markdown");
  });

  it("flattens array-valued template variables to their first element", async () => {
    const server = makeStubServer();
    let observedVars: Record<string, string> | undefined;

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: (_uri, vars) => {
            observedVars = vars;
            return { text: "ok" };
          },
        },
      ],
    });

    const call = server.calls.find((c) => c.name === "template:docs")!;
    await call.callback(new URL("skill://docs/x/SKILL.md"), {
      product: ["x", "y"],
    });

    expect(observedVars).toEqual({ product: "x" });
  });

  it("wires the per-variable completion callback to the ResourceTemplate", async () => {
    const server = makeStubServer();

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: () => ({ text: "ok" }),
          complete: {
            product: (value) =>
              ["widget-api", "gizmo-api", "gadget-api"].filter((p) =>
                p.startsWith(value),
              ),
          },
        },
      ],
    });

    const call = server.calls.find((c) => c.name === "template:docs")!;
    const template = call.uriOrTemplate as ResourceTemplate;
    const completer = template.completeCallback("product");
    expect(completer).toBeDefined();

    const all = await completer!("");
    expect(all).toEqual(["widget-api", "gizmo-api", "gadget-api"]);

    const filtered = await completer!("g");
    expect(filtered).toEqual(["gizmo-api", "gadget-api"]);
  });

  it("returns an error body when the read handler throws", async () => {
    const server = makeStubServer();

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: () => {
            throw new Error("backing store unreachable");
          },
        },
      ],
    });

    const call = server.calls.find((c) => c.name === "template:docs")!;
    const result = await call.callback(
      new URL("skill://docs/x/SKILL.md"),
      { product: "x" },
    );

    expect(result.contents[0].text).toContain("backing store unreachable");
  });

  it("threads SkillMetadata.meta into the SKILL.md resource _meta", () => {
    const server = makeStubServer();
    const skillMap = new Map<string, SkillMetadata>([
      [
        "code-review",
        {
          name: "code-review",
          skillPath: "code-review",
          description: "Review code",
          absolutePath: "/skills/code-review/SKILL.md",
          skillDir: "/skills/code-review",
          documents: [],
          size: 100,
          lastModified: "2026-01-01T00:00:00.000Z",
          meta: {
            "io.modelcontextprotocol.skills/provenance": "acme/internal",
          },
        },
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
      [
        "code-review",
        {
          name: "code-review",
          skillPath: "code-review",
          description: "Review code",
          absolutePath: "/skills/code-review/SKILL.md",
          skillDir: "/skills/code-review",
          documents: [],
          size: 100,
          lastModified: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);

    registerSkillResources(server, skillMap, "/skills", { template: false });
    const skillCall = server.calls.find((c) => c.name === "code-review");
    expect(skillCall!.metadata._meta).toBeUndefined();
  });

  it("throws when a template declaration has complete without read", () => {
    const server = makeStubServer();
    expect(() =>
      registerSkillResources(server, emptySkillMap(), "/skills", {
        template: false,
        templates: [
          {
            name: "docs",
            description: "Per-product docs",
            uriTemplate: "skill://docs/{product}/SKILL.md",
            // complete provided but no read → completion would never wire up
            complete: {
              product: () => ["widget-api"],
            },
          },
        ],
      }),
    ).toThrow(/has `complete` callbacks but no `read` handler/);
  });

  it("allows a template declaration with neither read nor complete (index-only)", () => {
    const server = makeStubServer();
    expect(() =>
      registerSkillResources(server, emptySkillMap(), "/skills", {
        template: false,
        templates: [
          {
            name: "docs",
            description: "Index-only",
            uriTemplate: "skill://docs/{product}/SKILL.md",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("registers skill://index.json by default", () => {
    const server = makeStubServer();
    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: false,
    });
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

  it("registers user templates before the catch-all skill-file template", () => {
    const server = makeStubServer();

    registerSkillResources(server, emptySkillMap(), "/skills", {
      template: true, // catch-all enabled
      templates: [
        {
          name: "docs",
          description: "Per-product docs",
          uriTemplate: "skill://docs/{product}/SKILL.md",
          read: () => ({ text: "ok" }),
        },
      ],
    });

    const docsIdx = server.calls.findIndex((c) => c.name === "template:docs");
    const catchAllIdx = server.calls.findIndex((c) => c.name === "skill-file");
    expect(docsIdx).toBeGreaterThanOrEqual(0);
    expect(catchAllIdx).toBeGreaterThanOrEqual(0);
    expect(docsIdx).toBeLessThan(catchAllIdx);
  });
});
