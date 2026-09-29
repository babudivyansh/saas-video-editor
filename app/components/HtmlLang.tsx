"use client";

// Keeps <html lang> in step with the UI language cookie, so screen readers
// pronounce the page in the language it is actually shown in (it was always
// "en"). Done client-side on purpose: reading the cookie in the root layout
// would opt every page — the static marketing pages included — into dynamic
// rendering.
//
// Only `lang`, not `dir`: most of the app's copy is still hardcoded English,
// so flipping the whole layout right-to-left for Arabic would make it worse,
// not better. RTL needs its own design pass once those surfaces are translated.

import { useEffect } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale } from "@/lib/i18n-locales";

export default function HtmlLang() {
  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    const value = raw ? decodeURIComponent(raw) : "";
    document.documentElement.lang = isSupportedLocale(value) ? value : DEFAULT_LOCALE;
  }, []);
  return null;
}
