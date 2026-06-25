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
  SkillArchiveRef,
  SkillIndexEntry,
  SkillIndex,
  SkillArchiveDeclaration,
  ArchiveFormat,
  UnpackedSkillArchive,
  ExtractArchiveOptions,
  ReadSkillArchiveOptions,
  ReadSkillOptions,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  RegisterSkillResourcesOptions,
} from "./types.js";

export {
  detectArchiveFormat,
  stripArchiveSuffix,
  archiveMimeType,
  archiveSuffix,
  extractSkillArchive,
} from "./archive.js";

export {
  DIRECTORY_READ_METHOD,
  INODE_DIRECTORY_MIME,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DirectoryReadRequestSchema,
  DirectoryReadResultSchema,
  buildDirectoryTree,
  makeDirectoryReadHandler,
} from "./directory.js";
export type {
  DirectoryChild,
  DirectoryReadResult,
  DirectoryReadHandlerOptions,
} from "./directory.js";

export { SKILLS_EXTENSION_ID } from "./resource-extensions.js";
export type { SkillsExtensionCapability } from "./resource-extensions.js";

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
