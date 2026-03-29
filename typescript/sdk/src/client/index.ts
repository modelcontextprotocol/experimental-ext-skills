/**
 * Client-side exports for the Skills Extension SDK.
 */

export {
  READ_RESOURCE_TOOL,
  listSkills,
  readSkillUri,
  readSkillContent,
  parseSkillFrontmatter,
  buildSkillsSummary,
  readSkillManifest,
  readSkillDocument,
  fetchSkillMetadata,
  listSkillsScoped,
} from "../_client.js";
export type { SkillsClient, ToolDefinition } from "../_client.js";

export { SkillCatalog } from "../catalog.js";
export type { ContextFormatter } from "../catalog.js";
