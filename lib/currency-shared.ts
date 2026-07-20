// Client-safe currency helpers — no prisma import, safe to use from "use
// client" components. Server-side config (FX rate, USD price-book overrides)
// lives in lib/currency.ts; the client only ever consumes prices /api/plans
// already computed (DbPlan.usdPriceInCents), never computes FX itself.

export type Currency = "INR" | "USD";

export function formatMoney(minorUnits: number, currency: Currency): string {
  const major = minorUnits / 100;
  if (currency === "USD") {
    return `$${major.toLocaleString("en-US", { minimumFractionDigits: major % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${Math.round(major).toLocaleString("en-IN")}`;
}

/** Best-effort currency inference from a browser locale string (e.g.
 * navigator.language). No IP geolocation — a UI nicety only; checkout always
 * re-resolves currency server-side. */
export function inferCurrencyFromLocale(locale: string | undefined | null): Currency {
  if (!locale) return "INR";
  return locale.toLowerCase().includes("in") ? "INR" : "USD";
}
