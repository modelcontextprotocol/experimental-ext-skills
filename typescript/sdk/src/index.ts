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
  escapeXml,
  generateSkillsXML,
  generateSkillsXMLFromSummaries,
} from "./xml.js";

// Server-side
export {
  discoverSkills,
  loadSkillContent,
  loadDocument,
  isPathWithinBase,
  scanDocuments,
  registerSkillResources,
} from "./server.js";

// Client-side
export {
  listSkillResources,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "./client.js";

// Resource template discovery
export type {
  SkillTemplate,
  ManifestFileEntryWithUri,
  SkillManifestWithUris,
  LoadedTemplateSkill,
} from "./template.js";
export {
  extractTemplateVariables,
  expandTemplate,
  isSkillTemplate,
  isSkillManifestTemplate,
  detectSkillNameVariable,
  listSkillTemplates,
  completeTemplateArg,
  discoverSkillsFromTemplate,
  loadSkillFromTemplate,
  resolveManifestFiles,
  discoverAllSkillsFromTemplates,
} from "./template.js";
