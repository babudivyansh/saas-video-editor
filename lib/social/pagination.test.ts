import { describe, it, expect } from "vitest";
import { decodeCursor, encodeCursor, keysetOrderBy, keysetWhere, paginate } from "./pagination";

describe("cursor encoding", () => {
  it("round-trips", () => {
    const c = { value: 1234, id: "clx_abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("round-trips a null sort value", () => {
    const c = { value: null, id: "clx_abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("round-trips a string value (ISO dates)", () => {
    const c = { value: "2026-08-03T12:00:00.000Z", id: "clx_abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("is URL-safe", () => {
    const encoded = encodeCursor({ value: "a+b/c=d", id: "x".repeat(30) });
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("returns null for anything malformed rather than throwing", () => {
    for (const bad of [undefined, null, "", "not-base64!!", Buffer.from("[]").toString("base64url")]) {
      expect(decodeCursor(bad as string)).toBeNull();
    }
  });

  it("rejects a cursor missing its id tiebreaker", () => {
    const forged = Buffer.from(JSON.stringify({ value: 1 })).toString("base64url");
    expect(decodeCursor(forged)).toBeNull();
  });

  it("rejects a cursor whose value is not a scalar", () => {
    const forged = Buffer.from(JSON.stringify({ value: { $gt: 0 }, id: "x" })).toString("base64url");
    expect(decodeCursor(forged)).toBeNull();
  });
});

describe("keysetWhere", () => {
  it("returns undefined for the first page", () => {
    expect(keysetWhere("views", null)).toBeUndefined();
  });

  it("selects strictly-smaller values, plus ties broken by id", () => {
    const where = keysetWhere("views", { value: 500, id: "p10" }) as { OR: unknown[] };
    expect(where.OR).toEqual([
      { views: { lt: 500 } },
      { AND: [{ views: 500 }, { id: { lt: "p10" } }] },
      { views: null },
    ]);
  });

  it("orders by id alone once inside the trailing null run", () => {
    expect(keysetWhere("views", { value: null, id: "p10" })).toEqual({
      AND: [{ views: null }, { id: { lt: "p10" } }],
    });
  });

  it("keeps nulls reachable, since they sort after real values", () => {
    const where = keysetWhere("shares", { value: 0, id: "p1" }) as { OR: Array<Record<string, unknown>> };
    expect(where.OR).toContainEqual({ shares: null });
  });
});

describe("keysetOrderBy", () => {
  it("always includes the id tiebreaker", () => {
    expect(keysetOrderBy("views")).toEqual([
      { views: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
  });
});

describe("paginate", () => {
  const rows = (n: number, views: number[]) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, views: views[i] ?? 0 }));

  it("returns everything and no cursor when the page is not full", () => {
    const { items, nextCursor } = paginate(rows(3, [30, 20, 10]), 5, "views");
    expect(items).toHaveLength(3);
    expect(nextCursor).toBeNull();
  });

  it("returns no cursor when the result exactly fills the page", () => {
    // Over-fetching limit+1 is what distinguishes "exactly full" from "more".
    expect(paginate(rows(5, [50, 40, 30, 20, 10]), 5, "views").nextCursor).toBeNull();
  });

  it("trims the over-fetched row and emits a cursor", () => {
    const { items, nextCursor } = paginate(rows(6, [60, 50, 40, 30, 20, 10]), 5, "views");
    expect(items).toHaveLength(5);
    expect(decodeCursor(nextCursor!)).toEqual({ value: 20, id: "p4" });
  });

  it("emits a null-valued cursor when the last row's sort field is null", () => {
    const withNulls = [
      { id: "p0", views: 10 },
      { id: "p1", views: null as number | null },
      { id: "p2", views: null as number | null },
    ];
    const { nextCursor } = paginate(withNulls, 2, "views");
    expect(decodeCursor(nextCursor!)).toEqual({ value: null, id: "p1" });
  });

  it("serialises a Date cursor value as ISO", () => {
    const dated = [
      { id: "p0", publishedAt: new Date("2026-08-03T00:00:00Z") },
      { id: "p1", publishedAt: new Date("2026-08-02T00:00:00Z") },
    ];
    const { nextCursor } = paginate(dated, 1, "publishedAt");
    expect(decodeCursor(nextCursor!)).toEqual({ value: "2026-08-03T00:00:00.000Z", id: "p0" });
  });
});

describe("end-to-end paging over a tied sort column", () => {
  // The regression this module exists for: with an id-only cursor, a run of
  // equal `views` either repeats or skips rows across the page boundary.
  const all = [
    { id: "p9", views: 100 },
    { id: "p8", views: 50 },
    { id: "p7", views: 50 },
    { id: "p6", views: 50 },
    { id: "p5", views: 50 },
    { id: "p4", views: 10 },
  ];

  /** Apply the keyset predicate the way Postgres would. */
  function query(cursor: ReturnType<typeof decodeCursor>, limit: number) {
    let rows = all;
    if (cursor) {
      rows = all.filter((r) => {
        if (cursor.value === null) return r.views === null && r.id < cursor.id;
        const v = cursor.value as number;
        return r.views < v || (r.views === v && r.id < cursor.id);
      });
    }
    return paginate(rows, limit, "views");
  }

  it("walks every row exactly once with no repeats", () => {
    const seen: string[] = [];
    let cursor = decodeCursor(null);
    for (let guard = 0; guard < 10; guard += 1) {
      const { items, nextCursor } = query(cursor, 2);
      seen.push(...items.map((i) => i.id));
      if (!nextCursor) break;
      cursor = decodeCursor(nextCursor);
    }
    expect(seen).toEqual(["p9", "p8", "p7", "p6", "p5", "p4"]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("does not drop a row when the page boundary lands mid-tie", () => {
    // Page size 3 splits the four rows with views=50 across two pages.
    const first = query(decodeCursor(null), 3);
    expect(first.items.map((i) => i.id)).toEqual(["p9", "p8", "p7"]);
    const second = query(decodeCursor(first.nextCursor!), 3);
    expect(second.items.map((i) => i.id)).toEqual(["p6", "p5", "p4"]);
  });
});
