// Client-safe currency helpers — no prisma import, safe to use from "use
// client" components. Server-side config (FX rate, USD price-book overrides)
// lives in lib/currency.ts; the client only ever consumes prices /api/plans
// already computed (DbPlan.usdPriceInCents), never computes FX itself.

export type Currency = "INR" | "USD";

/** A stored/foreign currency string as a Currency, or null if it isn't one. */
export function parseCurrency(value: unknown): Currency | null {
  const v = typeof value === "string" ? value.toUpperCase() : "";
  return v === "INR" || v === "USD" ? v : null;
}

export function formatMoney(minorUnits: number, currency: Currency): string {
  const major = minorUnits / 100;
  if (currency === "USD") {
    return `$${major.toLocaleString("en-US", { minimumFractionDigits: major % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${Math.round(major).toLocaleString("en-IN")}`;
}

/** Format a stored Purchase amount (minor units of its own currency). Unknown
 *  or missing currency strings fall back to INR, the column's default. */
export function formatStoredMoney(minorUnits: number, currency: string | null | undefined): string {
  return formatMoney(minorUnits, parseCurrency(currency) ?? "INR");
}

/** Sum stored amounts per currency — never across them. */
export function totalsByCurrency(rows: Array<{ amountInPaise: number; currency?: string | null }>): Record<Currency, number> {
  const out: Record<Currency, number> = { INR: 0, USD: 0 };
  for (const r of rows) out[parseCurrency(r.currency) ?? "INR"] += r.amountInPaise;
  return out;
}

/** "₹12,340 + $58" — each currency in its own symbol, zero ones dropped. */
export function formatMoneyTotals(totals: Partial<Record<Currency, number>>): string {
  const parts = (["INR", "USD"] as const)
    .filter((c) => (totals[c] ?? 0) !== 0)
    .map((c) => formatMoney(totals[c]!, c));
  return parts.length ? parts.join(" + ") : formatMoney(0, "INR");
}

/** Best-effort currency inference from a browser locale string (e.g.
 * navigator.language). No IP geolocation — a UI nicety only; checkout always
 * re-resolves currency server-side. */
export function inferCurrencyFromLocale(locale: string | undefined | null): Currency {
  if (!locale) return "INR";
  return locale.toLowerCase().includes("in") ? "INR" : "USD";
}
