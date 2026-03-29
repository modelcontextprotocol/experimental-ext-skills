/**
 * Skills Extension SDK — Main barrel exports.
 *
 * Exports shared types, URI utilities, and MIME utilities.
 * Server-specific and client-specific exports are available via
 * subpath imports: "@modelcontextprotocol/ext-skills/server" and
 * "@modelcontextprotocol/ext-skills/client".
 */

export type {
  ManifestFileEntry,
  SkillManifest,
  SkillDocument,
  SkillMetadata,
  SkillSummary,
  SkillDependencyRequest,
  RegisterSkillResourcesOptions,
  ResourceCapabilities,
  ResourceMetadataResult,
} from "./types.js";

export {
  SKILL_URI_SCHEME,
  SKILL_FILENAME,
  MANIFEST_PATH,
  PROMPT_XML_URI,
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isSkillManifestUri,
  isPromptXmlUri,
} from "./uri.js";
export type { ParsedSkillUri } from "./uri.js";

export { getMimeType, isTextMimeType } from "./mime.js";
