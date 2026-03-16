/**
 * Resource template utilities for template-based skill discovery.
 *
 * Supports the pattern where skills are exposed via MCP resource templates
 * (e.g., skill://{owner}/{repo}/{skill_name}/SKILL.md) instead of
 * static resources/list entries. This enables scalable discovery for
 * platforms like GitHub where enumerating all skills is not feasible.
 *
 * Reference: github/github-mcp-server#2129 by Sam Morrow (GitHub)
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SkillSummary } from "./types.js";
import { parseSkillFrontmatter } from "./_client.js";

/** Regex to detect skill:// URI templates. */
const SKILL_TEMPLATE_REGEX = /^skill:\/\//;

/** Regex to extract RFC 6570 template variables: {var}, {+var}, {#var}, etc. */
const TEMPLATE_VAR_REGEX = /\{[+#./;?&]?([^}]+)\}/g;

/** Common variable names that represent the skill name in a template. */
const SKILL_NAME_VARS = new Set([
  "skill_name",
  "skillName",
  "skill",
  "name",
]);

/**
 * A resource template that exposes skills.
 */
export interface SkillTemplate {
  /** The raw URI template string from the server */
  uriTemplate: string;
  /** Template name from the server */
  name: string;
  /** Description */
  description?: string;
  /** Extracted variable names from the URI template */
  variables: string[];
  /** Which variable represents the skill name (best guess) */
  skillNameVariable: string | undefined;
}

/**
 * A manifest entry from a template-based server (GitHub-style).
 * Uses URIs instead of hashes so clients can follow the chain.
 */
export interface ManifestFileEntryWithUri {
  /** Relative path from skill root (e.g., "SKILL.md") */
  path: string;
  /** URI to fetch the content (e.g., repo://owner/repo/contents/...) */
  uri: string;
  /** File size in bytes (optional) */
  size?: number;
}

/**
 * Manifest returned by template-based servers.
 */
export interface SkillManifestWithUris {
  /** Skill name */
  skill: string;
  /** Files with URIs to fetch content */
  files: ManifestFileEntryWithUri[];
}

/**
 * Extract variable names from an RFC 6570 URI template.
 *
 * Handles Level 1 ({var}), Level 2 ({+var}), and Level 3 ({#var})
 * operators. Explode modifiers (*) and prefix modifiers (:N) are stripped.
 */
export function extractTemplateVariables(uriTemplate: string): string[] {
  const vars: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  TEMPLATE_VAR_REGEX.lastIndex = 0;

  while ((match = TEMPLATE_VAR_REGEX.exec(uriTemplate)) !== null) {
    // Handle comma-separated variables within a single expression
    const varList = match[1].split(",");
    for (const v of varList) {
      // Strip explode modifier (*) and prefix modifier (:N)
      const cleaned = v.trim().replace(/\*$/, "").replace(/:\d+$/, "");
      if (cleaned && !vars.includes(cleaned)) {
        vars.push(cleaned);
      }
    }
  }

  return vars;
}

/**
 * Expand an RFC 6570 URI template with variable values.
 *
 * Simple implementation covering Level 1 ({var}) and Level 2 ({+var}).
 * Level 1 variables are percent-encoded; Level 2 ({+var}) are not.
 */
export function expandTemplate(
  uriTemplate: string,
  variables: Record<string, string>,
): string {
  return uriTemplate.replace(
    /\{([+#./;?&]?)([^}]+)\}/g,
    (_match, operator: string, varExpr: string) => {
      // For simplicity, handle only the first variable in the expression
      const varName = varExpr
        .split(",")[0]
        .trim()
        .replace(/\*$/, "")
        .replace(/:\d+$/, "");

      const value = variables[varName];
      if (value === undefined) return "";

      // Level 2 operators (+, #) don't percent-encode reserved chars
      if (operator === "+" || operator === "#") {
        return (operator === "#" ? "#" : "") + value;
      }

      // Level 1: percent-encode
      return encodeURIComponent(value);
    },
  );
}

/**
 * Detect whether a URI template string represents a skill template.
 * Matches templates starting with skill:// and ending with SKILL.md.
 */
export function isSkillTemplate(uriTemplate: string): boolean {
  return SKILL_TEMPLATE_REGEX.test(uriTemplate) && uriTemplate.includes("SKILL.md");
}

/**
 * Detect whether a URI template string represents a skill manifest template.
 * Matches templates starting with skill:// and ending with _manifest.
 */
export function isSkillManifestTemplate(uriTemplate: string): boolean {
  return SKILL_TEMPLATE_REGEX.test(uriTemplate) && uriTemplate.endsWith("_manifest");
}

/**
 * Guess which template variable represents the skill name.
 * Checks against common naming conventions.
 */
export function detectSkillNameVariable(variables: string[]): string | undefined {
  return variables.find((v) => SKILL_NAME_VARS.has(v));
}

/**
 * List skill resource templates available from an MCP client.
 *
 * Calls resources/templates/list and filters for templates whose
 * uriTemplate matches the skill:// scheme with SKILL.md.
 * Also returns manifest templates if found.
 */
export async function listSkillTemplates(
  client: Client,
): Promise<{ content: SkillTemplate[]; manifest: SkillTemplate[] }> {
  const contentTemplates: SkillTemplate[] = [];
  const manifestTemplates: SkillTemplate[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listResourceTemplates(
      cursor ? { cursor } : undefined,
    );

    for (const template of result.resourceTemplates) {
      const variables = extractTemplateVariables(template.uriTemplate);
      const skillNameVariable = detectSkillNameVariable(variables);

      const parsed: SkillTemplate = {
        uriTemplate: template.uriTemplate,
        name: template.name,
        description: template.description,
        variables,
        skillNameVariable,
      };

      if (isSkillTemplate(template.uriTemplate)) {
        contentTemplates.push(parsed);
      } else if (isSkillManifestTemplate(template.uriTemplate)) {
        manifestTemplates.push(parsed);
      }
    }

    cursor = result.nextCursor;
  } while (cursor);

  return { content: contentTemplates, manifest: manifestTemplates };
}

/**
 * Complete a single template argument, returning possible values.
 *
 * Wraps client.complete() with a resource template reference.
 * Pass previously-resolved arguments in context to enable
 * dependent completions (e.g., completing skill_name after owner+repo).
 */
export async function completeTemplateArg(
  client: Client,
  templateUri: string,
  argName: string,
  argValue: string,
  context?: Record<string, string>,
): Promise<string[]> {
  const result = await client.complete({
    ref: { type: "ref/resource", uri: templateUri },
    argument: { name: argName, value: argValue },
    ...(context ? { context: { arguments: context } } : {}),
  });

  return result.completion.values;
}

/**
 * Discover skills available through a resource template by using
 * completion/complete to enumerate skill_name values.
 *
 * Requires the template to have a detectable skill name variable.
 * Pass previously-resolved arguments (e.g., { owner, repo }) as resolvedArgs.
 *
 * Returns SkillSummary[] with names from completions. To get full content,
 * call loadSkillFromTemplate() for each.
 */
export async function discoverSkillsFromTemplate(
  client: Client,
  template: SkillTemplate,
  resolvedArgs: Record<string, string>,
): Promise<SkillSummary[]> {
  if (!template.skillNameVariable) {
    throw new Error(
      `Cannot discover skills: no skill name variable detected in template "${template.uriTemplate}". ` +
      `Variables found: ${template.variables.join(", ")}`,
    );
  }

  // Use completions to enumerate available skill names
  const skillNames = await completeTemplateArg(
    client,
    template.uriTemplate,
    template.skillNameVariable,
    "", // Empty prefix to get all completions
    resolvedArgs,
  );

  // Build summary for each discovered skill
  const skills: SkillSummary[] = skillNames.map((name) => {
    const allArgs = { ...resolvedArgs, [template.skillNameVariable!]: name };
    const uri = expandTemplate(template.uriTemplate, allArgs);

    return {
      name,
      uri,
      description: undefined,
      mimeType: "text/markdown",
    };
  });

  return skills;
}

/**
 * Load a skill from a resource template by constructing the full URI
 * from template + resolved arguments, then calling resources/read.
 *
 * Returns the skill content and optionally the parsed manifest.
 */
export async function loadSkillFromTemplate(
  client: Client,
  template: SkillTemplate,
  args: Record<string, string>,
  manifestTemplate?: SkillTemplate,
): Promise<{
  content: string;
  frontmatter: { name: string; description: string } | null;
  manifest?: SkillManifestWithUris;
}> {
  const uri = expandTemplate(template.uriTemplate, args);

  const result = await client.readResource({ uri });

  const content =
    result.contents[0] && "text" in result.contents[0]
      ? result.contents[0].text
      : "";

  const frontmatter = parseSkillFrontmatter(content);

  let manifest: SkillManifestWithUris | undefined;
  if (manifestTemplate) {
    try {
      const manifestUri = expandTemplate(manifestTemplate.uriTemplate, args);
      const manifestResult = await client.readResource({ uri: manifestUri });

      const manifestText =
        manifestResult.contents[0] && "text" in manifestResult.contents[0]
          ? manifestResult.contents[0].text
          : "";

      manifest = JSON.parse(manifestText) as SkillManifestWithUris;
    } catch {
      // Manifest is optional — continue without it
    }
  }

  return { content, frontmatter, manifest };
}

/**
 * Follow manifest URIs to load all referenced files.
 *
 * Calls resources/read for each file entry in the manifest,
 * returning a map of path → content. Scheme-agnostic: works with
 * repo://, file://, or any scheme the server accepts.
 */
export async function resolveManifestFiles(
  client: Client,
  manifest: SkillManifestWithUris,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for (const entry of manifest.files) {
    try {
      const result = await client.readResource({ uri: entry.uri });

      const content =
        result.contents[0] && "text" in result.contents[0]
          ? result.contents[0].text
          : result.contents[0] && "blob" in result.contents[0]
            ? result.contents[0].blob
            : "";

      files.set(entry.path, content);
    } catch {
      // Skip files we can't load
    }
  }

  return files;
}

/**
 * A fully loaded skill from template-based discovery.
 * Contains everything needed for SkillCatalog integration.
 */
export interface LoadedTemplateSkill {
  /** Skill name (from completions or frontmatter) */
  name: string;
  /** Expanded skill:// URI */
  uri: string;
  /** Raw SKILL.md content */
  content: string;
  /** Parsed frontmatter (name, description) */
  frontmatter: { name: string; description: string } | null;
  /** Optional manifest with file URIs */
  manifest?: SkillManifestWithUris;
}

/**
 * High-level function that discovers and loads all skills from a
 * template-based server in a single call.
 *
 * Chains: listSkillTemplates → completions → loadSkillFromTemplate.
 *
 * The resolvedArgs parameter must include values for all template
 * variables except the skill name (e.g., { owner: "github", repo: "awesome-copilot" }).
 * The skill name variable is enumerated automatically via completions.
 *
 * This is the building block for SkillCatalog.addClientFromTemplates().
 */
export async function discoverAllSkillsFromTemplates(
  client: Client,
  resolvedArgs: Record<string, string>,
): Promise<LoadedTemplateSkill[]> {
  const templates = await listSkillTemplates(client);

  if (templates.content.length === 0) {
    return [];
  }

  const loaded: LoadedTemplateSkill[] = [];

  for (const contentTemplate of templates.content) {
    // Find matching manifest template (same variables)
    const manifestTemplate = templates.manifest.find((m) =>
      contentTemplate.variables.every((v) => m.variables.includes(v)),
    );

    // Discover skill names via completions
    const skills = await discoverSkillsFromTemplate(
      client,
      contentTemplate,
      resolvedArgs,
    );

    // Load each skill
    for (const skill of skills) {
      const args = {
        ...resolvedArgs,
        [contentTemplate.skillNameVariable!]: skill.name,
      };

      try {
        const result = await loadSkillFromTemplate(
          client,
          contentTemplate,
          args,
          manifestTemplate,
        );

        loaded.push({
          name: result.frontmatter?.name ?? skill.name,
          uri: skill.uri,
          content: result.content,
          frontmatter: result.frontmatter,
          manifest: result.manifest,
        });
      } catch {
        // Skip skills that fail to load
      }
    }
  }

  return loaded;
}
