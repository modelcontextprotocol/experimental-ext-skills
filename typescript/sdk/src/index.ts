/**
 * Skills Extension SDK — Main barrel exports.
 *
 * Exports shared types, URI utilities, and MIME utilities.
 * Server-specific and client-specific exports are available via
 * subpath imports: "@modelcontextprotocol/experimental-ext-skills/server"
 * and "@modelcontextprotocol/experimental-ext-skills/client".
 */

export type {
  ManifestFileEntry,
  SkillManifest,
  SkillDocument,
  SkillMetadata,
  SkillSummary,
  SkillMdIndexEntry,
  McpResourceTemplateIndexEntry,
  ArchiveIndexEntry,
  SkillIndexEntry,
  SkillIndex,
  SkillTemplateEntry,
  SkillTemplateDeclaration,
  SkillsCatalogOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  WellKnownFetchOptions,
  WellKnownFetchResult,
  WellKnownSkillResult,
  RegisterSkillResourcesOptions,
} from "./types.js";

export { SKILL_INDEX_SCHEMA, KNOWN_SKILL_INDEX_SCHEMAS } from "./types.js";

export {
  SKILL_URI_SCHEME,
  SKILL_FILENAME,
  MANIFEST_PATH,
  PROMPT_XML_URI,
  INDEX_JSON_URI,
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isSkillManifestUri,
  isPromptXmlUri,
  isIndexJsonUri,
} from "./uri.js";
export type { ParsedSkillUri } from "./uri.js";

export { getMimeType, isTextMimeType } from "./mime.js";
