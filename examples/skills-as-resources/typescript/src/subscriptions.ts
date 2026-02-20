/**
 * Resource subscription manager for the Skills as Resources MCP server.
 *
 * Tracks client subscriptions to skill:// URIs and sets up file watchers
 * (via chokidar) so that `notifications/resources/updated` is sent when
 * the underlying file(s) change on disk. Watchers are created on-demand
 * when a URI is subscribed and cleaned up when unsubscribed.
 *
 * Inspired by:
 * - skilljack-mcp by Ola Hungerford (https://github.com/olaservo/skilljack-mcp)
 */

import * as path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { isPathWithinBase } from "./skill-discovery.js";
import type { SkillMetadata } from "./types.js";

/** Debounce interval (ms) for coalescing rapid file changes. */
const DEBOUNCE_MS = 100;

export interface SubscriptionManager {
  /** Register interest in change notifications for `uri`. */
  subscribe(uri: string): void;
  /** Remove interest in change notifications for `uri`. */
  unsubscribe(uri: string): void;
  /** Unsubscribe all URIs matching a prefix (used when a skill is removed). */
  unsubscribeByPrefix(prefix: string): void;
  /** Tear down all watchers and clear internal state. */
  close(): void;
}

/**
 * Resolve a `skill://` URI to the file path(s) that should be watched.
 *
 * Returns an empty array for URIs that cannot be resolved (unknown skill,
 * path traversal, etc.) — the subscribe still succeeds per MCP spec but
 * no watcher is created.
 */
function resolveUriToFilePaths(
  uri: string,
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
): string[] {
  // skill://prompt-xml — depends on every SKILL.md
  if (uri === "skill://prompt-xml") {
    return Array.from(skillMap.values()).map((s) => s.path);
  }

  // Parse skill:// URIs: skill://{name}/SKILL.md | skill://{name}/_manifest | skill://{name}/{path}
  const match = uri.match(/^skill:\/\/([^/]+)\/(.+)$/);
  if (!match) return [];

  const [, skillName, rest] = match;
  const skill = skillMap.get(skillName);
  if (!skill) return [];

  if (rest === "SKILL.md") {
    return [skill.path];
  }

  if (rest === "_manifest") {
    // Any file change in the skill directory affects the manifest.
    // Watch the directory itself (chokidar watches recursively).
    return [skill.skillDir];
  }

  // Supporting file: skill://{name}/{path}
  const filePath = path.join(skill.skillDir, rest);
  if (!isPathWithinBase(filePath, skillsDir)) return [];
  return [filePath];
}

/**
 * Create a subscription manager bound to the given skill map.
 *
 * @param skillMap    Discovered skills (name → metadata).
 * @param skillsDir   Root skills directory (for path security checks).
 * @param notifyCallback  Called with the URI when a subscribed resource changes.
 */
export function createSubscriptionManager(
  skillMap: Map<string, SkillMetadata>,
  skillsDir: string,
  notifyCallback: (uri: string) => void,
): SubscriptionManager {
  /** URIs the client has subscribed to. */
  const subscribedUris = new Set<string>();

  /** URI → set of absolute file paths being watched for it. */
  const uriToFilePaths = new Map<string, Set<string>>();

  /** Absolute file path → set of URIs that depend on it. */
  const filePathToUris = new Map<string, Set<string>>();

  /** Active chokidar watchers keyed by the path being watched. */
  const watchers = new Map<string, FSWatcher>();

  /** Per-URI debounce timers. */
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Called by chokidar when a watched path changes.
   * Fans out to every URI that depends on the changed path,
   * debouncing each independently.
   */
  function onFileChange(changedPath: string): void {
    // Normalize to forward slashes for consistent lookup
    const normalized = changedPath.replace(/\\/g, "/");

    // Check both the normalized path and the original against the map.
    // Also check if the changed path is *inside* a watched directory.
    for (const [watchedPath, uris] of filePathToUris) {
      const watchedNorm = watchedPath.replace(/\\/g, "/");
      const changedNorm = normalized;

      const isMatch =
        changedNorm === watchedNorm ||
        changedNorm.startsWith(watchedNorm + "/");

      if (!isMatch) continue;

      for (const uri of uris) {
        // Clear any existing timer for this URI
        const existing = debounceTimers.get(uri);
        if (existing) clearTimeout(existing);

        debounceTimers.set(
          uri,
          setTimeout(() => {
            debounceTimers.delete(uri);
            // Only notify if still subscribed (may have unsubscribed during debounce)
            if (subscribedUris.has(uri)) {
              notifyCallback(uri);
            }
          }, DEBOUNCE_MS),
        );
      }
    }
  }

  /**
   * Start watching `filePath` if not already watched.
   */
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

  /**
   * Stop watching `filePath` and remove the watcher.
   */
  function removeWatcher(filePath: string): void {
    const watcher = watchers.get(filePath);
    if (watcher) {
      watcher.close();
      watchers.delete(filePath);
    }
  }

  return {
    subscribe(uri: string): void {
      if (subscribedUris.has(uri)) return; // already subscribed
      subscribedUris.add(uri);

      const paths = resolveUriToFilePaths(uri, skillMap, skillsDir);
      if (paths.length === 0) return; // unknown URI — accept silently

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

      console.error(`[subscriptions] Subscribed: ${uri} (watching ${paths.length} path(s))`);
    },

    unsubscribe(uri: string): void {
      if (!subscribedUris.has(uri)) return; // not subscribed — no-op
      subscribedUris.delete(uri);

      // Clear any pending debounce timer
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
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();

      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();

      subscribedUris.clear();
      uriToFilePaths.clear();
      filePathToUris.clear();

      console.error("[subscriptions] Closed all watchers");
    },
  };
}
