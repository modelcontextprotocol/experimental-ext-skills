/**
 * SEP-2093 shim: Resource Contents Metadata and Capabilities.
 *
 * Provides custom request handlers for SEP-2093 features that the MCP SDK
 * (v1.27.1) does not yet natively support:
 *
 *   1. resources/metadata — fetch resource metadata without content
 *   2. resources/list with uri scoping — filter resources by URI prefix
 *   3. Per-resource capabilities — expressed via _meta
 *   4. Extension declaration — io.modelcontextprotocol/skills in capabilities
 *
 * When the SDK adds native support, this shim can be removed.
 *
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2093
 */

import { z } from "zod";
import type { SkillMetadata, ResourceCapabilities } from "./types.js";
import { buildSkillUri, MANIFEST_PATH, PROMPT_XML_URI } from "./uri.js";

// ---------------------------------------------------------------------------
// Structural types (avoids duplicate-SDK private-property issues)
// ---------------------------------------------------------------------------

/** Minimal interface for Server.setRequestHandler(). */
export interface RequestHandlerRegistrar {
  setRequestHandler<T extends z.ZodType>(
    schema: T,
    handler: (request: z.infer<T>, extra: unknown) => Promise<unknown>,
  ): void;
}

/**
 * Minimal interface for the low-level Server internals we need to access.
 * We reach into private fields to override handlers and patch capabilities.
 */
