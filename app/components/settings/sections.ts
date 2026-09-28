// The Settings overlay's sections. Ids double as the `?settings=` URL value
// and as the old /dashboard/settings/<id> route slug ("general" was the bare
// /dashboard/settings), so every URL already in an inbox maps onto one.

export const SETTINGS_SECTIONS = [
  "general",
  "profile",
  "security",
  "sessions",
  "notifications",
  "api-keys",
  "messages",
  "preferences",
  "privacy",
  "danger-zone",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Unknown or empty values fall back to the overview rather than failing. */
export function parseSettingsSection(raw: string | null | undefined): SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(raw ?? "") ? (raw as SettingsSection) : "general";
}
