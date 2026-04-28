/**
 * Type definitions for SEP-2640 (Skills Extension).
 */

import type { RegisteredResource } from "@modelcontextprotocol/sdk/server/mcp.js";

/** A supplementary file within a skill directory. */
export interface SkillDocument {
  /** Path relative to the skill root (e.g. "references/REFERENCE.md"). */
  path: string;
  /** MIME type derived from extension. */
  mimeType: string;
  /** File size in bytes. */
  size: number;
}

/**
 * Server-side metadata for a discovered skill.
 */
export interface SkillMetadata {
  /** Skill path (e.g. "git-workflow" or "acme/billing/refunds"). */
  skillPath: string;
  /** Frontmatter `name`; equals the final segment of skillPath. */
  name: string;
  /** Frontmatter `description`. */
  description: string;
  /** Absolute path to SKILL.md. */
  path: string;
  /** Absolute path to the skill's directory. */
  skillDir: string;
  /** Optional extra frontmatter fields (string values only). */
  metadata?: Record<string, string>;
  /** Supporting files in the skill directory (excluding SKILL.md). */
  documents: SkillDocument[];
  /** ISO 8601 mtime of SKILL.md. */
  lastModified: string;
}

/**
 * Lightweight client-side summary of a discovered skill.
 */
export interface SkillSummary {
  /** Skill path parsed from URI. */
  skillPath: string;
  /** Final segment of skillPath. */
  name: string;
  /** Full skill:// URI for the SKILL.md resource. */
  uri: string;
  description?: string;
  mimeType?: string;
}

/* ---------- skill://index.json (SEP-2640 §Discovery) ---------- */

/** Concrete file-served skill. */
export interface SkillMdIndexEntry {
  type: "skill-md";
  name: string;
  description: string;
  url: string;
}

/** Archive-distributed skill (.tar.gz or .zip). */
export interface ArchiveIndexEntry {
  type: "archive";
  name: string;
  description: string;
  url: string;
}

/** Parameterized skill namespace; `url` is an RFC 6570 URI template. */
export interface ResourceTemplateIndexEntry {
  type: "mcp-resource-template";
  description: string;
  url: string;
}

export type SkillIndexEntry =
  | SkillMdIndexEntry
  | ArchiveIndexEntry
  | ResourceTemplateIndexEntry;

export interface SkillIndex {
  $schema: string;
  skills: SkillIndexEntry[];
}

/* ---------- registerSkillResources options ---------- */

export interface RegisterSkillResourcesOptions {
  /**
   * Register a per-skill resource template `skill://<skillPath>/{+filePath}`
   * for supporting files. Default: true.
   */
  templates?: boolean;
  /**
   * Register `skill://index.json` listing all discovered skills.
   * Default: true.
   */
  index?: boolean;
  /**
   * Override the index `$schema` URL. Defaults to the agentskills.io schema.
   */
  indexSchema?: string;
  /**
   * Additional entries to merge into `skill://index.json` (e.g. archive or
   * mcp-resource-template entries). Re-evaluated on each read so the caller
   * can register archives / templates after `registerSkillResources()` and
   * still have them appear.
   */
  extraIndexEntries?: SkillIndexEntry[] | (() => SkillIndexEntry[]);
}

/** Map skill path → registered resource handles. */
export type SkillResourceHandles = Map<
  string,
  { skill: RegisteredResource }
>;

/* ---------- archive + template helpers ---------- */

export interface RegisterSkillArchiveOptions {
  /** Archive format. Currently only "tar.gz" is supported by this SDK. */
  format?: "tar.gz";
}

export interface RegisterSkillArchiveResult {
  /** The full URI the archive is served at, e.g. `skill://acme/refunds.tar.gz`. */
  uri: string;
  /** Index entry describing this archive (merge into skill://index.json). */
  entry: ArchiveIndexEntry;
  /** Resource handle for later removal / update. */
  handle: RegisteredResource;
}

export interface SkillTemplateContext {
  variables: Record<string, string | string[]>;
  uri: URL;
}

export type SkillTemplateContent =
  | {
      uri: string;
      mimeType?: string;
      text: string;
      _meta?: Record<string, unknown>;
    }
  | {
      uri: string;
      mimeType?: string;
      blob: string;
      _meta?: Record<string, unknown>;
    };

export interface RegisterSkillTemplateOptions {
  /** Human-readable description of the addressable skill space. */
  description: string;
  /**
   * RFC 6570 URI template, e.g. `skill://docs/{product}/SKILL.md`.
   * The same value is used as the index entry's `url`.
   */
  uriTemplate: string;
  /** Resolve a concrete URI to skill content. */
  resolve: (
    ctx: SkillTemplateContext,
  ) => Promise<{ contents: SkillTemplateContent[] }>;
  /**
   * Optional completion callbacks for template variables, wired to the
   * MCP completion API. Keys are template variable names.
   */
  complete?: Record<
    string,
    (
      value: string,
      context?: { arguments?: Record<string, string> },
    ) => string[] | Promise<string[]>
  >;
  /** SDK-internal name for the registered resource template. Defaults to a derivation of `uriTemplate`. */
  resourceName?: string;
}

export interface RegisterSkillTemplateResult {
  entry: ResourceTemplateIndexEntry;
}
