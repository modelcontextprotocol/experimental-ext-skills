/**
 * @modelcontextprotocol/ext-skills
 *
 * SDK for the Skills Extension (SEP-2640) — exposing Agent Skills via MCP
 * resources under the `skill://` URI scheme.
 *
 * Entry points:
 *   - "@modelcontextprotocol/ext-skills"          — Shared types & URI utilities
 *   - "@modelcontextprotocol/ext-skills/server"   — Discovery & resource registration
 *   - "@modelcontextprotocol/ext-skills/client"   — Discovery & reading helpers
 *
 * @license Apache-2.0
 */

export type {
  SkillDocument,
  SkillMetadata,
  SkillSummary,
  SkillIndex,
  SkillIndexEntry,
  SkillMdIndexEntry,
  ArchiveIndexEntry,
  ResourceTemplateIndexEntry,
  RegisterSkillResourcesOptions,
  RegisterSkillArchiveOptions,
  RegisterSkillArchiveResult,
  RegisterSkillTemplateOptions,
  RegisterSkillTemplateResult,
  SkillTemplateContext,
  SkillTemplateContent,
  SkillResourceHandles,
} from "./types.js";

export {
  SKILL_SCHEME,
  SKILL_FILENAME,
  SKILL_INDEX_URI,
  parseSkillContentUri,
  buildSkillUri,
  buildSkillContentUri,
  extractSkillName,
  isSkillContentUri,
  isSkillIndexUri,
} from "./uri.js";

export type { ParsedSkillContentUri } from "./uri.js";

export { getMimeType, isTextMimeType } from "./mime.js";
