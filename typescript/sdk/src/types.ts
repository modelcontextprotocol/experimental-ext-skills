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
  /** Audience annotation for this skill's resources (e.g., ["assistant"] or ["user", "assistant"]) */
  audience?: string[];
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
  /**
   * URI to read this skill from.
   *
   * For `type: "skill-md"`: the SKILL.md resource URI — read directly via
   * `resources/read` to get the markdown content.
   *
   * For `type: "archive"`: the archive resource URI (e.g.
   * `skill://pdf-processing.tar.gz`) — fetch and unpack via
   * `readSkillArchive()`. The post-unpack SKILL.md lives at
   * `skill://<skillPath>/SKILL.md`.
   */
  uri: string;
  /**
   * Distribution type, mirroring the index entry type. When omitted (e.g.
   * skills discovered via `resources/list` without an index), assume
   * `"skill-md"`.
   */
  type?: "skill-md" | "archive";
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
 *
 * Per the SEP, `name` is omitted for template entries and the URI template
 * value is carried in the `url` field (same field as skill-md entries).
 */
export interface McpResourceTemplateIndexEntry {
  /** Template name (optional per SEP — omitted for mcp-resource-template) */
  name?: string;
  /** Entry type discriminator */
  type: "mcp-resource-template";
  /** Template description */
  description: string;
  /** RFC 6570 URI template (e.g., "skill://docs/{product}/SKILL.md") */
  url: string;
}

/**
 * An archive entry in the discovery index — a single packed resource
 * (.tar.gz or .zip) whose contents populate the skill directory.
 *
 * Per SEP-2640, `<skill-path>` is the entry `url` with the archive suffix
 * (`.tar.gz` or `.zip`) stripped: `skill://pdf-processing.tar.gz` unpacks
 * to `skill://pdf-processing/`. Post-unpack files are addressable as
 * `skill://<skill-path>/<file-path>` exactly as if served individually.
 */
export interface ArchiveIndexEntry {
  /** Skill name from frontmatter (= final segment of post-unpack skill path) */
  name: string;
  /** Entry type discriminator */
  type: "archive";
  /** Skill description from frontmatter */
  description: string;
  /** Resource URI for the archive (e.g. skill://pdf-processing.tar.gz) */
  url: string;
}

/**
 * An entry in the skill://index.json MCP discovery index.
 * Per SEP-2640, type MUST be "skill-md", "archive", or "mcp-resource-template".
 * Use `entry.type` to narrow.
 */
export type SkillIndexEntry =
  | SkillMdIndexEntry
  | ArchiveIndexEntry
  | McpResourceTemplateIndexEntry;

/**
 * Client-side summary of a discovered resource template.
 */
export interface SkillTemplateEntry {
  /** Template name (optional — SEP omits name for mcp-resource-template entries) */
  name?: string;
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
 * Archive format. Per SEP-2640, hosts MUST support both. Format determines
 * the served `mimeType` (`application/gzip` or `application/zip`) and
 * the URL suffix (`.tar.gz` or `.zip`).
 */
export type ArchiveFormat = "tar.gz" | "zip";

/**
 * Server-side declaration for an archive-distributed skill.
 * Passed to registerSkillResources() to register the archive as an MCP
 * resource and include it in skill://index.json.
 *
 * The archive is served as a single resource at
 * `skill://<skillPath>.<format>`. After the host unpacks it, files are
 * addressable at `skill://<skillPath>/<file-path>` — identical namespace
 * to individual-file distribution.
 */
export interface SkillArchiveDeclaration {
  /**
   * Skill name from frontmatter; MUST equal the final segment of `skillPath`
   * per SEP-2640.
   */
  name: string;
  /** Skill description from frontmatter */
  description: string;
  /**
   * Multi-segment skill path that the archive unpacks to. The final segment
   * MUST equal `name`.
   */
  skillPath: string;
  /**
   * Local filesystem path to the prebuilt archive. The SDK reads this once
   * at registration and serves the bytes on `resources/read`.
   */
  archivePath: string;
  /**
   * Archive format. Defaults to inference from `archivePath` suffix
   * (`.tar.gz`/`.tgz` → `tar.gz`, `.zip` → `zip`).
   */
  format?: ArchiveFormat;
}

/**
 * Result of unpacking a skill archive.
 * Maps file paths (relative to skill root, forward-slash separated) to
 * raw byte contents.
 */
export interface UnpackedSkillArchive {
  /** Files in the archive, keyed by relative path. */
  files: Map<string, Buffer>;
  /** Total uncompressed bytes across all entries. */
  totalSize: number;
}

/** Options for archive extraction. */
export interface ExtractArchiveOptions {
  /** Maximum total uncompressed bytes. Default: 50MB. */
  maxTotalSize?: number;
  /** Maximum bytes per single file. Default: 10MB. */
  maxFileSize?: number;
  /** Maximum number of entries. Default: 1024. */
  maxEntries?: number;
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

/**
 * Options for buildSkillsCatalog().
 */
export interface SkillsCatalogOptions {
  /** Tool name the model should call to read skill content */
  toolName: string;
  /**
   * MCP server name the model should target. Omit when the configured
   * `toolName` does not accept a `server` parameter (e.g., a host-scoped
   * reader that only takes `uri`) — the behavioral instructions will drop
   * the server clause so the prompt doesn't mention an unused argument.
   */
  serverName?: string;
}

/**
 * Options for discoverAndBuildCatalog().
 */
export interface DiscoverCatalogOptions {
  /** MCP server name the model should target (required for activation reliability) */
  serverName: string;
  /** Tool name the model should call to read resources. Default: "read_resource" */
  toolName?: string;
}

/**
 * Result of discoverAndBuildCatalog().
 */
export interface DiscoverCatalogResult {
  /** Discovered skills */
  skills: SkillSummary[];
  /** System prompt catalog text (empty string if no skills found) */
  catalog: string;
}

/**
 * Options for registerSkillResources().
 */
export interface RegisterSkillResourcesOptions {
  /** Register the resource template for supporting files. Default: true */
  template?: boolean;
  /** Register the skill://prompt-xml convenience resource. Default: false */
  promptXml?: boolean;
  /** Audience annotation for skill resources. Default: ["assistant"] */
  audience?: string[];
  /**
   * Archive-distributed skills to register and include in `skill://index.json`.
   * Each declaration's archive file is read from disk and served as a single
   * resource at `skill://<skillPath>.<format>`.
   */
  archives?: SkillArchiveDeclaration[];
  /**
   * Resource template entries to include in `skill://index.json`. Each entry
   * describes a parameterized skill namespace; servers SHOULD also register
   * the same `uriTemplate` as an MCP resource template.
   */
  templates?: SkillTemplateDeclaration[];
}

