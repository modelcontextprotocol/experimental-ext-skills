/**
 * Type definitions for the Skills Extension SDK (SEP-2640 v1).
 *
 * Key design point: SkillMetadata separates `skillPath` (the multi-segment
 * URI locator, e.g., "acme/billing/refunds") from `name` (the skill identity
 * from YAML frontmatter). The URI path is a locator, not an identifier; the
 * skill map is keyed by `skillPath` since two skills could share a frontmatter
 * name across different directories.
 */

/**
 * One file of a skill within a skill entry's `resources` manifest —
 * a `{uri, digest}` pair (SEP-2640).
 */
export interface SkillResourceRef {
  /** Resource URI of the file. */
  uri: string;
  /** SHA-256 digest of the file's raw bytes, formatted `sha256:{hex}`. */
  digest: string;
}

/**
 * A skill entry, as returned by `skills/list` (one element of `skills`) and
 * `skills/get` (the `skill` object). Identical shape and meaning in both.
 *
 * Entries carry no top-level `name`/`description` — those live inside the
 * verbatim `frontmatter` (the Agent Skills spec requires both, so they are
 * always present).
 */
export interface SkillEntry {
  /** Resource URI of the skill's `SKILL.md`, readable via `resources/read`. */
  uri: string;
  /**
   * Verbatim copy of the skill's `SKILL.md` YAML frontmatter, rendered as a
   * JSON object. Always carries `name` and `description`; any other authored
   * fields pass through unchanged.
   */
  frontmatter: Record<string, unknown>;
  /**
   * Complete enumeration of the skill's files as `{uri, digest}` pairs,
   * including an entry matching the skill's top-level `uri` (the digest of
   * `SKILL.md` itself). This is the unit of content a host verifies and that
   * a user's approval binds to.
   *
   * MAY be omitted only for dynamically generated skills whose content
   * cannot be pre-digested. A skill without `resources` offers no content
   * integrity and cannot be content-bound; hosts MAY decline to load it.
   */
  resources?: SkillResourceRef[];
}

/**
 * Result of the `skills/list` method. In protocol versions 2026-07-28 and
 * later the result also carries the base protocol's list-caching attributes
 * (`ttlMs`, `cacheScope` per SEP-2549) — a freshness hint for the listing,
 * not an integrity property.
 */
export interface SkillsListResult {
  /** Skill entries. MAY be empty or partial — never proof of absence. */
  skills: SkillEntry[];
  /** Opaque pagination token; pass back as `cursor` to fetch the next page. */
  nextCursor?: string;
  /** SEP-2549 freshness hint in milliseconds (0 = immediately stale). */
  ttlMs?: number;
  /** SEP-2549 cache scope: may the result be shared across auth contexts? */
  cacheScope?: "public" | "private";
}

/** Result of the `skills/get` method: one entry, no pagination, no caching attributes. */
export interface SkillsGetResult {
  /** The skill's entry — same shape and rules as a `skills/list` entry. */
  skill: SkillEntry;
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
  /**
   * SHA-256 digest of the file's raw bytes, formatted `sha256:{hex}`.
   * Emitted in the skill's entry `resources` manifest (SEP-2640).
   */
  digest: string;
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
   * Per SEP-2640 this block is copied verbatim into the skill's entry
   * (`frontmatter`) in `skills/list` / `skills/get` results, so
   * `name`/`description` are always present and any other authored fields
   * (`license`, `metadata`, compatibility, …) pass through unchanged.
   */
  frontmatter: Record<string, unknown>;
  /**
   * SHA-256 digest of the SKILL.md file's raw bytes, formatted as
   * `sha256:{hex}` (64 lowercase hex). Emitted in the entry's `resources`
   * manifest as the digest of the entry matching the skill's top-level
   * `uri`, per SEP-2640.
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
   * equivalent and prefix custom keys with the
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
 * Lightweight client-side summary of a skill, derived from a SkillEntry.
 * Used for building model-facing catalogs; the entry itself remains the
 * verification unit.
 */
export interface SkillSummary {
  /** Skill name (from the entry's frontmatter) */
  name: string;
  /** Multi-segment skill path parsed from the entry URI */
  skillPath: string;
  /** Resource URI of the skill's SKILL.md — read via `resources/read`. */
  uri: string;
  /** Skill description (from the entry's frontmatter) */
  description?: string;
}

/**
 * Options for verified skill reads (`readSkill`).
 */
export interface ReadSkillOptions {
  /**
   * Permit reading when the skill's entry carries no `resources` manifest
   * (a dynamically generated skill). Default `false`: such a skill offers
   * no content integrity and cannot be content-bound, and SEP-2640 lets
   * hosts decline it. Set `true` to read it unverified anyway.
   */
  allowUnverified?: boolean;
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
 * Options for discoverSkills(). All fields are optional; the default is
 * `skills/list` enumeration without mining server instructions.
 */
export interface DiscoverSkillsOptions {
  /**
   * Mine the server's `instructions` string for skill URIs, confirm each
   * via `skills/get`, and merge the resulting entries with the `skills/list`
   * result (deduplicated by URI). Off by default — most servers don't name
   * skill URIs in their instructions, and enabling this costs one
   * `skills/get` round-trip per URI mentioned. Per SEP-2640 an explicitly
   * referenced URI is confirmed as a skill by asking the server, never by
   * inspecting the URI scheme.
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
  /** Discovered skill entries */
  skills: SkillEntry[];
  /** System prompt catalog text (empty string if no skills found) */
  catalog: string;
}

/**
 * Options for registerSkillResources().
 */
export interface RegisterSkillResourcesOptions {
  /** Register the resource template for supporting files. Default: true */
  template?: boolean;
  /** Audience annotation for skill resources. Default: ["assistant"] */
  audience?: string[];
  /**
   * Implement the SEP-2640 `resources/directory/read` method so hosts can
   * enumerate the files under each skill directory (an `ls`-style,
   * metadata-only, paginated listing). Default `false` — the method is
   * optional and gated behind the `directoryRead` capability setting;
   * clients MUST NOT call it against a server that has not declared it.
   */
  directoryRead?: boolean;
  /**
   * Declare `capabilities.extensions["io.modelcontextprotocol/skills"]`
   * (with `directoryRead` when enabled) as part of registration. Default
   * `true`. Registration must happen BEFORE `server.connect()` —
   * capabilities ship in the initialize handshake. Set `false` if you
   * declare the capability yourself via `declareSkillsExtension()`.
   */
  declareCapability?: boolean;
  /** Entries per `skills/list` page. Default 50. Entries are atomic — a skill's `resources` set is never split across pages. */
  pageSize?: number;
  /**
   * SEP-2549 freshness hint attached to `skills/list` results (protocol
   * 2026-07-28+). Default 0 (immediately stale — clients re-fetch freely).
   */
  ttlMs?: number;
  /**
   * SEP-2549 cache scope attached to `skills/list` results. Default
   * `"private"` (never shared across authorization contexts) — the safe
   * default; set `"public"` when the skill catalog carries no
   * user-specific data.
   */
  cacheScope?: "public" | "private";
}
