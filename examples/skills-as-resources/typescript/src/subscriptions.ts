/**
 * Resource subscription manager for the Skills as Resources MCP server.
 *
 * Tracks client subscriptions to skill:// URIs and sets up file watchers
 * (via chokidar) so `notifications/resources/updated` fires when underlying
 * file(s) change on disk. Watchers are created on-demand on subscribe and
 * cleaned up on unsubscribe.
 */

import * as path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { isPathWithinBase } from "@modelcontextprotocol/ext-skills/server";
import {
  isSkillIndexUri,
  parseSkillContentUri,
  SKILL_SCHEME,
} from "@modelcontextprotocol/ext-skills";
import type { SkillMetadata } from "@modelcontextprotocol/ext-skills";

/** Debounce interval (ms) for coalescing rapid file changes. */
const DEBOUNCE_MS = 100;

export interface SubscriptionManager {
  subscribe(uri: string): void;
  unsubscribe(uri: string): void;
  unsubscribeByPrefix(prefix: string): void;
  close(): void;
}

/**
 * Resolve a `skill://` URI to file paths to watch.
 * Returns [] if the URI is unknown — subscribe still succeeds, no watcher.
 */
function resolveUriToFilePaths(
  uri: string,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
): string[] {
  // skill://index.json — depends on every SKILL.md
  if (isSkillIndexUri(uri)) {
    return Array.from(skillMap.values()).map((s) => s.path);
  }

  // skill://<skillPath>/SKILL.md
  const parsed = parseSkillContentUri(uri);
  if (parsed) {
    const skill = skillMap.get(parsed.skillPath);
    return skill ? [skill.path] : [];
  }

  // skill://<skillPath>/<filePath> — longest skill path prefix wins
  if (!uri.startsWith(SKILL_SCHEME)) return [];
  const rest = uri.slice(SKILL_SCHEME.length);
  const sortedPaths = Array.from(skillMap.keys()).sort(
    (a, b) => b.length - a.length,
  );
  for (const skillPath of sortedPaths) {
    const prefix = skillPath + "/";
    if (rest.startsWith(prefix)) {
      const filePath = rest.slice(prefix.length);
      if (!filePath) return [];
      const skill = skillMap.get(skillPath)!;
      const fullPath = path.join(skill.skillDir, filePath);
      if (!isPathWithinBase(fullPath, skillsDir)) return [];
      return [fullPath];
    }
  }
  return [];
}

export function createSubscriptionManager(
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  notifyCallback: (uri: string) => void,
): SubscriptionManager {
  const subscribedUris = new Set<string>();
  const uriToFilePaths = new Map<string, Set<string>>();
  const filePathToUris = new Map<string, Set<string>>();
  const watchers = new Map<string, FSWatcher>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function onFileChange(changedPath: string): void {
    const normalized = changedPath.replace(/\\/g, "/");

    for (const [watchedPath, uris] of filePathToUris) {
      const watchedNorm = watchedPath.replace(/\\/g, "/");
      const isMatch =
        normalized === watchedNorm || normalized.startsWith(watchedNorm + "/");
      if (!isMatch) continue;

      for (const uri of uris) {
        const existing = debounceTimers.get(uri);
        if (existing) clearTimeout(existing);

        debounceTimers.set(
          uri,
          setTimeout(() => {
            debounceTimers.delete(uri);
            if (subscribedUris.has(uri)) {
              notifyCallback(uri);
            }
          }, DEBOUNCE_MS),
        );
      }
    }
  }

  function ensureWatcher(filePath: string): void {
    if (watchers.has(filePath)) return;
    const watcher = watch(filePath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
    });
    watcher.on("change", (p) => onFileChange(p));
    watcher.on("add", (p) => onFileChange(p));
    watcher.on("unlink", (p) => onFileChange(p));
    watchers.set(filePath, watcher);
  }

  function removeWatcher(filePath: string): void {
    const watcher = watchers.get(filePath);
    if (watcher) {
      watcher.close();
      watchers.delete(filePath);
    }
  }

  return {
    subscribe(uri: string): void {
      if (subscribedUris.has(uri)) return;
      subscribedUris.add(uri);

      const paths = resolveUriToFilePaths(uri, skillMap, skillsDir);
      if (paths.length === 0) return;

      uriToFilePaths.set(uri, new Set(paths));

      for (const p of paths) {
        let uris = filePathToUris.get(p);
        if (!uris) {
          uris = new Set();
          filePathToUris.set(p, uris);
        }
        uris.add(uri);
        ensureWatcher(p);
      }

      console.error(
        `[subscriptions] Subscribed: ${uri} (watching ${paths.length} path(s))`,
      );
    },

    unsubscribe(uri: string): void {
      if (!subscribedUris.has(uri)) return;
      subscribedUris.delete(uri);

      const timer = debounceTimers.get(uri);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(uri);
      }

      const paths = uriToFilePaths.get(uri);
      if (!paths) return;

      for (const p of paths) {
        const uris = filePathToUris.get(p);
        if (uris) {
          uris.delete(uri);
          if (uris.size === 0) {
            filePathToUris.delete(p);
            removeWatcher(p);
          }
        }
      }

      uriToFilePaths.delete(uri);
      console.error(`[subscriptions] Unsubscribed: ${uri}`);
    },

    unsubscribeByPrefix(prefix: string): void {
      const toRemove = Array.from(subscribedUris).filter((uri) =>
        uri.startsWith(prefix),
      );
      for (const uri of toRemove) {
        this.unsubscribe(uri);
      }
    },

    close(): void {
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();

      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();

      subscribedUris.clear();
      uriToFilePaths.clear();
      filePathToUris.clear();

      console.error("[subscriptions] Closed all watchers");
    },
  };
}
