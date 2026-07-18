"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
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

function QuickAction({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-2xl border border-card-border bg-white p-4 hover:border-violet-200 hover:shadow-card-hover transition-all">
      <p className="text-sm font-bold text-ink">{label}</p>
      <p className="text-xs text-ink-soft">{desc}</p>
    </Link>
  );
}

export default function SettingsGeneralPage() {
  const { user, token } = useAuth();
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
        <h1 className="text-2xl font-extrabold grad-text inline-block">Account overview</h1>
        <p className="text-sm text-ink-soft mt-1">Everything about your Clipiro account, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Credits" value={user?.credits ?? 0} accent="violet" />
        <StatTile label="Plan" value={user?.plan?.name ?? "Free"} accent="blue" />
        <StatTile label="Files stored" value={assetStats?.count ?? "…"} accent="fuchsia" />
        <StatTile label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "…"} accent="emerald" />
      </div>

      <Card padding="md" className="space-y-5">
        <h2 className="text-base font-extrabold text-ink">Account health</h2>
        <Meter label="Profile completeness" pct={completenessPct} sublabel={`${completenessPct}%`} />
        <Meter label="Security score" pct={securityPct} sublabel={`${securityChecks.filter(Boolean).length}/${securityChecks.length}`} />
        {assetStats ? (
          <Meter label="Storage used" pct={storagePct} sublabel={`${fmtSize(assetStats.usedBytes)} / ${fmtSize(assetStats.limitBytes)}`} />
        ) : (
          <Skeleton className="h-8" />
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {!user?.emailVerifiedAt && <Link href="/dashboard/settings/security" className="text-xs font-semibold text-brand hover:underline">Verify your email →</Link>}
          {!twoFa?.enabled && <Link href="/dashboard/settings/security" className="text-xs font-semibold text-brand hover:underline">Enable two-factor authentication →</Link>}
        </div>
      </Card>

      <div>
        <h2 className="text-base font-extrabold text-ink mb-3">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickAction href="/dashboard/settings/profile" label="Edit profile" desc="Name, avatar, and preferences" />
          <QuickAction href="/dashboard/settings/security" label="Secure your account" desc="Password, email, and 2FA" />
          <QuickAction href="/dashboard/settings/api-keys" label="Manage API keys" desc="For the public API" />
          <QuickAction href="/billing" label="View billing" desc="Plan, credits, and invoices" />
        </div>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-ink">Recent sign-ins</h2>
          <Link href="/dashboard/settings/sessions" className="text-xs font-semibold text-brand hover:underline">View all →</Link>
        </div>
        {!recentLogins ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : recentLogins.length === 0 ? (
          <p className="text-sm text-ink-soft">No sign-in history yet.</p>
        ) : (
          <div className="divide-y divide-card-border">
            {recentLogins.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span className="text-ink font-medium">{h.device ?? "Unknown device"} · {h.country ?? "Unknown location"}</span>
                <span className="text-xs text-ink-soft/70 flex-shrink-0">{new Date(h.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
