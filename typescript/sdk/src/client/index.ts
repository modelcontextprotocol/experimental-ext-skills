/**
 * Client-side exports for the Skills as Resources SDK.
 *
 * Import from "@modelcontextprotocol/ext-skills/client".
 */

export {
  READ_RESOURCE_TOOL,
  listSkillResources,
  readSkillContent,
  readSkillManifest,
  readSkillDocument,
  parseSkillFrontmatter,
  buildSkillsSummary,
} from "../_client.js";

export { generateSkillsXMLFromSummaries } from "../xml.js";
