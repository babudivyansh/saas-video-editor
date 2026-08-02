// Keyset pagination over a non-unique sort column.
//
// THE BUG THIS FIXES. app/api/social/posts/route.ts orders by
// [{ [sort]: "desc" }, { id: "desc" }] but hands Prisma a cursor of { id }
// alone. Prisma resolves an id-only cursor by locating that row and skipping to
// it, which is only correct when the leading sort column is unique. It is not:
// `views` ties constantly on low-traffic accounts, and `shares`/`saves` are
// mostly zero, so whole runs of rows share a sort value. Rows either repeat or
// vanish across the page boundary.
//
// The fix is to carry BOTH halves of the sort key in the cursor and express the
// "everything after this row" condition explicitly as a lexicographic
// comparison, which is what keyset pagination actually requires.

export interface Cursor {
  /** The leading sort column's value on the last row of the previous page. */
  value: string | number | null;
  /** That row's id — the tiebreaker that makes the key unique. */
  id: string;
}

/** Encode a cursor. Base64 so it is opaque and URL-safe. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decode a cursor, returning null for anything malformed rather than throwing. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const { value, id } = parsed as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) return null;
    if (value !== null && typeof value !== "string" && typeof value !== "number") return null;
    return { value, id };
  } catch {
    return null;
  }
}

/**
 * A Prisma `where` fragment selecting every row strictly after `cursor` under
 * `ORDER BY field DESC, id DESC`.
 *
 * Reads as: field is strictly smaller, OR field ties and the id is smaller.
 *
 * Nulls need care. Prisma sorts them last under `nulls: "last"`, so once the
 * cursor's value is null every remaining row also has a null field and only the
 * id tiebreaker matters.
 */
export function keysetWhere(field: string, cursor: Cursor | null): Record<string, unknown> | undefined {
  if (!cursor) return undefined;

  if (cursor.value === null) {
    // Already inside the trailing null run: order by id alone.
    return { AND: [{ [field]: null }, { id: { lt: cursor.id } }] };
  }

  return {
    OR: [
      { [field]: { lt: cursor.value } },
      { AND: [{ [field]: cursor.value }, { id: { lt: cursor.id } }] },
      // Nulls sort after every real value, so they are still ahead of us.
      { [field]: null },
    ],
  };
}

/** Ordering to pair with `keysetWhere`. The id tiebreaker is not optional. */
export function keysetOrderBy(field: string): Array<Record<string, unknown>> {
  return [{ [field]: { sort: "desc", nulls: "last" } }, { id: "desc" }];
}

/**
 * Trim an over-fetched page and build the next cursor.
 *
 * Fetch `limit + 1` rows: the extra one is how you know another page exists
 * without a second COUNT query.
 */
export function paginate<T extends { id: string }>(
  rows: T[],
  limit: number,
  field: keyof T,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const value = last[field];
  return {
    items,
    nextCursor: encodeCursor({
      value:
        value === null || value === undefined
          ? null
          : value instanceof Date
            ? value.toISOString()
            : (value as string | number),
      id: last.id,
    }),
  };
}
