/**
 * Server-side exports for the Skills Extension SDK.
 */

export {
  discoverSkills,
  registerSkillResources,
  buildSkillEntry,
  warnIfOverLimits,
  makeSkillsListHandler,
  makeSkillsGetHandler,
  makeDirectoryReadHandler,
  loadSkillContent,
  loadDocument,
  scanDocuments,
  scanSkillDirectory,
  isPathWithinBase,
  sha256Digest,
  DEFAULT_SKILLS_LIST_PAGE_SIZE,
} from "../_server.js";
export type {
  SkillsListHandlerOptions,
  SkillsHandlerContext,
} from "../_server.js";

export {
  declareSkillsExtension,
  SKILLS_EXTENSION_ID,
} from "../resource-extensions.js";
export type {
  SkillsServer,
  ServerInternals,
  SkillsExtensionCapability,
} from "../resource-extensions.js";

export {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
  DYNAMIC_RESOURCES,
  MAX_RESOURCES_PER_SKILL,
  MAX_TOTAL_SIZE_PER_SKILL,
  SkillsListParamsSchema,
  SkillsListResultSchema,
  SkillsGetParamsSchema,
  SkillsGetResultSchema,
} from "../skills-methods.js";

export {
  DIRECTORY_READ_METHOD,
  INODE_DIRECTORY_MIME,
  DirectoryReadParamsSchema,
  DirectoryReadResultSchema,
  buildDirectoryTree,
} from "../directory.js";
export type {
  DirectoryChild,
  DirectoryReadResult,
  DirectoryReadHandlerOptions,
} from "../directory.js";

export type {
  SkillResourceRef,
  SkillEntry,
  SkillsListResult,
  SkillsGetResult,
  SkillDocument,
  SkillMetadata,
  RegisterSkillResourcesOptions,
} from "../types.js";
