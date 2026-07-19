// Language is now a real, working preference (see LanguageSwitcher) backed by
// User.preferredLanguage and the locale cookie i18n/request.ts reads.

import { getTranslations } from "next-intl/server";
import { Card } from "@/app/components/ui/Card";
import { LanguageSwitcher } from "@/app/components/settings/LanguageSwitcher";

function IcGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}

export default async function PreferencesPage() {
  const t = await getTranslations("SettingsPreferences");
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      <Card padding="none">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-tint-blue text-brand flex items-center justify-center flex-shrink-0"><IcGlobe /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t("language")}</p>
              <p className="text-xs text-ink-soft mt-0.5">{t("languageDesc")}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </Card>
    </div>
  );
}
