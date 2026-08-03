/**
 * Opaque offset-based pagination cursors, shared by the `skills/list` and
 * `resources/directory/read` handlers. The cursor encodes a numeric offset
 * as base64 — opaque to clients per the MCP pagination contract.
 */

/** Decode an opaque pagination cursor to a numeric offset. */
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const n = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Encode a numeric offset as an opaque pagination cursor. */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf-8").toString("base64");
}

/**
 * Slice one page out of `items`, returning the page plus the `nextCursor`
 * to hand back when more items remain.
 */
export function paginate<T>(
  items: T[],
  cursor: string | undefined,
  pageSize: number,
): { page: T[]; nextCursor?: string } {
  const offset = decodeCursor(cursor);
  const page = items.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;
  return {
    page,
    ...(nextOffset < items.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
  };
}
