// Locks the compatibility surface of app/admin/dashboard/ui.tsx.
//
// The primitives moved to app/components/dashboard, and this file is now a
// re-export shim. Eleven admin pages import from it by name, so quietly
// dropping one would break them — and several of those imports are only
// exercised on screens that are tedious to reach by hand. tsc catches a missing
// name at a call site, but not a name nobody happens to import today and does
// tomorrow, which is exactly what a shim invites.

import { describe, expect, it } from "vitest";

const EXPECTED = [
  // Lifted to app/components/dashboard
  "Band", "LAZY_GROUP", "SPAN",
  "ChartContainer", // = Panel, renamed on the way out
  "CountUp", "DeltaChip", "Kpi", "MiniKpi", "PlaceholderKpi",
  "ErrorCard", "HealthDot", "Skeleton",
  "BRAND", "PALETTE",
  "compact", "pct", "timeAgo",
  // Admin-only, deliberately kept here
  "inr",
  "TOOLTIP_STYLE", "TOOLTIP_ITEM_STYLE", "TOOLTIP_LABEL_STYLE",
  "downloadCsv",
].sort();

describe("app/admin/dashboard/ui", () => {
  it("exports exactly the names admin imports from it", async () => {
    const mod = await import("./ui");
    // Type-only re-exports (CsvRows) leave no runtime binding, so compare
    // against what actually exists at runtime.
    expect(Object.keys(mod).sort()).toEqual(EXPECTED);
  });

  it("still points ChartContainer at the renamed Panel", async () => {
    const [ui, shared] = await Promise.all([import("./ui"), import("@/app/components/dashboard")]);
    expect(ui.ChartContainer).toBe(shared.Panel);
  });

  it("keeps the admin-only pieces admin-only", async () => {
    const shared = (await import("@/app/components/dashboard")) as Record<string, unknown>;
    // inr is billing domain; the tooltip styles exist purely to defeat
    // Recharts' white inline background, and Recharts never enters a customer
    // route. If these ever appear in the shared kit, something leaked.
    for (const name of ["inr", "TOOLTIP_STYLE", "TOOLTIP_ITEM_STYLE", "TOOLTIP_LABEL_STYLE"]) {
      expect(shared[name]).toBeUndefined();
    }
  });

  it("formats money as rupees from paise", async () => {
    const { inr } = await import("./ui");
    expect(inr(123456)).toBe("₹1,235");
    expect(inr(null)).toBe("—");
  });
});
