"use client";

// Admin's view of the shared dashboard kit.
//
// The primitives themselves moved to app/components/dashboard when the Social
// Tracker was rebuilt on the same grammar — a customer route must not import
// from app/admin/**, which would invert the trust direction and let an admin
// tweak ship to paying customers without customer-facing review. This file is
// the compatibility surface, so every existing `from "./ui"` / `from
// "../../dashboard/ui"` import keeps resolving to the same names.
//
// app/admin/dashboard/ui.exports.test.ts locks that surface. Deleting a name
// from here is a breaking change to ~11 admin pages and should fail loudly.

export {
  Band,
  LAZY_GROUP,
  SPAN,
  CountUp,
  DeltaChip,
  Kpi,
  MiniKpi,
  PlaceholderKpi,
  ErrorCard,
  HealthDot,
  Skeleton,
  BRAND,
  PALETTE,
  compact,
  pct,
  timeAgo,
  type CsvRows,
} from "@/app/components/dashboard";

// Renamed on the way out: it wraps tables, gauges and lists at least as often
// as charts. Admin keeps calling it ChartContainer.
export { Panel as ChartContainer } from "@/app/components/dashboard";

import { downloadRowsCsv, type CsvRows } from "@/app/components/dashboard";

// ── Admin-only, deliberately not lifted ──────────────────────────────────────

/** Paise → ₹. Billing domain; nothing outside admin should format money. */
export const inr = (paise: number | null | undefined) =>
  paise == null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

// Recharts writes the tooltip background as a WHITE inline style by default,
// which lands as a white card floating on the dark dashboard. A stylesheet
// cannot reach an inline style, so every <Tooltip> has to pass these. Recharts
// is admin-only (see app/components/charts/index.ts), so these are too.
export const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "var(--panel-raised)",
  color: "var(--fg)",
  // --elev-lg does not exist; globals.css defines --tw-elev-lg. The old name
  // resolved to nothing, so every admin tooltip rendered without a shadow.
  boxShadow: "var(--tw-elev-lg)",
} as const;
export const TOOLTIP_ITEM_STYLE = { color: "var(--fg)" } as const;
export const TOOLTIP_LABEL_STYLE = { color: "var(--fg-muted)" } as const;

/**
 * Kept as an alias so admin call sites don't change. The implementation now
 * appends the anchor before clicking and revokes on the next tick (Safari
 * silently produced an empty file otherwise), and writes a UTF-8 BOM so Excel
 * stops mangling non-ASCII labels — neither of which the old copy here did.
 */
export function downloadCsv(filename: string, rows: CsvRows) {
  downloadRowsCsv(filename, rows);
}

// `Leaderboard` used to live here and was imported by nothing — the live
// dashboard inlines its own version, because this one still used bg-tint-blue
// for the avatar chip, which resolves to lime under the emerald theme. Deleted
// rather than moved.
