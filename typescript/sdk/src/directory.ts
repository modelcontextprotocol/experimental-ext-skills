/**
 * `resources/directory/read` — directory enumeration for skills served as
 * individual files (SEP-2640).
 *
 * A skill is a directory of files. Hosts that materialize a skill (or walk
 * its contents) need to enumerate the files under a skill root without
 * already knowing every URI. SEP-2640 defines an optional method for this,
 * gated behind the `directoryRead` setting of the extension's capability
 * declaration (clients MUST NOT call it against a server that has not
 * declared `directoryRead: true`):
 *
 *   request:  { method: "resources/directory/read", params: { uri, cursor? } }
 *   result:   { resources: Resource[], nextCursor? }   // same shape as resources/list
 *
 * The listing is metadata-only (each child's `uri`/`name`/`mimeType`, NOT its
 * contents), non-recursive (clients descend by calling again on a child
 * directory), and cursor-paginated. A directory resource is one whose
 * `mimeType` is `inode/directory`; directory URIs are written without a
 * trailing slash. Reading a non-directory or nonexistent URI is an error
 * (`-32602` Invalid params).
 *
 * This module holds the protocol constants, schemas, and the directory-tree
 * builder — all dependency-free so the client subpath can import them. The
 * server-side handler factory (`makeDirectoryReadHandler`) lives in the
 * server module, which registers it via the v2 MCP SDK's
 * `setRequestHandler(method, { params, result }, handler)`.
 */

import { z } from "zod";
import type { SkillMetadata } from "./types.js";
import { getMimeType } from "./mime.js";
import { SKILL_URI_SCHEME } from "./uri.js";

/** JSON-RPC method name for directory enumeration (SEP-2640). */
export const DIRECTORY_READ_METHOD = "resources/directory/read";

/** The `mimeType` that marks a resource as a directory (SEP-2640). */
export const INODE_DIRECTORY_MIME = "inode/directory";

/** Default page size for a `resources/directory/read` response. */
export const DEFAULT_DIRECTORY_PAGE_SIZE = 100;

/**
 * Params schema for `resources/directory/read`: the directory's URI and an
 * optional pagination cursor. Passed (with the result schema) to the v2 MCP
 * SDK's `setRequestHandler` for validation before the handler runs.
 */
export const DirectoryReadParamsSchema = z.looseObject({
  uri: z.string(),
  cursor: z.string().optional(),
});

/**
 * Result schema for `resources/directory/read`, mirroring the
 * `resources/list` result shape (`{ resources, nextCursor? }`). Passed to the
 * client's low-level `request()` so the response is validated. Unknown fields
 * pass through.
 */
