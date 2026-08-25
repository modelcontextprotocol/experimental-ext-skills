/**
 * Client-side exports for the Skills Extension SDK.
 */

export {
  READ_RESOURCE_TOOL,
  READ_SKILL_TOOL,
  serverSupportsSkills,
  serverSupportsDirectoryRead,
  listSkills,
  getSkill,
  discoverSkills,
  discoverAndBuildCatalog,
  listSkillsFromInstructions,
  extractSkillUrisFromInstructions,
  readSkill,
  readSkillResource,
  manifestOf,
  checkSkillLimits,
  readSkillUri,
  readSkillUriVerified,
  readSkillContent,
  readSkillDocument,
  verifyDigest,
  frontmatterMatchesEntry,
  parseSkillFrontmatter,
  parseSkillFrontmatterObject,
  skillSummaryFromEntry,
  skillSummariesFromEntries,
  buildSkillsSummary,
  buildSkillsCatalog,
  readDirectory,
  walkDirectory,
} from "../_client.js";
export type { SkillsClient, ToolDefinition } from "../_client.js";
export type {
  SkillResourceRef,
  SkillEntry,
  SkillsListResult,
  SkillsGetResult,
  SkillSummary,
  ReadSkillOptions,
  SkillsCatalogOptions,
  DiscoverSkillsOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  InstructionsUriExtractor,
} from "../types.js";
export {
  SKILLS_LIST_METHOD,
  SKILLS_GET_METHOD,
  DYNAMIC_RESOURCES,
  MAX_RESOURCES_PER_SKILL,
  MAX_TOTAL_SIZE_PER_SKILL,
  SkillsListResultSchema,
  SkillsGetResultSchema,
} from "../skills-methods.js";
export type { DirectoryChild, DirectoryReadResult } from "../directory.js";
