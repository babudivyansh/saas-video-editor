import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale } from "@/lib/i18n-locales";

// Locale is resolved from a cookie (mirroring User.preferredLanguage — see
// lib/login-tail.ts and app/api/auth/profile/route.ts, which are what keep
// the cookie in sync) rather than a [locale] URL segment. This app has no
// SEO need for locale-prefixed URLs on authenticated-only routes, and a
// cookie avoids restructuring all of app/ under app/[locale]/.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = raw && isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;

  // English underneath every other locale.
  //
  // next-intl does no fallback of its own: a key missing from the active
  // locale's file THROWS, so shipping a new string means editing all thirteen
  // files in the same commit or breaking twelve locales. That has been enough
  // friction to keep strings hardcoded in English in components instead —
  // AlertStrip did exactly that — which is the worse outcome of the two.
  //
  // A missing key now renders in English, which is what a user would rather
  // see than an error page. Untranslated strings are found by diffing the
  // files, not by a locale crashing.
  const english = (await import(`../messages/${DEFAULT_LOCALE}.json`)).default;
  const messages =
    locale === DEFAULT_LOCALE
      ? english
      : deepMerge(english, (await import(`../messages/${locale}.json`)).default);

  return { locale, messages };
});

type Messages = { [key: string]: string | Messages };

/**
 * Deep, not shallow.
 *
 * A shallow spread replaces whole namespaces, so a locale that translates
 * three of a namespace's four keys would still throw on the fourth — which is
 * the common case, not an edge one. Merging key by key means a locale can be
 * translated incrementally and every gap falls back to English on its own.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      existing && typeof existing === "object" && value && typeof value === "object"
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}