export const DirectoryReadResultSchema = z.looseObject({
  resources: z.array(
    z.looseObject({
      uri: z.string(),
      name: z.string(),
      title: z.string().optional(),
      mimeType: z.string().optional(),
      description: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
  nextCursor: z.string().optional(),
});

/**
 * A child resource in a directory listing — a structural subset of the MCP
 * `Resource` type (metadata only). Directories carry `inode/directory`.
 */
export interface DirectoryChild {
  uri: string;
  name: string;
  mimeType: string;
  /** File size in bytes, when known. Omitted for directories. */
  size?: number;
}

/** Result shape returned by the `resources/directory/read` handler. */
export interface DirectoryReadResult {
  resources: DirectoryChild[];
  nextCursor?: string;
}

/** Options for the directory-read handler. */
export interface DirectoryReadHandlerOptions {
  /** Children per page. Default {@link DEFAULT_DIRECTORY_PAGE_SIZE}. */
  pageSize?: number;
}

/** Strip a single trailing slash (but never reduce the scheme itself). */
export function stripTrailingSlash(uri: string): string {
  if (uri.length > SKILL_URI_SCHEME.length && uri.endsWith("/")) {
    return uri.slice(0, -1);
  }
  return uri;
}

/**
 * Build the directory tree implied by a skill map.
 *
 * Every directory reachable from a served file — the skill root
 * (`skill://<skillPath>`), each organizational prefix segment
 * (`skill://acme`, `skill://acme/billing`), and any subdirectory holding a
 * supporting document — becomes a key whose value is its **direct** children
 * (files and immediate subdirectories). No synthetic `skill://` root is
 * invented. Nested skills need no special handling: their files are already
 * supporting files of the enclosing skill, and their own map entries produce
 * the same paths.
 *
 * @returns Map keyed by directory URI (no trailing slash) → sorted children.
 */
export function buildDirectoryTree(
  skillMap: Map<string, SkillMetadata>,
): Map<string, DirectoryChild[]> {
  // dirPath (without scheme) → childName → child descriptor
  const dirs = new Map<string, Map<string, DirectoryChild>>();

  const ensureDir = (dirPath: string): Map<string, DirectoryChild> => {
    let d = dirs.get(dirPath);
    if (!d) {
      d = new Map();
      dirs.set(dirPath, d);
    }
    return d;
  };

  /** Record a file at `<dirSegments...>/<fileName>`, creating ancestors. */
  const addFile = (segments: string[], size?: number) => {
    // segments includes the file name as its last element.
    for (let i = 0; i < segments.length; i++) {
      const childName = segments[i];
      const parentPath = segments.slice(0, i).join("/");
      const isLast = i === segments.length - 1;
      const dir = ensureDir(parentPath);
      const childPath = segments.slice(0, i + 1).join("/");
      if (isLast) {
        dir.set(childName, {
          uri: `${SKILL_URI_SCHEME}${childPath}`,
          name: childName,
          mimeType: getMimeType(childName),
          ...(size !== undefined ? { size } : {}),
        });
      } else {
        // Intermediate segment: a subdirectory. Don't clobber a file.
        if (!dir.has(childName)) {
          dir.set(childName, {
            uri: `${SKILL_URI_SCHEME}${childPath}`,
            name: childName,
            mimeType: INODE_DIRECTORY_MIME,
          });
        }
      }
    }
  };

  /**
   * Record a directory at `<segments...>`, creating ancestors, registering
   * it as a child of its parent, and materializing it as a tree key even
   * when it holds no files — so an empty directory lists as an empty
   * result rather than reading as nonexistent (SEP-2640: "An empty
   * directory yields an empty `resources` array").
   */
  const addDir = (segments: string[]) => {
    for (let i = 0; i < segments.length; i++) {
      const parentPath = segments.slice(0, i).join("/");
      const childPath = segments.slice(0, i + 1).join("/");
      const dir = ensureDir(parentPath);
      // Don't clobber a file that happens to share the name.
      if (!dir.has(segments[i])) {
        dir.set(segments[i], {
          uri: `${SKILL_URI_SCHEME}${childPath}`,
          name: segments[i],
          mimeType: INODE_DIRECTORY_MIME,
        });
      }
      ensureDir(childPath);
    }
  };

  for (const [skillPath, skill] of skillMap) {
    const base = skillPath.split("/");
    // SKILL.md at the skill root.
    addFile([...base, "SKILL.md"], skill.size);
    // Supporting documents, addressed relative to the skill root.
    for (const doc of skill.documents) {
      addFile([...base, ...doc.path.split("/")], doc.size);
    }
    // Every subdirectory, including empty ones.
    for (const dir of skill.directories ?? []) {
      addDir([...base, ...dir.split("/")]);
    }
  }

  // Materialize, dropping the synthetic empty-string root and sorting children
  // (directories first, then files, each alphabetically) for stable paging.
  const out = new Map<string, DirectoryChild[]>();
  for (const [dirPath, children] of dirs) {
    if (dirPath === "") continue;
    const list = Array.from(children.values()).sort((a, b) => {
      const aDir = a.mimeType === INODE_DIRECTORY_MIME;
      const bDir = b.mimeType === INODE_DIRECTORY_MIME;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    out.set(`${SKILL_URI_SCHEME}${dirPath}`, list);
  }
  return out;
}
