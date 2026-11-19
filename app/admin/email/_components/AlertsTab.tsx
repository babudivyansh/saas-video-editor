"use client";

// Open email-delivery alerts (deduped: a repeat bumps the count) and the most
// recently resolved ones. These are never emailed — see lib/email/router/alerts.ts.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { when, type EmailAlertRow, type EmailOverview, type Headers } from "./types";

const TONE = { info: "info", warning: "warning", critical: "error" } as const;

function Row({ a, onResolve, busy }: { a: EmailAlertRow; onResolve?: () => void; busy?: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 border-t border-line first:border-t-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge tone={TONE[a.severity]}>{a.severity}</StatusBadge>
          <code className="text-xs text-fg-subtle">{a.kind}</code>
          {a.count > 1 && <span className="text-xs text-fg-subtle">×{a.count}</span>}
        </div>
        <p className="text-sm text-fg mt-1">{a.message}</p>
        <p className="text-xs text-fg-subtle">
          First {when(a.firstAt)} · last {when(a.lastAt)}{a.resolvedAt ? ` · resolved ${when(a.resolvedAt)}` : ""}
        </p>
      </div>
      {onResolve && <Button size="sm" variant="secondary" loading={busy} onClick={onResolve}>Resolve</Button>}
    </li>
  );
}

export function AlertsTab({ data, headers }: { data: EmailOverview; headers: Headers }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/email/alerts/${id}`, { method: "POST", headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-email"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });
  return (
    <div className="space-y-4">
      <Card padding="md">
        <p className="text-sm font-semibold text-fg mb-1">Open alerts</p>
        {data.alerts.open.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing open.</p>
        ) : (
          <ul>{data.alerts.open.map((a) => (
            <Row key={a.id} a={a} busy={resolve.isPending && resolve.variables === a.id} onResolve={() => resolve.mutate(a.id)} />
          ))}</ul>
        )}
      </Card>
      {data.alerts.resolved.length > 0 && (
        <Card padding="md">
          <p className="text-sm font-semibold text-fg mb-1">Recently resolved</p>
          <ul>{data.alerts.resolved.map((a) => <Row key={a.id} a={a} />)}</ul>
        </Card>
      )}
      <p className="text-xs text-fg-subtle">
        Thresholds: quota warning at {data.settings.thresholds.warning}%, critical at {data.settings.thresholds.critical}% (EMAIL_QUOTA_WARNING_PERCENT /
        EMAIL_QUOTA_CRITICAL_PERCENT). Alerts reach admins as in-app notifications and Sentry — never by email, so an outage can&apos;t
        trigger a loop of failing alert emails.
      </p>
    </div>
  );
}
