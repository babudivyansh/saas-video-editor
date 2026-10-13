// "Recently used" on the AI Tools hub. Per viewer and best-effort: tool jobs
// live in an in-memory map (lib/job-routes.ts) with no per-user listing, so the
// browser remembers which tools were opened instead. Storage can be missing or
// throw (private windows, blocked site data) — every access is guarded and the
// hub renders fine without it.

const KEY = "clipiro:recentTools";
const MAX = 4;

export function readRecentTools(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordRecentTool(slug: string): void {
  try {
    const next = [slug, ...readRecentTools().filter((s) => s !== slug)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the row just stays empty */
  }
}
