/**
 * URI utilities for skill:// URIs per SEP-2640.
 *
 * URI scheme:
 *   skill://<skillPath>/SKILL.md      — skill content
 *   skill://<skillPath>/<filePath>    — supporting files within a skill
 *   skill://index.json                — well-known discovery index
 *
 * `<skillPath>` may be a single segment (e.g. "git-workflow") or
 * nested ("acme/billing/refunds"). Per SEP-2640, the final segment
 * of `<skillPath>` MUST equal the skill's frontmatter `name`.
 */

export const SKILL_SCHEME = "skill://";
export const SKILL_FILENAME = "SKILL.md";
export const SKILL_INDEX_URI = "skill://index.json";

/** Match `skill://<skillPath>/SKILL.md` and capture the skill path. */
const SKILL_CONTENT_REGEX = /^skill:\/\/(.+)\/SKILL\.md$/;

export interface ParsedSkillContentUri {
  /** The skill path (e.g. "acme/billing/refunds"). */
  skillPath: string;
  /** Final segment of skillPath; equals the skill's frontmatter `name`. */
  name: string;
}

/**
 * Parse a `skill://<skillPath>/SKILL.md` URI.
 * Returns null for URIs that don't address a SKILL.md or that lack a skill path.
 */
export function parseSkillContentUri(
  uri: string,
): ParsedSkillContentUri | null {
  const match = uri.match(SKILL_CONTENT_REGEX);
  if (!match) return null;
  const skillPath = match[1];
  const name = extractSkillName(skillPath);
  if (!name) return null;
  return { skillPath, name };
}

/** Build a `skill://<skillPath>/<filePath>` URI; defaults filePath to SKILL.md. */
export function buildSkillUri(skillPath: string, filePath?: string): string {
  return `${SKILL_SCHEME}${skillPath}/${filePath ?? SKILL_FILENAME}`;
}

/** Build the `skill://<skillPath>/SKILL.md` URI for a skill. */
export function buildSkillContentUri(skillPath: string): string {
  return buildSkillUri(skillPath, SKILL_FILENAME);
}

/**
 * Final non-empty segment of a skill path.
 * Per SEP-2640, this is the skill's frontmatter `name`.
 */
export function extractSkillName(skillPath: string): string {
  const segments = skillPath.split("/").filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? "";
}

export function isSkillContentUri(uri: string): boolean {
  return SKILL_CONTENT_REGEX.test(uri);
}

export function isSkillIndexUri(uri: string): boolean {
  return uri === SKILL_INDEX_URI;
}
