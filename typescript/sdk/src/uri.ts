/**
 * URI parsing and building utilities for skill:// URIs.
 *
 * Supports multi-segment skill paths per the Skills Extension SEP:
 *   - skill://code-review/SKILL.md              (single-segment)
 *   - skill://acme/billing/refunds/SKILL.md     (multi-segment)
 *   - skill://acme/billing/refunds/_manifest     (multi-segment manifest)
 *   - skill://acme/billing/refunds/templates/email.md  (supporting file)
 *   - skill://prompt-xml                         (system prompt XML)
 *
 * Per the SEP: the final segment of <skill-path> MUST equal the skill's
 * frontmatter name. Preceding segments are a server-chosen organizational
 * prefix. In skill://acme/billing/refunds/SKILL.md, the prefix is
 * "acme/billing" and the skill name is "refunds".
 */

/** The skill:// URI scheme prefix. */
export const SKILL_URI_SCHEME = "skill://";

/** Default skill content filename. */
export const SKILL_FILENAME = "SKILL.md";

/** Manifest pseudo-path. */
export const MANIFEST_PATH = "_manifest";

/** Special URI for system prompt XML. */
export const PROMPT_XML_URI = "skill://prompt-xml";

/** Well-known URI for the skill index (SEP discovery mechanism). */
export const INDEX_JSON_URI = "skill://index.json";

/**
 * Parsed components of a skill:// URI.
 */
export interface ParsedSkillUri {
  /** Multi-segment skill path (e.g., "acme/billing/refunds") */
  skillPath: string;
  /** File path within the skill (e.g., "SKILL.md", "_manifest", "templates/email.md") */
  filePath: string;
}

/**
 * Parse a skill:// URI into skill path and file path components.
 *
 * For SKILL.md and _manifest URIs, the split is unambiguous because the
 * last segment is a known sentinel. For supporting file URIs, the caller
 * must use resolveSkillFileUri() with known skill paths.
 *
 * Returns null if the URI doesn't match the skill:// scheme or is the
 * special prompt-xml URI.
 *
 * Examples:
 *   "skill://code-review/SKILL.md"
 *     → { skillPath: "code-review", filePath: "SKILL.md" }
 *   "skill://acme/billing/refunds/SKILL.md"
 *     → { skillPath: "acme/billing/refunds", filePath: "SKILL.md" }
 *   "skill://acme/billing/refunds/_manifest"
 *     → { skillPath: "acme/billing/refunds", filePath: "_manifest" }
 */
export function parseSkillUri(uri: string): ParsedSkillUri | null {
  if (!uri.startsWith(SKILL_URI_SCHEME)) return null;

  const rest = uri.slice(SKILL_URI_SCHEME.length);
  if (!rest || rest === "prompt-xml" || rest === "index.json") return null;

  const slashIndex = rest.lastIndexOf("/");
  if (slashIndex === -1) return null;

  const beforeLast = rest.slice(0, slashIndex);
  const afterLast = rest.slice(slashIndex + 1);

  // Known sentinel: SKILL.md or _manifest as the last segment
  if (
    afterLast === SKILL_FILENAME ||
    afterLast.toLowerCase() === "skill.md" ||
    afterLast === MANIFEST_PATH
  ) {
    return { skillPath: beforeLast, filePath: afterLast };
  }

  // For arbitrary file paths, we can't determine the split from the URI alone.
  // Return with empty skillPath — caller should use resolveSkillFileUri().
  return { skillPath: "", filePath: rest };
}

/**
 * Resolve a skill:// URI for a supporting file by matching against known
 * skill paths. Uses longest-prefix matching to handle nested hierarchies.
 *
 * Example:
 *   resolveSkillFileUri(
 *     "skill://acme/billing/refunds/templates/email.md",
 *     ["code-review", "acme/billing/refunds", "acme/onboarding"]
 *   )
 *   → { skillPath: "acme/billing/refunds", filePath: "templates/email.md" }
 */
export function resolveSkillFileUri(
  uri: string,
  knownSkillPaths: string[],
): ParsedSkillUri | null {
  if (!uri.startsWith(SKILL_URI_SCHEME)) return null;

  const rest = uri.slice(SKILL_URI_SCHEME.length);

  // Sort by length descending for longest-prefix match
  const sorted = [...knownSkillPaths].sort((a, b) => b.length - a.length);
  for (const sp of sorted) {
    if (rest.startsWith(sp + "/")) {
      return { skillPath: sp, filePath: rest.slice(sp.length + 1) };
    }
  }

  return null;
}

/**
 * Build a skill:// URI from a multi-segment skill path and optional file path.
 * Defaults to SKILL.md if no file path is provided.
 *
 * Examples:
 *   buildSkillUri("acme/billing/refunds")
 *     → "skill://acme/billing/refunds/SKILL.md"
 *   buildSkillUri("acme/billing/refunds", "_manifest")
 *     → "skill://acme/billing/refunds/_manifest"
 *   buildSkillUri("code-review", "references/REFERENCE.md")
 *     → "skill://code-review/references/REFERENCE.md"
 */
export function buildSkillUri(skillPath: string, filePath?: string): string {
  return `${SKILL_URI_SCHEME}${skillPath}/${filePath ?? SKILL_FILENAME}`;
}

/**
 * Check if a URI points to a skill's SKILL.md content.
 */
export function isSkillContentUri(uri: string): boolean {
  const parsed = parseSkillUri(uri);
  return (
    parsed !== null &&
    (parsed.filePath === SKILL_FILENAME ||
      parsed.filePath.toLowerCase() === "skill.md")
  );
}

/**
 * Check if a URI points to a skill's _manifest.
 */
export function isSkillManifestUri(uri: string): boolean {
  const parsed = parseSkillUri(uri);
  return parsed !== null && parsed.filePath === MANIFEST_PATH;
}

/**
 * Check if a URI is the special prompt-xml resource.
 */
export function isPromptXmlUri(uri: string): boolean {
  return uri === PROMPT_XML_URI;
}

/**
 * Check if a URI is the well-known skill index resource.
 */
export function isIndexJsonUri(uri: string): boolean {
  return uri === INDEX_JSON_URI;
}
