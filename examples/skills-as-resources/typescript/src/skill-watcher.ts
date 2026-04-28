/**
 * Directory-level file watcher for the Skills as Resources MCP server.
 *
 * Watches the skills directory for structural changes — new or removed
 * skill directories, and SKILL.md files appearing or disappearing — so
 * the server can dynamically update its resource list and send
 * `notifications/resources/list_changed` to connected clients.
 */

import * as path from "node:path";
import { watch, type FSWatcher } from "chokidar";

/** Debounce interval (ms) — long enough for a directory + SKILL.md to be written. */
const DEBOUNCE_MS = 500;

/** File names that make a directory a valid skill. */
const SKILL_FILE_NAMES = new Set(["SKILL.md", "skill.md"]);

export interface SkillDirectoryWatcher {
  /** Tear down the watcher and clear pending timers. */
  close(): void;
}

/**
 * Watch `skillsDir` for structural changes (new/removed skills) and call
 * `onChanged` when the set of valid skill directories may have changed.
 *
 * Only reacts to:
 *  - Directory additions/removals directly inside `skillsDir`
 *  - SKILL.md / skill.md files appearing or disappearing inside those directories
 *
 * Changes are debounced so that a directory being populated (mkdir → write SKILL.md)
 * triggers a single callback invocation.
 */
export function createSkillDirectoryWatcher(
  skillsDir: string,
  onChanged: () => void,
): SkillDirectoryWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCallback(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChanged();
    }, DEBOUNCE_MS);
  }

  /**
   * Determine whether a filesystem event is relevant to skill discovery.
   * Skills may be nested at any depth (SEP-2640 §Resource Mapping), so we
   * react to any directory add/remove or any SKILL.md add/remove anywhere
   * under skillsDir.
   */
  function isRelevantEvent(eventPath: string, eventType: string): boolean {
    const normalized = eventPath.replace(/\\/g, "/");
    const base = skillsDir.replace(/\\/g, "/");
    if (!normalized.startsWith(base + "/")) return false;

    if (eventType === "addDir" || eventType === "unlinkDir") {
      return true;
    }

    const fileName = path.basename(normalized);
    return SKILL_FILE_NAMES.has(fileName);
  }

  const watcher = watch(skillsDir, {
    ignoreInitial: true,
  });

  watcher.on("addDir", (p) => {
    if (isRelevantEvent(p, "addDir")) scheduleCallback();
  });
  watcher.on("unlinkDir", (p) => {
    if (isRelevantEvent(p, "unlinkDir")) scheduleCallback();
  });
  watcher.on("add", (p) => {
    if (isRelevantEvent(p, "add")) scheduleCallback();
  });
  watcher.on("unlink", (p) => {
    if (isRelevantEvent(p, "unlink")) scheduleCallback();
  });

  console.error(`[skill-watcher] Watching for skill directory changes: ${skillsDir}`);

  return {
    close(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      watcher.close();
      console.error("[skill-watcher] Stopped watching");
    },
  };
}
