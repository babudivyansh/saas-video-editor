"use client";

// The top of the Audit Log: what happened in the selected window at a
// glance — volume, the risky kinds (critical / money / security), actions
// that should have a reason and don't, events per day by category — plus the
// integrity check for the whole log.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { StackedBars } from "../../dashboard/charts";
import { CATEGORY_LABEL, type AuditCategory, type AuditStats, type AuditVerifyResult } from "./types";

function Tile({ label, value, detail, tone, onClick }: { label: string; value: string; detail: string; tone?: "error" | "warning"; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-[11px] font-semibold text-fg-muted">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-fg"}`}>{value}</p>
      <p className="text-[11px] text-fg-subtle mt-0.5">{detail}</p>
    </>
  );
  const cls = "w-full text-left rounded-[var(--radius-card)] border border-line bg-surface-2 p-3.5";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function AuditOverview({
  headers,
  params,
  onPick,
}: {
  headers: () => Record<string, string>;
  params: string;
  /** Jump the filters to a slice (a tile or a list entry was clicked). */
  onPick: (patch: { severity?: string; missingReason?: boolean; actorType?: string; adminEmail?: string; category?: string; q?: string }) => void;
}) {
  const [verify, setVerify] = useState<AuditVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["admin-audit-stats", params],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit/stats?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load stats");
      return (await res.json()) as AuditStats;
    },
  });

  async function runVerify() {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/admin/audit/verify", { headers: headers() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Verification failed");
      setVerify(d as AuditVerifyResult);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  const s = stats.data;
  const categories = s ? (Object.keys(s.byCategory) as AuditCategory[]).sort((a, b) => (s.byCategory[b] ?? 0) - (s.byCategory[a] ?? 0)) : [];

  return (
    <div className="space-y-4 mb-5">
      {!s ? (
        <div className="h-24 bg-surface-3 rounded-2xl animate-pulse" />
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <li><Tile label="Events" value={s.total.toLocaleString()} detail={s.truncated ? "window capped — narrow it" : "in this window"} /></li>
          <li><Tile label="Critical" value={String(s.bySeverity.critical ?? 0)} detail="irreversible or platform-wide" tone={(s.bySeverity.critical ?? 0) > 0 ? "error" : undefined} onClick={() => onPick({ severity: "critical" })} /></li>
          <li><Tile label="Destructive" value={String(s.bySeverity.destructive ?? 0)} detail="removed or disabled something" onClick={() => onPick({ severity: "destructive" })} /></li>
          <li><Tile label="Money" value={String(s.bySeverity.money ?? 0)} detail="credits, plans, refunds, payouts" onClick={() => onPick({ severity: "money" })} /></li>
          <li><Tile label="Security" value={String(s.bySeverity.security ?? 0)} detail="sign-ins, 2FA, sessions" onClick={() => onPick({ severity: "security" })} /></li>
          <li><Tile label="Missing a reason" value={String(s.missingReason)} detail="should have said why" tone={s.missingReason > 0 ? "warning" : undefined} onClick={() => onPick({ missingReason: true })} /></li>
        </ul>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card shadow padding="md" className="xl:col-span-2">
          <h2 className="text-sm font-bold text-fg mb-3">Activity by day</h2>
          {s ? (
            <StackedBars
              data={s.days.map((d) => ({ ...d, date: d.day.slice(5) }))}
              series={categories.map((c) => ({ key: c, name: CATEGORY_LABEL[c] }))}
              height={180}
            />
          ) : (
            <div className="h-44 bg-surface-3 rounded-xl animate-pulse" />
          )}
        </Card>

        <Card shadow padding="md">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-fg flex-1">Integrity</h2>
            {verify && <StatusBadge tone={verify.ok ? "success" : "error"}>{verify.ok ? "Intact" : "Problems found"}</StatusBadge>}
          </div>
          <p className="text-xs text-fg-subtle mb-3">
            Every entry is chained to the one before it with a keyed hash. Verifying re-checks all of them: an edited entry, a deleted one, or deleted newest entries all show up here.
          </p>
          <Button size="sm" variant="secondary" loading={verifying} onClick={runVerify}>Verify now</Button>
          {verifyError && <p className="text-xs text-error mt-2">{verifyError}</p>}
          {verify && (
            <div className="mt-3 text-xs space-y-1">
              <p className="text-fg-muted">
                {verify.verifiedRows.toLocaleString()} verified · {verify.legacyRows.toLocaleString()} older (not verifiable) · checked {new Date(verify.checkedAt).toLocaleTimeString()}
              </p>
              {verify.chainStartedAt && <p className="text-fg-subtle">Chain since {new Date(verify.chainStartedAt).toLocaleString()}</p>}
              {verify.tampered.map((t) => (
                <p key={t.id} className="text-error">Edited after writing: {t.action} · {new Date(t.createdAt).toLocaleString()} <span className="font-mono">({t.id.slice(0, 8)})</span></p>
              ))}
              {verify.broken.map((b) => (
                <p key={b.id} className="text-error">{b.problem} Next entry: {b.action} · {new Date(b.createdAt).toLocaleString()}</p>
              ))}
              {verify.headMissing && <p className="text-error">The newest recorded entry is missing — entries were deleted from the end of the log.</p>}
            </div>
          )}
        </Card>
      </div>

      {s && (s.topActions.length > 0 || s.topActors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card shadow padding="md">
            <h2 className="text-sm font-bold text-fg mb-2">Most frequent actions</h2>
            <ul className="space-y-1.5">
              {s.topActions.map((a) => (
                <li key={a.action}>
                  <button type="button" onClick={() => onPick({ q: a.action })} className="w-full flex items-center gap-2 text-xs text-left hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
                    <span className="flex-1 truncate text-fg-muted">{a.label}</span>
                    <span className="font-semibold text-fg">{a.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card shadow padding="md">
            <h2 className="text-sm font-bold text-fg mb-2">Who acted</h2>
            <ul className="space-y-1.5">
              {s.topActors.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onPick({ adminEmail: a.email })} className="w-full flex items-center gap-2 text-xs text-left hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
                    <span className="flex-1 truncate text-fg-muted">{a.email}</span>
                    <StatusBadge tone="neutral">{a.type}</StatusBadge>
                    <span className="font-semibold text-fg w-10 text-right">{a.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
