/**
 * @modelcontextprotocol/ext-skills
 *
 * SDK for the Skills as Resources MCP extension pattern.
 *
 * Entry points:
 *   - "@modelcontextprotocol/ext-skills"          — Shared types, URI, and MIME utilities
 *   - "@modelcontextprotocol/ext-skills/server"    — Server-side discovery and registration
 *   - "@modelcontextprotocol/ext-skills/client"    — Client-side reading, tool schema, and summaries
 *
 * @license Apache-2.0
 */

// Types
export type {
  ManifestFileEntry,
  SkillManifest,
  SkillDocument,
  SkillMetadata,
  SkillSummary,
  RegisterSkillResourcesOptions,
  SkillResourceHandles,
} from "./types.js";

// URI utilities
export {
  SKILL_FILENAME,
  MANIFEST_PATH,
  parseSkillUri,
  buildSkillUri,
  isSkillContentUri,
  isSkillManifestUri,
} from "./uri.js";

// MIME utilities
export { getMimeType, isTextMimeType } from "./mime.js";
