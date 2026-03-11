/**
 * @ext-modelcontextprotocol/skills
 *
 * SDK for the Skills as Resources MCP extension pattern.
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
  SkillDependencyRequest,
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

// XML generation
export {
  generateSkillsXML,
  generateSkillsXMLFromSummaries,
} from "./xml.js";

// Server-side
export {
  discoverSkills,
  registerSkillResources,
  isPathWithinBase,
} from "./server.js";

// Client-side
export {
  READ_RESOURCE_TOOL,
  listSkillResources,
  readSkillContent,
  readSkillManifest,
  readSkillDocument,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "./client.js";

// Skill catalog with dependency resolution
export { SkillCatalog } from "./catalog.js";
export type { ContextFormatter } from "./catalog.js";
