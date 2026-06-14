/**
 * Client-side exports for the Skills Extension SDK.
 */

export {
  READ_RESOURCE_TOOL,
  READ_SKILL_TOOL,
  discoverSkills,
  discoverAndBuildCatalog,
  listSkills,
  listSkillsFromIndex,
  listSkillsFromInstructions,
  extractSkillUrisFromInstructions,
  readSkillUri,
  readSkillContent,
  readSkillArchive,
  parseSkillFrontmatter,
  buildSkillsSummary,
  buildSkillsCatalog,
  readSkillDocument,
  verifyDigest,
  readSkillUriVerified,
  serverSupportsDirectoryRead,
  readDirectory,
  walkDirectory,
} from "../_client.js";
export type { SkillsClient, ToolDefinition } from "../_client.js";
export type {
  SkillSummary,
  SkillArchiveRef,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
  UnpackedSkillArchive,
  ExtractArchiveOptions,
} from "../types.js";
export type { DirectoryChild, DirectoryReadResult } from "../directory.js";
