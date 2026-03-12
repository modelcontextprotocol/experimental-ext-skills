/**
 * MIME type utilities for skill documents.
 */

import * as path from "node:path";

/** Map file extensions to MIME types. */
const MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".py": "text/x-python",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".sql": "text/x-sql",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/**
 * Get the MIME type for a file based on its extension.
 */
export function getMimeType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Check if a MIME type represents text content (as opposed to binary).
 * Matches skillsdotnet's logic: text/* types, plus application/json,
 * application/xml, application/javascript, and +json/+xml suffixes.
 */
export function isTextMimeType(mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  if (mimeType === "application/xml") return true;
  if (mimeType === "application/javascript") return true;
  if (mimeType.endsWith("+json")) return true;
  if (mimeType.endsWith("+xml")) return true;
  return false;
}
