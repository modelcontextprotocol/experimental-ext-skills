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
} from "../_server.js";

export {
  declareSkillsExtension,
} from "../resource-extensions.js";
export type { SkillsServer, ServerInternals } from "../resource-extensions.js";
