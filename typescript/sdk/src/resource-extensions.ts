/**
 * Extension declaration for the Skills Extension SEP.
 *
 * Provides the SEP-2133 extension capability declaration:
 *   capabilities.extensions["io.modelcontextprotocol/skills"] = {}
 *
 * TODO: Replace with native SDK support if/when resolved:
 *   - extensions in capabilities: https://github.com/modelcontextprotocol/typescript-sdk/pull/1630
 */

/**
 * Minimal interface for the low-level Server internals we need to access.
 * We reach into private fields to patch capabilities.
 * TODO: Remove if SDK adds extensions support (typescript-sdk#1630).
 */
export interface ServerInternals {
  /** Private capabilities object. We patch this to add `extensions` before connect. */
  _capabilities: Record<string, unknown>;
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
 * TODO: Replace with registerCapabilities({ extensions: { ... } }) if
 *       the SDK adds support. See: https://github.com/modelcontextprotocol/typescript-sdk/pull/1630
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
