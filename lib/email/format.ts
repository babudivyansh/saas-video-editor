// Locale-aware formatting for email bodies.
//
// The old templates hardcoded `toLocaleDateString("en-IN", …)` and a literal ₹
// in every money string, so a user in any of the other 12 locales the app ships
// got Indian formatting regardless. Copy stays English for now, but numbers and
// dates are the cheap half of localisation and there is no reason to hardcode
// them.
//
// Deliberately does not import lib/currency.ts: that module reaches lib/env,
// and the render layer has to stay env-free so templates can be unit-tested and
// previewed without a full environment. The conversion rules there apply to
// pricing pages; an email is reporting an amount that was already charged.

const DEFAULT_LOCALE = "en-IN";

/** Paise → "₹1,299". Amounts in email are always what was actually charged. */
export function formatPaise(paise: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));
}

/** Rupees as a number → "₹1,234.50". For affiliate commissions, which are rupees. */
export function formatRupees(amount: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** "3 August 2026" */
export function formatDate(date: Date, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** "3 August" — where the year is obvious from context. */
export function formatDateShort(date: Date, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date);
}

/** "12.4K" — compact counts for the social digest. */
export function formatCompact(n: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatCount(n: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** "1 credit" / "2 credits" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}

/** Greeting that degrades when we have no name — every template needs this. */
export function greet(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "there";
}
