// Single source of truth for supported UI languages — reused by the request
// config (i18n/request.ts), the profile PATCH validation, and the language
// switcher UI, so the list never drifts out of sync between them.

export const SUPPORTED_LOCALES = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिन्दी" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "bn", name: "বাংলা" },
  { code: "mr", name: "मराठी" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ar", name: "العربية" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";

export const LOCALE_COOKIE = "locale";

export function isSupportedLocale(value: string): value is LocaleCode {
  return SUPPORTED_LOCALES.some((l) => l.code === value);
}
