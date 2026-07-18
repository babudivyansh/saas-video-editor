"use client";

import { useCallback, useEffect, useState } from "react";
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

const CATEGORIES: { key: keyof Preferences; label: string; desc: string }[] = [
  { key: "usageAlerts", label: "Usage Alerts", desc: "Low or zero credit balance warnings." },
  { key: "creditAlerts", label: "Billing & Credit Alerts", desc: "Subscription expiry, renewal, and unused-credit reminders." },
  { key: "productUpdates", label: "Product Updates", desc: "Onboarding tips and getting-started guidance." },
  { key: "weeklySummary", label: "Weekly Summary", desc: "Your Social Tracker performance digest." },
  { key: "featureReleases", label: "Feature Releases", desc: "New tools and features as they ship." },
  { key: "marketingEmails", label: "Re-engagement Emails", desc: "Occasional \"we miss you\" nudges if you've been away." },
  { key: "newsletter", label: "Newsletter", desc: "Tips, tutorials, and creator spotlights." },
];

export default function NotificationsSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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
      if (!res.ok) { setPrefs((p) => (p ? { ...p, [key]: !value } : p)); showToast("Failed to save", "error"); }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Notifications</h1>
        <p className="text-sm text-ink-soft mt-1">Choose which emails Clipiro sends you. Security alerts (new sign-ins, password changes) always send, regardless of these settings.</p>
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
