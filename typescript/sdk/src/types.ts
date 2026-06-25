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
  /**
   * The skill's full SKILL.md YAML frontmatter, parsed to a plain object.
   * Per SEP-2640 this block is copied verbatim into the skill's
   * `skill://index.json` entry (`frontmatter`), so `name`/`description`
   * are always present and any other authored fields (`license`,
   * `metadata`, compatibility, …) pass through unchanged.
   */
  frontmatter: Record<string, unknown>;
  /**
   * SHA-256 digest of the SKILL.md file's raw bytes, formatted as
   * `sha256:{hex}` (64 lowercase hex). Emitted as the entry `digest` in
   * `skill://index.json` alongside `url`, per SEP-2640.
   */
  digest: string;
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
   * Distribution type, derived from the index entry shape (a `url` ⇒
   * `"skill-md"`, archives-only ⇒ `"archive"`). When omitted (e.g. skills
   * discovered via `resources/list` without an index), assume `"skill-md"`.
   */
  type?: "skill-md" | "archive";
  /** Skill description (from frontmatter / resource metadata) */
  description?: string;
  /** MIME type of the resource */
  mimeType?: string;
  /**
   * SHA-256 digest of the resource named by `uri`, formatted `sha256:{hex}`,
   * when the index entry carried one. For `type: "skill-md"` this is the
   * SKILL.md digest; for `type: "archive"` it is the chosen archive's
   * digest. Pass to {@link verifyDigest} to honor the SEP's integrity MUST.
   */
  digest?: string;
  /**
   * All archive representations advertised for this skill in the index
   * (each with its own `url`, `mimeType`, and `digest`), when present.
   */
  archives?: SkillArchiveRef[];
}

/**
 * One archive representation of a skill within a `skill://index.json` entry.
 *
 * Per SEP-2640, a skill MAY advertise one or more archive forms of its
 * directory. Each archive is a single resource (mime type e.g.
 * `application/gzip` or `application/zip`) whose contents unpack into the
 * skill's URI namespace (`SKILL.md` at the archive root). Each carries its
 * own SHA-256 `digest` for caching/integrity.
 */
export interface SkillArchiveRef {
  /** Resource URI of the archive (e.g. `skill://pdf-processing.tar.gz`). */
  url: string;
  /** Archive media type (e.g. `application/gzip`, `application/zip`). */
  mimeType: string;
  /** SHA-256 digest of the archive bytes, formatted `sha256:{hex}`. */
  digest: string;
}

/**
 * An entry in the `skill://index.json` MCP discovery index (SEP-2640).
 *
 * Entries are **type-less**: a skill is described by its verbatim
 * `frontmatter` plus how it can be retrieved. Every entry MUST include a
 * `url` (with `digest`), a non-empty `archives` array, or both. `name` and
 * `description` are NOT top-level fields — they live inside `frontmatter`
 * (the Agent Skills spec requires both, so they are always present).
 */
export interface SkillIndexEntry {
  /**
   * Verbatim copy of the skill's `SKILL.md` YAML frontmatter, rendered as a
   * JSON object. Always carries `name` and `description`; any other authored
   * fields pass through unchanged.
   */
  frontmatter: Record<string, unknown>;
  /**
   * Resource URI of the skill's `SKILL.md`, when served as an individual
   * file. REQUIRED when `digest` is present; absent for archive-only skills.
   */
  url?: string;
  /**
   * SHA-256 digest of the `SKILL.md` file, formatted `sha256:{hex}`.
   * REQUIRED whenever `url` is present.
   */
  digest?: string;
  /** Archive distributions of the skill. Non-empty when present. */
  archives?: SkillArchiveRef[];
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
   * Full SKILL.md frontmatter for this archived skill, copied verbatim into
   * the skill's `skill://index.json` entry (`frontmatter`). The archive is
   * not unpacked at registration, so the SDK cannot read it from inside the
   * archive — provide it here to preserve authored fields (`license`,
   * `metadata`, …). When omitted, the index entry falls back to
   * `{ name, description }`.
   */
  frontmatter?: Record<string, unknown>;
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
 * Options for `readSkillArchive()`. Extends the extraction bounds with the
 * SEP-2640 integrity check: when `expectedDigest` is supplied (the archive
 * entry's `digest` from `skill://index.json`), the raw archive bytes are
 * verified against it *before* unpacking, and a mismatch throws.
 */
export interface ReadSkillArchiveOptions extends ExtractArchiveOptions {
  /**
   * Expected `sha256:{hex}` digest of the archive bytes (from the index
   * entry). When present, the bytes are verified before extraction and a
   * mismatch throws. SEP-2640 makes this verification a MUST for hosts.
   */
  expectedDigest?: string;
}

/**
 * Options for `readSkill()`.
 */
export interface ReadSkillOptions {
  /**
   * Permit reading when the discovered skill carries no `digest`. Default
   * `false`: SEP-2640 makes host-side verification a MUST and requires the
   * index to carry a digest, so a missing digest is treated as a conformance
   * error rather than silently skipping verification. Set `true` only for
   * non-conforming servers where you accept reading unverified content.
   */
  allowUnverified?: boolean;
}

/**
 * The `skill://index.json` resource content (SEP-2640).
 *
 * The WG owns this schema; it is intentionally decoupled from the
 * agentskills.io `.well-known` discovery format. The index carries no
 * `$schema` / version marker — the format is versioned by the extension
 * itself.
 */
export interface SkillIndex {
  /** Array of skill entries */
  skills: SkillIndexEntry[];
}

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
   * Implement the SEP-2640 `resources/directory/read` method so hosts can
   * enumerate the files under each individually-served skill directory
   * (an `ls`-style, metadata-only, paginated listing). Default `false`.
   *
   * When `true`, the SDK registers a handler on the server's low-level
   * request router. The server MUST also advertise the capability by calling
   * `declareSkillsExtension(server, { directoryRead: true })` before
   * `connect()` — capabilities are sent during the initialize handshake and
   * cannot be added by `registerSkillResources` after the fact. Note that
   * archive-distributed skills are opaque to the server, so directory read
   * only covers skills served as individual files.
   */
  directoryRead?: boolean;
}
