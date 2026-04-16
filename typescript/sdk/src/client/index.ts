/**
 * Client-side exports for the Skills Extension SDK.
 */

export {
  READ_RESOURCE_TOOL,
  listSkills,
  listSkillsFromIndex,
  listSkillTemplatesFromIndex,
  readSkillUri,
  readSkillContent,
  parseSkillFrontmatter,
  buildSkillsSummary,
  readSkillManifest,
  readSkillDocument,
} from "../_client.js";
export type { SkillsClient, ToolDefinition } from "../_client.js";
