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
}

/**
 * A skill-md entry in the discovery index — a concrete skill with a URI.
 */
export interface SkillMdIndexEntry {
  /** Skill name from frontmatter (= final segment of skill path) */
  name: string;
  /** Entry type discriminator */
  type: "skill-md";
  /** Skill description from frontmatter */
  description: string;
  /** Full skill:// URI for the SKILL.md resource */
  url: string;
  /** Content digest for cache validation (format: "sha256:<hex>") */
  digest?: string;
}

/**
 * An mcp-resource-template entry in the discovery index — a parameterized
 * skill namespace that clients resolve via the MCP completion API.
 */
export interface McpResourceTemplateIndexEntry {
  /** Template name */
  name: string;
  /** Entry type discriminator */
  type: "mcp-resource-template";
  /** Template description */
  description: string;
  /** URI template (e.g., "skill://docs/{product}/SKILL.md") */
  uriTemplate: string;
}

/**
 * An archive entry in the discovery index — a .tar.gz bundle containing
 * a skill directory with SKILL.md at its root.
 */
export interface ArchiveIndexEntry {
  /** Skill name */
  name: string;
  /** Entry type discriminator */
  type: "archive";
  /** Skill description */
  description: string;
  /** URL to the .tar.gz archive */
  url: string;
  /** Content digest for cache validation (format: "sha256:<hex>") */
  digest?: string;
}

/**
 * An entry in the skill://index.json discovery index.
 * Discriminated union — use `entry.type` to narrow.
 */
export type SkillIndexEntry = SkillMdIndexEntry | McpResourceTemplateIndexEntry | ArchiveIndexEntry;

/**
 * Client-side summary of a discovered resource template.
 */
export interface SkillTemplateEntry {
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** URI template string */
  uriTemplate: string;
}

/**
 * Server-side declaration for a parameterized skill namespace.
 * Passed to generateSkillIndex() to produce mcp-resource-template entries.
 */
export interface SkillTemplateDeclaration {
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** URI template (e.g., "skill://docs/{product}/SKILL.md") */
  uriTemplate: string;
}

/**
 * The skill://index.json resource content.
 * Follows the Agent Skills well-known URI discovery index format.
 */
export interface SkillIndex {
  /** Schema version URI */
  $schema: string;
  /** Array of skill entries */
  skills: SkillIndexEntry[];
}

/** Schema URI for the Agent Skills discovery index format. */
export const SKILL_INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** Set of known schema URIs for forward-compatible validation. */
export const KNOWN_SKILL_INDEX_SCHEMAS: ReadonlySet<string> = new Set([SKILL_INDEX_SCHEMA]);

// ---------------------------------------------------------------------------
// Well-known HTTP bridge types
// ---------------------------------------------------------------------------

/**
 * Options for fetchFromWellKnown() / refreshFromWellKnown().
 */
export interface WellKnownFetchOptions {
  /** Domain to fetch from (e.g., "example.com") */
  domain: string;
  /** Local directory to cache fetched skills */
  cacheDir: string;
  /** Injectable fetch function (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
  /** Skip entries whose digest matches the local cache */
  useDigestCache?: boolean;
}

/**
 * A single fetched skill result.
 */
export interface WellKnownSkillResult {
  /** Skill name from the index entry */
  name: string;
  /** Skill path (derived from entry name or URL) */
  skillPath: string;
  /** Whether the skill was served from the digest cache (not re-downloaded) */
  cached: boolean;
}

/**
 * Result of fetchFromWellKnown() / refreshFromWellKnown().
 */
export interface WellKnownFetchResult {
  /** Skills that were fetched or already cached */
  skills: WellKnownSkillResult[];
  /** Entries skipped due to unrecognized or unfetchable type */
  skipped: Array<{ name?: string; type: string; reason: string }>;
  /** Fetch or verification failures */
  errors: Array<{ name: string; error: string }>;
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

