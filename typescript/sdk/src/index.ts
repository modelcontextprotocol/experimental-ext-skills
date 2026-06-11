/**
 * Skills Extension SDK — Main barrel exports.
 *
 * Exports shared types, URI utilities, and MIME utilities.
 * Server-specific and client-specific exports are available via
 * subpath imports: "@modelcontextprotocol/experimental-ext-skills/server"
 * and "@modelcontextprotocol/experimental-ext-skills/client".
 */

export type {
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
  TemplateReadResult,
  TemplateReadCallback,
  TemplateCompletionCallback,
  SkillArchiveDeclaration,
  ArchiveFormat,
  UnpackedSkillArchive,
  ExtractArchiveOptions,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  RegisterSkillResourcesOptions,
} from "./types.js";

export { SKILL_INDEX_SCHEMA, KNOWN_SKILL_INDEX_SCHEMAS } from "./types.js";

export {
  detectArchiveFormat,
  stripArchiveSuffix,
  archiveMimeType,
  archiveSuffix,
  extractSkillArchive,
} from "./archive.js";

export {
  SKILL_URI_SCHEME,
  SKILL_FILENAME,
  INDEX_JSON_URI,
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isIndexJsonUri,
  isValidSkillName,
  extractSkillPathFromUri,
} from "./uri.js";
export type { ParsedSkillUri } from "./uri.js";

export { getMimeType, isTextMimeType } from "./mime.js";
