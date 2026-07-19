// No in-app messaging/notifications system exists yet — an honest empty state
// rather than inventing a fake feed. If a cheap real signal is added later
// (e.g. "plan expires soon", "payment received" derived from existing fields),
// it belongs here.

import { getTranslations } from "next-intl/server";
import { Card } from "@/app/components/ui/Card";
import { EmptyState } from "@/app/components/ui/EmptyState";

function IcMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  );
}

export default async function MessagesPage() {
  const t = await getTranslations("SettingsMessages");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
      <Card className="py-12">
        <EmptyState
          icon={<IcMessage />}
          title={t("noMessagesYet")}
          subtitle={t("subtitle")}
        />
      </Card>
    </div>
  );
}
