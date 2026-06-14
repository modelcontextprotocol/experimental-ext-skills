/**
 * Server-side exports for the Skills Extension SDK.
 */

export {
  discoverSkills,
  registerSkillResources,
  generateSkillIndex,
  loadSkillContent,
  loadDocument,
  scanDocuments,
  isPathWithinBase,
  sha256Digest,
} from "../_server.js";
export type { GenerateSkillIndexOptions } from "../_server.js";

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
  DIRECTORY_READ_METHOD,
  INODE_DIRECTORY_MIME,
  DirectoryReadRequestSchema,
  buildDirectoryTree,
  makeDirectoryReadHandler,
} from "../directory.js";
export type {
  DirectoryChild,
  DirectoryReadResult,
  DirectoryReadHandlerOptions,
} from "../directory.js";