export interface ServerInternals extends RequestHandlerRegistrar {
  /** Private Map of method → handler. We use this to grab and wrap existing handlers. */
  _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
  /** Private capabilities object. We patch this to add `extensions` before connect. */
  _capabilities: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const ResourcesMetadataRequestSchema = z.object({
  method: z.literal("resources/metadata"),
  params: z.object({ uri: z.string() }),
});

const ResourceEntrySchema = z.object({
  uri: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  annotations: z.record(z.unknown()).optional(),
  capabilities: z
    .object({ list: z.boolean().optional(), subscribe: z.boolean().optional() })
    .optional(),
  _meta: z.record(z.unknown()).optional(),
});

/**
 * SEP-2093 specifies: ReadResourceMetadataResult { resource: Resource }
 */
export const ResourcesMetadataResultSchema = z.object({
  resource: ResourceEntrySchema,
});

export const ScopedListResultSchema = z.object({
  resources: z.array(ResourceEntrySchema),
});

/**
 * Schema for resources/list with optional URI scoping (SEP-2093).
 * This extends the standard resources/list with an optional `uri` param.
 */
export const ScopedListResourcesRequestSchema = z.object({
  method: z.literal("resources/list"),
  params: z
    .object({
      uri: z.string().optional(),
      cursor: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

/**
 * Build a _meta object with per-resource capabilities.
 * Capabilities live in _meta until the SDK adds a native field.
 */
export function buildCapabilitiesMeta(
  capabilities: ResourceCapabilities,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extra,
    "io.modelcontextprotocol/capabilities": capabilities,
  };
}

// ---------------------------------------------------------------------------
// Shared resource-descriptor builder
// ---------------------------------------------------------------------------

/** Shape returned by resourceDescriptors(). */
interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  annotations: Record<string, unknown>;
  capabilities: ResourceCapabilities;
  _meta?: Record<string, unknown>;
}

/** Default capabilities for skill resources (static, no subscriptions). */
const STATIC_CAPS: ResourceCapabilities = { list: false, subscribe: false };

/**
 * Yield all resource descriptors for a skill map — single source of truth
 * for metadata used by both the metadata and scoped-list handlers.
 */
function* resourceDescriptors(
  skillMap: Map<string, SkillMetadata>,
): Generator<ResourceDescriptor> {
  for (const [skillPath, skill] of skillMap) {
    // SKILL.md
    yield {
      uri: buildSkillUri(skillPath),
      name: skill.name,
      description: skill.description,
      mimeType: "text/markdown",
      annotations: {
        audience: ["user", "assistant"],
        priority: 1.0,
        lastModified: skill.lastModified,
      },
      capabilities: STATIC_CAPS,
      _meta: buildCapabilitiesMeta(
        STATIC_CAPS,
        skill.metadata?.version
          ? { "io.agentskills/version": skill.metadata.version }
          : undefined,
      ),
    };

    // _manifest
    yield {
      uri: buildSkillUri(skillPath, MANIFEST_PATH),
      name: `${skill.name}-manifest`,
      description: `File manifest for skill '${skill.name}' with content hashes`,
      mimeType: "application/json",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.5,
        lastModified: skill.lastModified,
      },
      capabilities: STATIC_CAPS,
    };

    // Supporting files
    for (const doc of skill.documents) {
      yield {
        uri: buildSkillUri(skillPath, doc.path),
        name: `${skill.name}/${doc.path}`,
        description: `Supporting file for skill '${skill.name}'`,
        mimeType: doc.mimeType,
        annotations: { audience: ["user", "assistant"], priority: 0.2 },
        capabilities: STATIC_CAPS,
      };
    }
  }

  // prompt-xml (not per-skill, but still a resource)
  yield {
    uri: PROMPT_XML_URI,
    name: "skills-prompt-xml",
    description: "XML representation of available skills for system prompt injection",
    mimeType: "application/xml",
    annotations: { audience: ["user", "assistant"], priority: 0.3 },
    capabilities: STATIC_CAPS,
  };
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Register resources/metadata — returns metadata for a URI without content.
 */
export function registerMetadataHandler(
  server: RequestHandlerRegistrar,
  skillMap: Map<string, SkillMetadata>,
): void {
  server.setRequestHandler(ResourcesMetadataRequestSchema, async (request) => {
    const { uri } = request.params;
    for (const desc of resourceDescriptors(skillMap)) {
      if (desc.uri === uri) return { resource: desc };
    }
    throw new Error(`Resource not found: ${uri}`);
  });
}

/**
 * Override the built-in resources/list handler to support URI scoping (SEP-2093).
 *
 * Grabs the original handler registered by McpServer, wraps it to add
 * URI prefix filtering when a `uri` param is present. When scoped to
 * "skill://", only SKILL.md entries are returned per the SEP.
 *
 * Must be called AFTER McpServer has registered its resources/list handler
 * (i.e., after the first server.resource() call).
 */
export function overrideResourcesListWithScoping(
  server: ServerInternals,
): void {
  const originalHandler = server._requestHandlers.get("resources/list");
  if (!originalHandler) {
    throw new Error(
      "resources/list handler not found — call this after registering resources",
    );
  }

  server.setRequestHandler(ScopedListResourcesRequestSchema, async (request, extra) => {
    // Delegate to the original McpServer handler to get all resources
    const result = (await originalHandler(request, extra)) as {
      resources: Array<{ uri: string; [key: string]: unknown }>;
    };

    const scope = request.params?.uri;
    if (!scope) return result;

    // Filter: when scoped, only return SKILL.md entries (per SEP)
    result.resources = result.resources.filter((r) => {
      if (!r.uri.startsWith(scope)) return false;
      // Per the SEP: "SHOULD contain only SKILL.md entries"
      return r.uri.endsWith("/SKILL.md") || r.uri.toLowerCase().endsWith("/skill.md");
    });

    return result;
  });
}

/**
 * Declare the skills extension in server capabilities per SEP-2133.
 *
 * Patches the low-level Server's _capabilities to add:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = {}
 *
 * Must be called BEFORE server.connect() (capabilities are sent during
 * the initialize handshake).
 *
 * This is a workaround — the SDK's ServerCapabilities schema doesn't
 * include `extensions` yet (see typescript-sdk#1630). When merged,
 * this can be replaced with a normal registerCapabilities() call.
 */
export function declareSkillsExtension(server: ServerInternals): void {
  if (!server._capabilities) {
    server._capabilities = {};
  }
  if (!server._capabilities.extensions) {
    server._capabilities.extensions = {};
  }
  (server._capabilities.extensions as Record<string, unknown>)[
    "io.modelcontextprotocol/skills"
  ] = {};
}
