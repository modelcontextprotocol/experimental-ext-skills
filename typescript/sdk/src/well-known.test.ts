import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import * as zlib from "node:zlib";
import { fetchFromWellKnown, refreshFromWellKnown } from "./well-known.js";
import { SKILL_INDEX_SCHEMA } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function sha256(content: string | Buffer): string {
  const buf = typeof content === "string" ? Buffer.from(content) : content;
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

const SKILL_CONTENT = `---
name: test-skill
description: A test skill
---

# Test Skill
Instructions here.
`;

function makeIndex(skills: unknown[], schema = SKILL_INDEX_SCHEMA) {
  return { $schema: schema, skills };
}

/** Create a minimal .tar.gz archive with a single file. */
function createTarGz(files: Record<string, string>): Buffer {
  // Build a minimal tar archive manually (512-byte header + content per file)
  const buffers: Buffer[] = [];

  for (const [name, content] of Object.entries(files)) {
    const contentBuf = Buffer.from(content);
    const header = Buffer.alloc(512);

    // File name (offset 0, 100 bytes)
    header.write(name, 0, 100, "utf-8");
    // File mode (offset 100, 8 bytes)
    header.write("0000644\0", 100, 8, "utf-8");
    // Owner ID (offset 108, 8 bytes)
    header.write("0000000\0", 108, 8, "utf-8");
    // Group ID (offset 116, 8 bytes)
    header.write("0000000\0", 116, 8, "utf-8");
    // File size in octal (offset 124, 12 bytes)
    header.write(contentBuf.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
    // Modification time (offset 136, 12 bytes)
    header.write("00000000000\0", 136, 12, "utf-8");
    // Type flag (offset 156, 1 byte) - '0' for regular file
    header.write("0", 156, 1, "utf-8");
    // Magic (offset 257, 6 bytes)
    header.write("ustar\0", 257, 6, "utf-8");
    // Version (offset 263, 2 bytes)
    header.write("00", 263, 2, "utf-8");

    // Compute checksum (offset 148, 8 bytes)
    // First fill checksum field with spaces
    header.write("        ", 148, 8, "utf-8");
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");

    buffers.push(header);
    buffers.push(contentBuf);

    // Pad to 512-byte boundary
    const remainder = contentBuf.length % 512;
    if (remainder > 0) {
      buffers.push(Buffer.alloc(512 - remainder));
    }
  }

  // End-of-archive marker (two 512-byte blocks of zeros)
  buffers.push(Buffer.alloc(1024));

  const tarBuf = Buffer.concat(buffers);
  return zlib.gzipSync(tarBuf);
}

type MockFetchFn = ReturnType<typeof vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>>;

function mockFetch(routes: Record<string, { status?: number; body: string | Buffer; statusText?: string }>): MockFetchFn {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const route = routes[urlStr];
    if (!route) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }
    const body = typeof route.body === "string" ? route.body : route.body;
    return new Response(body, {
      status: route.status ?? 200,
      statusText: route.statusText ?? "OK",
    });
  }) as MockFetchFn;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-skills-test-"));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Successful fetch
// ---------------------------------------------------------------------------

