/**
 * Type definitions for the Skills Extension SDK.
 *
 * Key change from previous version: SkillMetadata now separates `skillPath`
 * (the multi-segment URI locator, e.g., "acme/billing/refunds") from `name`
 * (the skill identity from YAML frontmatter). This reflects the PR #70
 * design where URI path is a locator, not an identifier.
 *
 * The skill map is keyed by `skillPath`, not `name`, since each skill has a
 * unique filesystem path within a server but two skills could share a
 * frontmatter name across different directories.
 */

/**
 * A file entry in the skill manifest, including content hash.
 * Used in the skill://{skillPath}/_manifest resource.
 */
export interface ManifestFileEntry {
  /** Relative path from skill root (e.g., "SKILL.md", "references/REFERENCE.md") */
  path: string;
  /** File size in bytes */
  size: number;
  /** Content hash in format "sha256:<hex>" */
  hash: string;
}

/**
 * Pre-computed manifest for a skill, listing all files with hashes.
 * Served at skill://{skillPath}/_manifest.
 */
export interface SkillManifest {
  /** Skill name from frontmatter */
  skill: string;
  /** Multi-segment skill path (URI locator) */
  skillPath: string;
  /** All files in the skill directory, including SKILL.md */
  files: ManifestFileEntry[];
}

/**
 * A supplementary document found in a skill's subdirectories.
 */
export interface SkillDocument {
  /** Relative path from skill root (e.g., "references/REFERENCE.md") */
  path: string;
  /** MIME type based on file extension */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** SHA256 hash of file content in format "sha256:<hex>" */
  hash: string;
}

/**
 * Metadata extracted from a skill's SKILL.md YAML frontmatter,
 * extended with document scanning results and pre-computed manifest.
 *
 * Key distinction (PR #70):
 * - `name` is the skill's identity from frontmatter
 * - `skillPath` is the multi-segment URI locator (e.g., "acme/billing/refunds")
 * These are intentionally decoupled.
 */
export interface SkillMetadata {
  /** Skill identity from YAML frontmatter — NOT derived from path */
  name: string;
  /** Multi-segment URI locator (e.g., "acme/billing/refunds") */
  skillPath: string;
  /** Skill description from YAML frontmatter */
  description: string;
  /** Absolute filesystem path to the SKILL.md file */
  absolutePath: string;
  /** Absolute filesystem path to the skill's directory */
  skillDir: string;
  /** Optional extra frontmatter metadata fields */
  metadata?: Record<string, string>;
  /** MCP server dependencies declared in frontmatter */
  dependencies?: string[];
  /** Supplementary files found in the skill directory */
  documents: SkillDocument[];
  /** Pre-computed file manifest */
  manifest: SkillManifest;
  /** ISO 8601 timestamp from SKILL.md file mtime */
  lastModified: string;
}

/**
 * Lightweight client-side summary of a discovered skill.
 * Built from resources/list results and URI parsing.
 */
export interface SkillSummary {
  /** Skill name (from resource description or frontmatter) */
  name: string;
  /** Multi-segment skill path parsed from URI */
  skillPath: string;
  /** Full skill:// URI for the SKILL.md resource */
  uri: string;
  /** Skill description (from resource metadata) */
  description?: string;
  /** MIME type of the resource */
  mimeType?: string;
  /** MCP server dependencies (parsed from resource description or frontmatter) */
  dependencies?: string[];
}

/**
 * Describes the MCP server dependencies required by a skill being loaded.
 * Passed to the SkillCatalog's onDependenciesRequired callback.
 *
 * Aligned with SkillsDotNet.Mcp.SkillDependencyRequest.
 */
export interface SkillDependencyRequest {
  /** The name of the skill being loaded */
  skillName: string;
  /** The MCP server names declared in the skill's dependencies frontmatter field */
  serverNames: string[];
}

/**
 * Options for registerSkillResources().
 */
export interface RegisterSkillResourcesOptions {
  /** Register the resource template for supporting files. Default: true */
  template?: boolean;
  /** Register the skill://prompt-xml convenience resource. Default: false */
  promptXml?: boolean;
}

/**
 * SEP-2093: Per-resource capabilities.
 * Describes what operations a resource supports beyond basic read.
 */
export interface ResourceCapabilities {
  /** Supports resources/list to enumerate children */
  list?: boolean;
  /** Supports resources/subscribe for change notifications */
  subscribe?: boolean;
}

/**
 * SEP-2093: Metadata-only response from resources/metadata endpoint.
 */
export interface ResourceMetadataResult {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
  capabilities?: ResourceCapabilities;
  _meta?: Record<string, unknown>;
}
