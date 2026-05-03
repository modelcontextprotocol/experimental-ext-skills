/**
 * Type definitions for the Skills Extension SDK.
 *
 * Key design point: SkillMetadata separates `skillPath` (the multi-segment
 * URI locator, e.g., "acme/billing/refunds") from `name` (the skill identity
 * from YAML frontmatter). The URI path is a locator, not an identifier; the
 * skill map is keyed by `skillPath` since two skills could share a frontmatter
 * name across different directories.
 */

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
}

/**
 * Metadata extracted from a skill's SKILL.md YAML frontmatter,
 * extended with document scanning results.
 *
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
  /**
   * Custom MCP resource `_meta` for this skill's `SKILL.md` resource.
   *
   * Per `docs/skill-meta-keys.md`, most skills do NOT need `_meta` — name,
   * description, version, allowed-tools, and other skill-level semantics
   * belong in frontmatter (the resource body), not duplicated here. Use
   * `_meta` only for transport-layer concerns that have no frontmatter
   * equivalent (provenance the host needs without reading content,
   * content-integrity hashes, etc.) and prefix custom keys with the
   * `io.modelcontextprotocol.skills/` reverse-domain namespace.
   *
   * The SDK never auto-projects frontmatter into `_meta`; it's set only
   * when the caller provides this field.
   */
  meta?: Record<string, unknown>;
  /** Audience annotation for this skill's resources (e.g., ["assistant"] or ["user", "assistant"]) */
  audience?: string[];
  /** Supplementary files found in the skill directory */
  documents: SkillDocument[];
  /** SKILL.md file size in bytes */
  size: number;
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
 *
 * Per SEP-2640, the MCP-served index format omits the `digest` field present
 * in the agentskills.io well-known URI format: integrity is the transport's
 * concern over an authenticated MCP connection.
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
 * Content returned by a template-skill read handler. Mirrors the contents
 * shape that the MCP server emits for a `resources/read` result.
 */
export interface TemplateReadResult {
  /** Markdown / text content for the resolved URI. */
  text?: string;
  /** Base64-encoded binary content for the resolved URI. */
  blob?: string;
  /** MIME type. Defaults to `text/markdown` for SKILL.md URIs. */
  mimeType?: string;
}

/**
 * Per-variable completion callback for a parameterized skill template.
 * Returns the candidate values for `{variable}` given the prefix the user
 * has typed.
 */
export type TemplateCompletionCallback = (
  value: string,
  context?: { arguments?: Record<string, string> },
) => string[] | Promise<string[]>;

/**
 * Read handler for a parameterized skill template. Receives the resolved
 * URI (with variables substituted) and a record of the bound variables.
 */
export type TemplateReadCallback = (
  uri: string,
  variables: Record<string, string>,
) => TemplateReadResult | Promise<TemplateReadResult>;

/**
 * Server-side declaration for a parameterized skill namespace.
 *
 * When `read` is provided, the SDK registers an MCP `ResourceTemplate` for
 * `uriTemplate` so hosts can read resolved URIs (e.g. binding `{product}`
 * to "widget-api" and reading `skill://docs/widget-api/SKILL.md`). When
 * `complete` is provided, each variable's callback is wired to the MCP
 * completion API so users can interactively browse the namespace.
 *
 * If both are omitted, the template is enumerated in `skill://index.json`
 * but not served — useful for servers that proxy template resolution to
 * another mechanism.
 */
export interface SkillTemplateDeclaration {
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** URI template (e.g., "skill://docs/{product}/SKILL.md") */
  uriTemplate: string;
  /**
   * Read handler invoked when a host calls `resources/read` against a URI
   * matching `uriTemplate`. Receives the resolved URI and the bound
   * variables. Omit if the template is enumerated only for documentation.
   */
  read?: TemplateReadCallback;
  /**
   * Per-variable completion callbacks, wired to MCP's completion API.
   * Keyed by variable name. Each callback returns the candidate values
   * for that variable given the prefix the user has typed.
   */
  complete?: Record<string, TemplateCompletionCallback>;
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
  /**
   * Inject `<server>{name}</server>` into each `<skill>` entry alongside
   * the URI. Default: false. The host SKILL.md flags per-entry server-name
   * placement as a way to keep first-call activation reliability ~90% for
   * `(server, uri)` reader tools (vs ~33% with the server name only in the
   * wrapper prose). It's not in SEP-2640, so the SDK leaves it off by
   * default and lets hosts opt in. Has no effect unless `serverName` is
   * also set.
   */
  serverInEntries?: boolean;
}

/**
 * Custom extractor for skill URIs in a server's `instructions` string.
 * Receives the raw instructions text and returns a deduplicated array
 * of URI strings. Replaces the SDK's built-in regex extractor entirely
 * — useful when the server uses a non-standard URI convention in prose
 * (e.g., URIs inside code fences, multi-line URIs, domain-specific
 * schemes that look like prose tokens).
 */
export type InstructionsUriExtractor = (instructions: string) => string[];

/**
 * Options for discoverSkills(). All fields are optional; defaults match
 * the SEP's recommended index-first / list-fallback strategy without
 * mining server instructions.
 */
export interface DiscoverSkillsOptions {
  /**
   * Mine the server's `instructions` string for skill URIs and merge them
   * with index entries (deduplicated by URI). Off by default — most
   * servers don't name skill URIs in their instructions, and enabling
   * this costs one `resources/read` round-trip per URI mentioned. Turn
   * on for documentation-server / gateway / template-only servers per
   * the SEP's third discovery path.
   *
   * @default false
   */
  instructions?: boolean;
  /**
   * Custom extractor used when `instructions: true`. When omitted, the
   * SDK's built-in regex extractor (`extractSkillUrisFromInstructions`)
   * is used.
   */
  extractor?: InstructionsUriExtractor;
}

/**
 * Options for discoverAndBuildCatalog().
 */
export interface DiscoverCatalogOptions {
  /**
   * MCP server name the model should target. Optional. Set when the
   * configured `toolName` accepts a `server` parameter (e.g., the bundled
   * `READ_RESOURCE_TOOL`); omit for host-scoped readers that take only
   * `uri`. The host SKILL.md observes activation reliability ~90% (vs ~33%)
   * when the server name appears in the prompt — but that's empirical
   * guidance, not SEP, so the SDK no longer forces it.
   */
  serverName?: string;
  /** Tool name the model should call to read resources. Default: "read_resource" */
  toolName?: string;
  /**
   * Mine the server's `instructions` for skill URIs (passed through to
   * `discoverSkills()`). Default: false.
   */
  instructions?: boolean;
  /** Custom URI extractor for `instructions`. Default: built-in regex. */
  extractor?: InstructionsUriExtractor;
  /**
   * Inject `<server>{name}</server>` into each `<skill>` entry. Default:
   * false. Has no effect unless `serverName` is set.
   */
  serverInEntries?: boolean;
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
  /**
   * Register the well-known `skill://index.json` discovery resource. Default:
   * true. Set to `false` for servers whose skill catalog is large, generated
   * on demand, or otherwise unenumerable — per SEP-2640 a server MAY decline
   * to expose the index. Skills remain individually readable via
   * `resources/read` regardless.
   */
  index?: boolean;
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
   * describes a parameterized skill namespace; declarations with a `read`
   * handler are also registered as MCP resource templates so hosts can read
   * resolved URIs and wire `complete` callbacks to the MCP completion API.
   */
  templates?: SkillTemplateDeclaration[];
}
