/**
 * Client-side skill catalog with on-demand dependency resolution.
 *
 * Discovers skills from one or more MCP servers, caches their frontmatter
 * as lightweight context strings, and exposes a load_skill tool definition
 * for on-demand skill loading. When a skill with MCP server dependencies
 * is loaded, the onDependenciesRequired callback fires so the host can
 * connect required servers dynamically.
 *
 * Port of SkillsDotNet.Mcp.SkillCatalog (C#) to TypeScript.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SkillSummary, SkillDependencyRequest } from "./types.js";
import { listSkillResources, parseSkillFrontmatter } from "./client.js";

/**
 * Internal cache entry for a discovered skill.
 */
interface CachedSkill {
  client: Client;
  resourceUri: string;
  summary: SkillSummary;
  context: string;
  dependencies: string[];
}

/**
 * Formatter function for generating context strings from skill frontmatter.
 * Receives the parsed frontmatter fields and returns a text representation
 * suitable for injection into a system prompt (~50-100 tokens per skill).
 */
export type ContextFormatter = (frontmatter: {
  name: string;
  description: string;
  dependencies?: string[];
}) => string;

/**
 * Default context formatter — matches skillsdotnet's DefaultFormatter pattern.
 */
function defaultFormatter(frontmatter: {
  name: string;
  description: string;
  dependencies?: string[];
}): string {
  let text = `[skill: ${frontmatter.name}] ${frontmatter.description}`;
  if (frontmatter.dependencies && frontmatter.dependencies.length > 0) {
    text += ` (requires: ${frontmatter.dependencies.join(", ")})`;
  }
  return text;
}

/**
 * Client-side service that discovers skills from one or more MCP servers,
 * caches their frontmatter as lightweight context strings, and exposes
 * a load_skill tool for on-demand skill loading with dependency resolution.
 */
export class SkillCatalog {
  private readonly _cache = new Map<string, CachedSkill>();
  private readonly _contextFormatter: ContextFormatter;

  constructor(contextFormatter?: ContextFormatter) {
    this._contextFormatter = contextFormatter ?? defaultFormatter;
  }

  /**
   * Convenience factory that creates a catalog pre-populated from a single client.
   */
  static async create(
    client: Client,
    contextFormatter?: ContextFormatter,
  ): Promise<SkillCatalog> {
    const catalog = new SkillCatalog(contextFormatter);
    await catalog.addClient(client);
    return catalog;
  }

  /**
   * Discovers skills from the given client, reads each skill's SKILL.md,
   * parses frontmatter, and adds them to the catalog.
   * If a skill name already exists from a different client, it is overwritten.
   */
  async addClient(client: Client): Promise<void> {
    const skills = await listSkillResources(client);

    for (const skill of skills) {
      const result = await client.readResource({ uri: skill.uri });
      const content = result.contents[0];
      if (!content || !("text" in content)) continue;

      const parsed = parseSkillFrontmatter(content.text);
      if (!parsed) continue;

      const dependencies = parsed.dependencies ?? skill.dependencies ?? [];
      const context = this._contextFormatter({
        name: parsed.name,
        description: parsed.description,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
      });

      this._cache.set(parsed.name, {
        client,
        resourceUri: skill.uri,
        summary: { ...skill, dependencies },
        context,
        dependencies,
      });
    }
  }

  /**
   * Removes all skills that were discovered from the given client.
   */
  removeClient(client: Client): void {
    for (const [name, cached] of this._cache) {
      if (cached.client === client) {
        this._cache.delete(name);
      }
    }
  }

  /**
   * Names of all discovered skills.
   */
  get skillNames(): string[] {
    return Array.from(this._cache.keys());
  }

  /**
   * Returns the cached context string for the given skill.
   * @throws Error if the skill name is not in the catalog.
   */
  getSkillContext(skillName: string): string {
    const cached = this._cache.get(skillName);
    if (!cached) {
      throw new Error(`Skill '${skillName}' not found in catalog.`);
    }
    return cached.context;
  }

  /**
   * Returns context strings for all discovered skills.
   */
  getSkillContexts(): string[] {
    return Array.from(this._cache.values()).map((c) => c.context);
  }

  /**
   * Optional callback invoked when a skill with MCP server dependencies is loaded.
   * Return true if all servers are connected, false if any could not be connected.
   * When false is returned, loadSkill() throws an error.
   * If not set, skills with dependencies load silently without notification.
   */
  onDependenciesRequired?:
    | ((request: SkillDependencyRequest) => Promise<boolean>)
    | undefined;

  /**
   * Reads the full SKILL.md content for the given skill from its originating MCP server.
   * If the skill has dependencies and onDependenciesRequired is set, fires the callback first.
   *
   * @throws Error if the skill name is not found.
   * @throws Error if onDependenciesRequired returns false.
   */
  async loadSkill(skillName: string): Promise<string> {
    const cached = this._cache.get(skillName);
    if (!cached) {
      throw new Error(`Skill '${skillName}' not found in catalog.`);
    }

    if (cached.dependencies.length > 0 && this.onDependenciesRequired) {
      const request: SkillDependencyRequest = {
        skillName,
        serverNames: cached.dependencies,
      };

      const connected = await this.onDependenciesRequired(request);
      if (!connected) {
        throw new Error(
          `Cannot load skill '${skillName}': required MCP server dependencies could not be satisfied.`,
        );
      }
    }

    const result = await cached.client.readResource({
      uri: cached.resourceUri,
    });
    const content = result.contents[0];
    if (!content || !("text" in content)) {
      throw new Error(`No text content returned for skill '${skillName}'.`);
    }

    return content.text;
  }

  /**
   * Returns an MCP-compatible tool definition for the load_skill tool.
   * The description lists all available skill names, and the inputSchema
   * constrains the skillName parameter to an enum of known names.
   *
   * Rebuilt dynamically from the current cache state on each call.
   */
  getLoadSkillToolDefinition(): {
    name: string;
    description: string;
    inputSchema: object;
  } {
    const names = Array.from(this._cache.keys());
    return {
      name: "load_skill",
      description: `Load the full content of a skill by name. Available skills: ${names.join(", ")}`,
      inputSchema: {
        type: "object" as const,
        properties: {
          skillName: {
            type: "string" as const,
            description: "The name of the skill to load",
            enum: names,
          },
        },
        required: ["skillName"],
      },
    };
  }
}
