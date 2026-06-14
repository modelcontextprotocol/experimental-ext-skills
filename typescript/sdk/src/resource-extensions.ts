/**
 * Extension declaration for the Skills Extension SEP.
 *
 * Declares the extension capability:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = { ... }
 *
 * Uses the SDK's native registerCapabilities API (v1.29.0+).
 */

/** Reverse-domain identifier for the skills extension (SEP-2640). */
export const SKILLS_EXTENSION_ID = "io.modelcontextprotocol/skills";

/**
 * The skills extension capability object a server advertises in its
 * `initialize` response. An empty object means "supports the extension with
 * no optional features".
 */
export interface SkillsExtensionCapability {
  /**
   * Server implements the SEP-2640 `resources/directory/read` method.
   * Default `false`. Clients MUST NOT call `resources/directory/read`
   * against a server that has not declared `directoryRead: true`.
   */
  directoryRead?: boolean;
}

/**
 * Minimal structural interface for a Server that supports registerCapabilities.
 * Using a structural type avoids issues with duplicate SDK installations
 * causing private-property type incompatibilities (same pattern as SkillsClient).
 */
export interface SkillsServer {
  registerCapabilities(capabilities: {
    extensions?: Record<string, SkillsExtensionCapability>;
  }): void;
}

/** @deprecated Use {@link SkillsServer} instead. */
export type ServerInternals = SkillsServer;

/**
 * Declare the skills extension in server capabilities (SEP-2640).
 *
 * Registers:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = capability
 *
 * Pass `{ directoryRead: true }` when the server implements
 * `resources/directory/read` (see `registerSkillResources({ directoryRead:
 * true })`). With no argument an empty capability object is declared.
 *
 * Must be called BEFORE server.connect() — capabilities are sent during the
 * initialize handshake.
 */
export function declareSkillsExtension(
  server: SkillsServer,
  capability: SkillsExtensionCapability = {},
): void {
  server.registerCapabilities({
    extensions: { [SKILLS_EXTENSION_ID]: capability },
  });
}
