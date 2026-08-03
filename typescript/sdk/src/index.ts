/**
 * Skills Extension SDK — Main barrel exports.
 *
 * Exports shared types, protocol schemas, URI utilities, and MIME utilities.
 * Server-specific and client-specific exports are available via
 * subpath imports: "@modelcontextprotocol/experimental-ext-skills/server"
 * and "@modelcontextprotocol/experimental-ext-skills/client".
 */

export type {
  SkillResourceRef,
  SkillEntry,
  SkillsListResult,
  SkillsGetResult,
  SkillDocument,
  SkillMetadata,
  SkillSummary,
  ReadSkillOptions,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  RegisterSkillResourcesOptions,
} from "./types.js";

export {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
  SkillResourceRefSchema,
  SkillEntrySchema,
  SkillsListParamsSchema,
  SkillsListResultSchema,
  SkillsGetParamsSchema,
  SkillsGetResultSchema,
} from "./skills-methods.js";

export {
  DIRECTORY_READ_METHOD,
  INODE_DIRECTORY_MIME,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DirectoryReadParamsSchema,
  DirectoryReadResultSchema,
  buildDirectoryTree,
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
  parseSkillUri,
  resolveSkillFileUri,
  buildSkillUri,
  isSkillContentUri,
  isValidSkillName,
  extractSkillPathFromUri,
} from "./uri.js";
export type { ParsedSkillUri } from "./uri.js";

export { getMimeType, isTextMimeType } from "./mime.js";
