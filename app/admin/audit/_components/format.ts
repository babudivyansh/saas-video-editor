// Turning audit before/after snapshots into something a person can check:
// a field-by-field diff with values formatted the way the admin UI shows them.

/**
 * unrecorded — present in `before` but absent from a partial `after`: many
 * edit routes snapshot the whole record before and only the fields they set
 * after, so a missing key means "not touched", not "cleared".
 */
export type ChangeKind = "changed" | "added" | "removed" | "same" | "unrecorded";

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
  kind: ChangeKind;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Nested objects → dotted paths ("limits.maxUses"). Arrays stay whole values. */
export function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0 && prefix) out[prefix] = {};
    for (const k of keys) flatten(value[k], prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) {
    out[prefix] = value;
  } else if (value !== null && value !== undefined) {
    out["value"] = value;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Field-level changes between two snapshots. When only one side exists (a
 * create, a delete, an action that records just its result) every field is
 * returned as added / removed so the snapshot still reads as a table.
 */
export function diffSnapshots(before: unknown, after: unknown): FieldChange[] {
  const b = flatten(before);
  const a = flatten(after);
  const bothSides = before != null && after != null;
  const paths = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const changes = paths.map((path): FieldChange => {
    const inB = path in b;
    const inA = path in a;
    const kind: ChangeKind =
      inB && inA ? (same(b[path], a[path]) ? "same" : "changed") : inA ? "added" : bothSides ? "unrecorded" : "removed";
    return { path, before: b[path], after: a[path], kind };
  });
  const order: Record<ChangeKind, number> = { changed: 0, added: 1, removed: 2, same: 3, unrecorded: 4 };
  return changes.sort((x, y) => order[x.kind] - order[y.kind] || x.path.localeCompare(y.path));
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "limits.maxUses" → "Limits › Max uses"; "amountInPaise" → "Amount". */
export function fieldLabel(path: string): string {
  return path
    .split(".")
    .map((part) =>
      part
        .replace(/InPaise$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase()),
    )
    .join(" › ");
}

/** A value the way a person reads it: ₹ for paise, local dates, On/Off, "—" for nothing. */
export function formatValue(path: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (typeof v === "number" && /paise$/i.test(path)) return `₹${(v / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (typeof v === "string" && ISO.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (Array.isArray(v)) return v.length === 0 ? "(none)" : v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Fields that hold the id of something the admin can open. Matched on the
// LAST path segment, so "limits.userId" links too.
const ID_LINKS: Array<[RegExp, (id: string) => string]> = [
  [/^(userId|referredUserId|moderatedBy|ownerId|actorId)$/, (id) => `/admin/users/${id}`],
  [/^reviewId$/, (id) => `/admin/reviews/${id}`],
  [/^planId$/, () => "/admin/pricing"],
  [/^couponId$/, () => "/admin/coupons"],
  [/^(affiliateId|commissionId)$/, () => "/admin/affiliate"],
  [/^(announcementId)$/, () => "/admin/announcements"],
];
const LOOKS_LIKE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** An admin link for an id-valued field ("userId" → the account page), or null. */
export function linkFor(path: string, value: unknown): string | null {
  if (typeof value !== "string" || !LOOKS_LIKE_ID.test(value)) return null;
  const field = path.split(".").pop() ?? path;
  const hit = ID_LINKS.find(([re]) => re.test(field));
  return hit ? hit[1](value) : null;
}

/** "Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/120" → "Chrome on Windows". */
export function describeDevice(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua.slice(0, 60);
}

export function relativeTime(iso: string, now: number): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function dayHeading(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now - 86400_000);
  const sameDay = (x: Date, y: Date) => x.toDateString() === y.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
