/**
 * Extension declaration for the Skills Extension SEP.
 *
 * Declares the SEP-2133 extension capability:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = {}
 *
 * Uses the SDK's native registerCapabilities API (v1.29.0+).
 */

/**
 * Minimal structural interface for a Server that supports registerCapabilities.
 * Using a structural type avoids issues with duplicate SDK installations
 * causing private-property type incompatibilities (same pattern as SkillsClient).
 */
export interface SkillsServer {
  registerCapabilities(capabilities: {
    extensions?: Record<string, object>;
  }): void;
}

/**
 * Declare the skills extension in server capabilities per SEP-2133.
 *
 * Registers:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = {}
 *
 * Must be called BEFORE server.connect() (capabilities are sent during
 * the initialize handshake).
 */
/** @deprecated Use {@link SkillsServer} instead. */
export type ServerInternals = SkillsServer;

/**
 * Declare the skills extension in server capabilities per SEP-2133.
 *
 * Registers:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = {}
 *
 * Must be called BEFORE server.connect() (capabilities are sent during
 * the initialize handshake).
 */
export function declareSkillsExtension(server: SkillsServer): void {
  server.registerCapabilities({
    extensions: { "io.modelcontextprotocol/skills": {} },
  });
}
