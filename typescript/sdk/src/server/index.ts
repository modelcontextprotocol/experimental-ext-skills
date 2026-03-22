/**
 * Server-side exports for the Skills Extension SDK.
 */

export {
  discoverSkills,
  registerSkillResources,
  loadSkillContent,
  loadDocument,
  scanDocuments,
  isPathWithinBase,
} from "../_server.js";

export {
  registerMetadataHandler,
  overrideResourcesListWithScoping,
  declareSkillsExtension,
  buildCapabilitiesMeta,
  ResourcesMetadataRequestSchema,
  ResourcesMetadataResultSchema,
  ScopedListResultSchema,
  ScopedListResourcesRequestSchema,
} from "../resource-extensions.js";
export type { RequestHandlerRegistrar, ServerInternals } from "../resource-extensions.js";
