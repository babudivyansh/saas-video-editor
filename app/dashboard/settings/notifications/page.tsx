"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Switch } from "@/app/components/ui/Switch";
import { Skeleton } from "@/app/components/ui/Skeleton";

interface Preferences {
  marketingEmails: boolean;
  productUpdates: boolean;
  usageAlerts: boolean;
  creditAlerts: boolean;
  weeklySummary: boolean;
  featureReleases: boolean;
  newsletter: boolean;
}

export default function NotificationsSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsNotifications");
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const CATEGORIES: { key: keyof Preferences; label: string; desc: string }[] = [
    { key: "usageAlerts", label: t("categories.usageAlerts.label"), desc: t("categories.usageAlerts.desc") },
    { key: "creditAlerts", label: t("categories.creditAlerts.label"), desc: t("categories.creditAlerts.desc") },
    { key: "productUpdates", label: t("categories.productUpdates.label"), desc: t("categories.productUpdates.desc") },
    { key: "weeklySummary", label: t("categories.weeklySummary.label"), desc: t("categories.weeklySummary.desc") },
    { key: "featureReleases", label: t("categories.featureReleases.label"), desc: t("categories.featureReleases.desc") },
    { key: "marketingEmails", label: t("categories.marketingEmails.label"), desc: t("categories.marketingEmails.desc") },
    { key: "newsletter", label: t("categories.newsletter.label"), desc: t("categories.newsletter.desc") },
  ];

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/notification-preferences", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPrefs((await res.json()).preferences);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(key: keyof Preferences, value: boolean) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    setSaving(key);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) { setPrefs((p) => (p ? { ...p, [key]: !value } : p)); showToast(t("toasts.saveFailed"), "error"); }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      <Card padding="none">
        {!prefs ? (
          <div className="p-5 space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="divide-y divide-card-border">
            {CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.label}</p>
                  <p className="text-xs text-ink-soft mt-0.5">{c.desc}</p>
                </div>
                <Switch checked={prefs[c.key]} onChange={(v) => toggle(c.key, v)} disabled={saving === c.key} label={c.label} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
