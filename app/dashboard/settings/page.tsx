"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { Card } from "@/app/components/ui/Card";
import { StatTile } from "@/app/components/ui/StatTile";
import { Skeleton } from "@/app/components/ui/Skeleton";

interface AssetStats { totalSize: number; count: number; usedBytes: number; limitBytes: number; tier: string }
interface TwoFaStatus { enabled: boolean }
interface LoginEventRow { id: string; device: string | null; country: string | null; createdAt: string }

function fmtSize(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function Meter({ label, pct, sublabel }: { label: string; pct: number; sublabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-ink-soft uppercase tracking-widest">{label}</span>
        <span className="text-xs font-semibold text-ink-soft">{sublabel}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? "bg-red-400" : "grad-brand"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function QuickAction({ href, onClick, label, desc }: { href?: string; onClick?: () => void; label: string; desc: string }) {
  const cls = "flex flex-col gap-1 rounded-2xl border border-card-border bg-white p-4 hover:border-violet-200 hover:shadow-card-hover transition-all text-left w-full";
  const body = (
    <>
      <p className="text-sm font-bold text-ink">{label}</p>
      <p className="text-xs text-ink-soft">{desc}</p>
    </>
  );
  // Billing opens an overlay rather than navigating.
  return onClick
    ? <button onClick={onClick} className={cls}>{body}</button>
    : <Link href={href!} className={cls}>{body}</Link>;
}

export default function SettingsGeneralPage() {
  const { user, token } = useAuth();
  const { openBilling } = useBillingOverlay();
  const t = useTranslations("SettingsGeneral");
  const locale = useLocale();
  const [assetStats, setAssetStats] = useState<AssetStats | null>(null);
  const [twoFa, setTwoFa] = useState<TwoFaStatus | null>(null);
  const [recentLogins, setRecentLogins] = useState<LoginEventRow[] | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [assetsRes, twoFaRes, historyRes] = await Promise.all([
      fetch("/api/assets?stats=true", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/auth/2fa/status", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/auth/login-history", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (assetsRes.ok) setAssetStats(await assetsRes.json());
    if (twoFaRes.ok) setTwoFa(await twoFaRes.json());
    if (historyRes.ok) setRecentLogins((await historyRes.json()).events?.slice(0, 3) ?? []);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const completenessChecks = [
    !!user?.name, !!user?.phone, !!user?.avatarUrl, !!user?.gender, !!user?.intendedUse, !!user?.emailVerifiedAt,
  ];
  const completenessPct = Math.round((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100);

  const securityChecks = [!!user?.emailVerifiedAt, !!twoFa?.enabled, !!user?.passwordChangedAt];
  const securityPct = Math.round((securityChecks.filter(Boolean).length / securityChecks.length) * 100);

  const storagePct = assetStats ? (assetStats.usedBytes / assetStats.limitBytes) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label={t("credits")} value={user?.credits ?? 0} accent="violet" />
        <StatTile label={t("plan")} value={user?.plan?.name ?? t("freePlanFallback")} accent="blue" />
        <StatTile label={t("filesStored")} value={assetStats?.count ?? "…"} accent="fuchsia" />
        <StatTile label={t("memberSince")} value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString(locale, { month: "short", year: "numeric" }) : "…"} accent="emerald" />
      </div>

      <Card padding="md" className="space-y-5">
        <h2 className="text-base font-extrabold text-ink">{t("accountHealth")}</h2>
        <Meter label={t("profileCompleteness")} pct={completenessPct} sublabel={`${completenessPct}%`} />
        <Meter label={t("securityScore")} pct={securityPct} sublabel={`${securityChecks.filter(Boolean).length}/${securityChecks.length}`} />
        {assetStats ? (
          <Meter label={t("storageUsed")} pct={storagePct} sublabel={`${fmtSize(assetStats.usedBytes)} / ${fmtSize(assetStats.limitBytes)}`} />
        ) : (
          <Skeleton className="h-8" />
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {!user?.emailVerifiedAt && <Link href="/dashboard/settings/security" className="text-xs font-semibold text-brand hover:underline">{t("verifyEmail")}</Link>}
          {!twoFa?.enabled && <Link href="/dashboard/settings/security" className="text-xs font-semibold text-brand hover:underline">{t("enable2fa")}</Link>}
        </div>
      </Card>

      <div>
        <h2 className="text-base font-extrabold text-ink mb-3">{t("quickActions")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickAction href="/dashboard/settings/profile" label={t("editProfile.label")} desc={t("editProfile.desc")} />
          <QuickAction href="/dashboard/settings/security" label={t("secureAccount.label")} desc={t("secureAccount.desc")} />
          <QuickAction href="/dashboard/settings/api-keys" label={t("manageApiKeys.label")} desc={t("manageApiKeys.desc")} />
          <QuickAction onClick={() => openBilling()} label={t("viewBilling.label")} desc={t("viewBilling.desc")} />
          <QuickAction href="/dashboard/profile/my-videos" label={t("myVideos.label")} desc={t("myVideos.desc")} />
        </div>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-ink">{t("recentSignIns")}</h2>
          <Link href="/dashboard/settings/sessions" className="text-xs font-semibold text-brand hover:underline">{t("viewAll")}</Link>
        </div>
        {!recentLogins ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : recentLogins.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("noSignInHistory")}</p>
        ) : (
          <div className="divide-y divide-card-border">
            {recentLogins.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span className="text-ink font-medium">{h.device ?? t("unknownDevice")} · {h.country ?? t("unknownLocation")}</span>
                <span className="text-xs text-ink-soft/70 flex-shrink-0">{new Date(h.createdAt).toLocaleDateString(locale)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
