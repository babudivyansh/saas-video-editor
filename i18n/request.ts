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

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
