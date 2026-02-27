/**
 * URI parsing and building utilities for skill:// URIs.
 *
 * URI scheme:
 *   - skill://{name}/SKILL.md   — skill content
 *   - skill://{name}/_manifest  — file manifest
 *   - skill://{name}/{+path}    — supporting files
 *   - skill://prompt-xml        — system prompt XML (optional)
 */

/** Default skill content filename. */
export const SKILL_FILENAME = "SKILL.md";

/** Manifest pseudo-path. */
export const MANIFEST_PATH = "_manifest";

/** Regex to parse skill:// URIs into name and path components. */
const SKILL_URI_REGEX = /^skill:\/\/([^/]+)\/(.+)$/;

/**
 * Parse a skill:// URI into its name and path components.
 * Returns null if the URI doesn't match the skill:// scheme.
 */
export function parseSkillUri(
  uri: string,
): { name: string; path: string } | null {
  const match = uri.match(SKILL_URI_REGEX);
  if (!match) return null;
  return { name: match[1], path: match[2] };
}

/**
 * Build a skill:// URI from a skill name and optional path.
 * Defaults to SKILL.md if no path is provided.
 */
export function buildSkillUri(name: string, path?: string): string {
  return `skill://${name}/${path ?? SKILL_FILENAME}`;
}

/**
 * Check if a URI points to a skill's SKILL.md content.
 */
export function isSkillContentUri(uri: string): boolean {
  const parsed = parseSkillUri(uri);
  return parsed !== null && parsed.path === SKILL_FILENAME;
}

/**
 * Check if a URI points to a skill's _manifest.
 */
export function isSkillManifestUri(uri: string): boolean {
  const parsed = parseSkillUri(uri);
  return parsed !== null && parsed.path === MANIFEST_PATH;
}
