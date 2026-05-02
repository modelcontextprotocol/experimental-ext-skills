/**
 * Client-side exports for the Skills Extension SDK.
 */

export {
  READ_RESOURCE_TOOL,
  discoverSkills,
  discoverAndBuildCatalog,
  listSkills,
  listSkillsFromIndex,
  listSkillTemplatesFromIndex,
  readSkillUri,
  readSkillContent,
  readSkillArchive,
  parseSkillFrontmatter,
  buildSkillsSummary,
  buildSkillsCatalog,
  readSkillManifest,
  readSkillDocument,
} from "../_client.js";
export type { SkillsClient, ToolDefinition } from "../_client.js";
export type {
  SkillSummary,
  SkillsCatalogOptions,
  DiscoverCatalogOptions,
  DiscoverCatalogResult,
  UnpackedSkillArchive,
  ExtractArchiveOptions,
} from "../types.js";
