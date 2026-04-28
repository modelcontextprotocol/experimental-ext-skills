/**
 * Server-side exports for @modelcontextprotocol/ext-skills.
 *
 * Import from "@modelcontextprotocol/ext-skills/server".
 */

export {
  discoverSkills,
  registerSkillResources,
  registerSkillArchive,
  registerSkillTemplate,
  generateSkillIndex,
  isPathWithinBase,
  scanDocuments,
  loadSkillContent,
  loadDocument,
  SKILL_INDEX_SCHEMA,
  SKILL_META_PREFIX,
  SKILLS_EXTENSION,
} from "../_server.js";

export { packTar, packSkillTarGz } from "../archive.js";

export { generateSkillsXML } from "../xml.js";