describe("fetchFromWellKnown", () => {
  it("fetches and caches skill-md entries", async () => {
    const index = makeIndex([
      { name: "code-review", type: "skill-md", description: "Review", url: "https://example.com/skills/code-review/SKILL.md" },
      { name: "git-commit", type: "skill-md", description: "Commit", url: "https://example.com/skills/git-commit/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/skills/code-review/SKILL.md": { body: SKILL_CONTENT },
      "https://example.com/skills/git-commit/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0]).toEqual({ name: "code-review", skillPath: "code-review", cached: false });
    expect(result.skills[1]).toEqual({ name: "git-commit", skillPath: "git-commit", cached: false });
    expect(result.skipped).toEqual([]);
    expect(result.errors).toEqual([]);

    // Verify files on disk
    expect(fs.existsSync(path.join(tmpDir, "code-review", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "git-commit", "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, "code-review", "SKILL.md"), "utf-8")).toBe(SKILL_CONTENT);
  });

  it("fetches and extracts archive entries", async () => {
    const archiveContent = createTarGz({
      "SKILL.md": SKILL_CONTENT,
      "references/REF.md": "# Reference",
    });

    const index = makeIndex([
      { name: "bundled-skill", type: "archive", description: "Bundled", url: "https://example.com/bundled.tar.gz" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/bundled.tar.gz": { body: archiveContent },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toEqual({ name: "bundled-skill", skillPath: "bundled-skill", cached: false });
    expect(fs.existsSync(path.join(tmpDir, "bundled-skill", "SKILL.md"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // $schema validation
  // ---------------------------------------------------------------------------

  it("warns but proceeds with unknown $schema", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = makeIndex(
      [{ name: "a", type: "skill-md", description: "A", url: "https://example.com/a/SKILL.md" }],
      "https://example.com/unknown-schema",
    );

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/a/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("does not warn with known $schema", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = makeIndex([
      { name: "a", type: "skill-md", description: "A", url: "https://example.com/a/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/a/SKILL.md": { body: SKILL_CONTENT },
    });

    await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Digest verification
  // ---------------------------------------------------------------------------

  it("verifies digest and rejects on mismatch", async () => {
    const wrongDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const index = makeIndex([
      { name: "bad", type: "skill-md", description: "Bad", url: "https://example.com/bad/SKILL.md", digest: wrongDigest },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/bad/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Digest mismatch");
  });

  it("accepts correct digest", async () => {
    const correctDigest = sha256(SKILL_CONTENT);
    const index = makeIndex([
      { name: "good", type: "skill-md", description: "Good", url: "https://example.com/good/SKILL.md", digest: correctDigest },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/good/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Digest caching
  // ---------------------------------------------------------------------------

  it("uses digest cache on second call (refreshFromWellKnown)", async () => {
    const digest = sha256(SKILL_CONTENT);
    const index = makeIndex([
      { name: "cached", type: "skill-md", description: "Cached", url: "https://example.com/cached/SKILL.md", digest },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/cached/SKILL.md": { body: SKILL_CONTENT },
    });

    // First fetch — downloads
    const result1 = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch, useDigestCache: true });
    expect(result1.skills[0].cached).toBe(false);

    // Second fetch — cache hit
    const result2 = await refreshFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });
    expect(result2.skills[0].cached).toBe(true);

    // SKILL.md fetch should only have been called once (not on the second call)
    const skillFetches = fetch.mock.calls.filter(
      (call) => String(call[0]).includes("cached/SKILL.md"),
    );
    expect(skillFetches).toHaveLength(1);
  });

  it("re-downloads when digest changes", async () => {
    const digest1 = sha256(SKILL_CONTENT);
    const updatedContent = SKILL_CONTENT + "\nUpdated.";
    const digest2 = sha256(updatedContent);

    const fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.endsWith("index.json")) {
        // Return different digests on successive calls
        const callCount = fetch.mock.calls.filter(
          (c) => String(c[0]).endsWith("index.json"),
        ).length;
        const currentDigest = callCount <= 1 ? digest1 : digest2;
        return new Response(JSON.stringify(makeIndex([
          { name: "evolving", type: "skill-md", description: "Evolving", url: "https://example.com/evolving/SKILL.md", digest: currentDigest },
        ])));
      }
      if (urlStr.includes("evolving/SKILL.md")) {
        const callCount = fetch.mock.calls.filter(
          (c) => String(c[0]).includes("evolving/SKILL.md"),
        ).length;
        return new Response(callCount <= 1 ? SKILL_CONTENT : updatedContent);
      }
      return new Response(null, { status: 404 });
    }) as MockFetchFn;

    // First fetch
    const result1 = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch, useDigestCache: true });
    expect(result1.skills[0].cached).toBe(false);

    // Second fetch — digest changed, should re-download
    const result2 = await refreshFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });
    expect(result2.skills[0].cached).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // URL resolution
  // ---------------------------------------------------------------------------

  it("resolves relative URLs against the index URL", async () => {
    const index = makeIndex([
      { name: "relative", type: "skill-md", description: "Relative", url: "skills/relative/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/.well-known/agent-skills/skills/relative/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
  });

  it("resolves path-absolute URLs", async () => {
    const index = makeIndex([
      { name: "absolute-path", type: "skill-md", description: "Abs", url: "/skills/abs/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/skills/abs/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
  });

  it("uses absolute URLs as-is", async () => {
    const index = makeIndex([
      { name: "cdn", type: "skill-md", description: "CDN", url: "https://cdn.example.com/skills/cdn/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://cdn.example.com/skills/cdn/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Skipped entries
  // ---------------------------------------------------------------------------

  it("skips skill:// URLs", async () => {
    const index = makeIndex([
      { name: "mcp-only", type: "skill-md", description: "MCP", url: "skill://mcp-only/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("skill://");
  });

  it("skips mcp-resource-template entries", async () => {
    const index = makeIndex([
      { name: "tmpl", type: "mcp-resource-template", description: "Template", uriTemplate: "skill://t/{x}/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].type).toBe("mcp-resource-template");
  });

  it("skips entries with unrecognized types", async () => {
    const index = makeIndex([
      { name: "weird", type: "unknown-format", description: "Weird" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("Unrecognized");
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it("handles network errors gracefully", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Network down")) as MockFetchFn;

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Network down");
  });

  it("handles HTTP error on index fetch", async () => {
    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { status: 500, body: "error", statusText: "Internal Server Error" },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("500");
  });

  it("handles HTTP error on skill fetch", async () => {
    const index = makeIndex([
      { name: "missing", type: "skill-md", description: "Missing", url: "https://example.com/missing/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/missing/SKILL.md": { status: 404, body: "not found", statusText: "Not Found" },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe("missing");
  });

  it("handles malformed JSON in index", async () => {
    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: "not json{{{" },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Parse failed");
  });

  // ---------------------------------------------------------------------------
  // Path traversal rejection
  // ---------------------------------------------------------------------------

  it("rejects path traversal in skill name", async () => {
    const index = makeIndex([
      { name: "../../../etc", type: "skill-md", description: "Evil", url: "https://example.com/evil/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Invalid skill path");
  });

  // ---------------------------------------------------------------------------
  // Archive: missing SKILL.md
  // ---------------------------------------------------------------------------

  it("errors when archive has no SKILL.md at root", async () => {
    const archiveContent = createTarGz({
      "README.md": "# Not a skill",
    });

    const index = makeIndex([
      { name: "no-skill-md", type: "archive", description: "No SKILL.md", url: "https://example.com/no-skill.tar.gz" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/no-skill.tar.gz": { body: archiveContent },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("SKILL.md");
  });

  // ---------------------------------------------------------------------------
  // Correct directory layout
  // ---------------------------------------------------------------------------

  it("creates correct directory layout for multi-segment skillPaths", async () => {
    // Using entry name with slashes as skillPath
    const index = makeIndex([
      { name: "acme/billing", type: "skill-md", description: "Billing", url: "https://example.com/billing/SKILL.md" },
    ]);

    const fetch = mockFetch({
      "https://example.com/.well-known/agent-skills/index.json": { body: JSON.stringify(index) },
      "https://example.com/billing/SKILL.md": { body: SKILL_CONTENT },
    });

    const result = await fetchFromWellKnown({ domain: "example.com", cacheDir: tmpDir, fetch });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skillPath).toBe("acme/billing");
    expect(fs.existsSync(path.join(tmpDir, "acme", "billing", "SKILL.md"))).toBe(true);
  });
});
