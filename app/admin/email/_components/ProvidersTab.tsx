"use client";

// One card per provider, in routing order, plus the controls: enable/disable,
// reorder, quota limits, connectivity test, clear a suspension, and the
// global "pause non-critical email" switch. Credentials are never shown —
// the card only says whether they are configured.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/ui/Toast";
import {
  PROVIDER_LABEL, STATUS_LABEL, statusTone, when, type EmailOverview, type Headers, type ProviderCard, type ProviderName,
} from "./types";

async function send(url: string, method: string, headers: Headers, body?: unknown) {
  const res = await fetch(url, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.issues?.[0]?.message ?? json.error ?? "Request failed");
  return json;
}

function QuotaBar({ label, u }: { label: string; u: ProviderCard["daily"] }) {
  const pct = u.pct ?? 0;
  const color = u.exhausted || pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "bg-primary";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-fg-muted">{label}</span>
        <span className="text-fg tabular-nums">
          {u.used.toLocaleString()} / {u.limit == null ? "no limit set" : u.limit.toLocaleString()}
          {u.remaining != null && <span className="text-fg-subtle"> · {u.remaining.toLocaleString()} left (est.)</span>}
        </span>
      </div>
      {u.limit != null && (
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} quota used`}>
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function LimitEditor({ p, headers, onSaved }: { p: ProviderCard; headers: Headers; onSaved: () => void }) {
  const { showToast } = useToast();
  const [daily, setDaily] = useState(p.daily.limit?.toString() ?? "");
  const [monthly, setMonthly] = useState(p.monthly.limit?.toString() ?? "");
  const toLimit = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));
  const save = useMutation({
    mutationFn: () => send(`/api/admin/email/providers/${p.provider}`, "PATCH", headers, { dailyLimit: toLimit(daily), monthlyLimit: toLimit(monthly) }),
    onSuccess: () => { showToast("Limits saved", "success"); onSaved(); },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-fg-muted">
        Daily limit
        <input type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="none"
          className="mt-1 block w-28 rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm text-fg" />
      </label>
      <label className="text-xs text-fg-muted">
        Monthly limit
        <input type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="none"
          className="mt-1 block w-28 rounded-lg bg-surface-2 border border-line px-2 py-1.5 text-sm text-fg" />
      </label>
      <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>Save limits</Button>
    </div>
  );
}

export function ProvidersTab({ data, headers }: { data: EmailOverview; headers: Headers }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-email"] });
  const order = [...data.providers].sort((a, b) => a.priority - b.priority);

  const toggle = useMutation({
    mutationFn: ({ provider, enabled }: { provider: ProviderName; enabled: boolean }) =>
      send(`/api/admin/email/providers/${provider}`, "PATCH", headers, { enabled }),
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const reorder = useMutation({
    mutationFn: (priority: ProviderName[]) => send("/api/admin/email/settings", "PATCH", headers, { priority }),
    onSuccess: () => { showToast("Priority order saved", "success"); refresh(); },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const pause = useMutation({
    mutationFn: (pauseNoncritical: boolean) => send("/api/admin/email/settings", "PATCH", headers, { pauseNoncritical }),
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const test = useMutation({
    mutationFn: (provider: ProviderName) => send(`/api/admin/email/providers/${provider}/test`, "POST", headers),
    onSuccess: (r: { ok: boolean; senderVerified: boolean | null; code: string | null; message: string | null }, provider) => {
      const sender = r.senderVerified === true ? "sender verified" : r.senderVerified === false ? "SENDER NOT VERIFIED" : "sender status unknown";
      showToast(r.ok ? `${PROVIDER_LABEL[provider]}: credentials OK, ${sender}` : `${PROVIDER_LABEL[provider]}: ${r.code} — ${r.message}`, r.ok && r.senderVerified !== false ? "success" : "error");
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const clear = useMutation({
    mutationFn: ({ provider, reason }: { provider: ProviderName; reason: string }) =>
      send(`/api/admin/email/providers/${provider}`, "PATCH", headers, { clearSuspension: true, reason }),
    onSuccess: () => { showToast("Suspension cleared", "success"); refresh(); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const move = (i: number, dir: -1 | 1) => {
    const next = order.map((p) => p.provider);
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    reorder.mutate(next);
  };

  return (
    <div className="space-y-4">
      {!data.settings.routerEnabled && (
        <p className="text-sm font-semibold text-warning bg-warning/10 border border-warning/30 rounded-lg px-4 py-2">
          The multi-provider router is OFF (EMAIL_ROUTER_ENABLED is not &quot;true&quot;). Email is going out the old way — Resend, then SMTP.
          Settings here are saved and take effect once it is turned on.
        </p>
      )}

      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">Pause non-critical email</p>
            <p className="text-xs text-fg-subtle max-w-xl">
              Welcome, clip-ready, onboarding and marketing mail is held and retried later. Sign-in codes, password resets,
              security alerts and billing email keep sending.
            </p>
          </div>
          <Switch checked={data.settings.pauseNoncritical} onChange={(v) => pause.mutate(v)} label="Pause non-critical email" disabled={pause.isPending} />
        </div>
        {!data.settings.fallbackEnabled && (
          <p className="mt-3 text-xs text-warning">Fallback is off (EMAIL_FALLBACK_ENABLED=false): only one provider is tried per email.</p>
        )}
      </Card>

      {order.map((p, i) => (
        <Card key={p.provider} padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${PROVIDER_LABEL[p.provider]} up`} disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)} className="text-fg-subtle hover:text-fg disabled:opacity-30"><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Move ${PROVIDER_LABEL[p.provider]} down`} disabled={i === order.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)} className="text-fg-subtle hover:text-fg disabled:opacity-30"><ArrowDown size={14} /></button>
              </div>
              <div>
                <p className="text-base font-bold text-fg">
                  <span className="text-fg-subtle mr-1.5">{i + 1}.</span>{PROVIDER_LABEL[p.provider]}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <StatusBadge tone={statusTone(p.status)}>{STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
                  {p.configured && <StatusBadge tone="neutral">Credentials set</StatusBadge>}
                  {p.senderVerified === false && <StatusBadge tone="error">Sender not verified</StatusBadge>}
                  {p.senderVerified === true && <StatusBadge tone="success">Sender verified</StatusBadge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" loading={test.isPending && test.variables === p.provider} disabled={!p.configured}
                onClick={() => test.mutate(p.provider)}>Test connection</Button>
              <Switch checked={p.enabled} onChange={(enabled) => toggle.mutate({ provider: p.provider, enabled })} label={`${PROVIDER_LABEL[p.provider]} enabled`} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-3">
              <QuotaBar label="Today" u={p.daily} />
              <QuotaBar label="This month" u={p.monthly} />
              {p.reportedRemaining != null && (
                <p className="text-xs text-fg-subtle">Provider reports {p.reportedRemaining.toLocaleString()} credits left ({when(p.reportedAt)})</p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-subtle">Last success</dt><dd className="text-fg">{when(p.lastSuccessAt)}</dd>
              <dt className="text-fg-subtle">Last failure</dt><dd className="text-fg">{when(p.lastFailureAt)}</dd>
              <dt className="text-fg-subtle">Last check</dt><dd className="text-fg">{when(p.lastCheckedAt)}</dd>
              {p.circuitBreakerUntil && new Date(p.circuitBreakerUntil) > new Date() && (
                <><dt className="text-fg-subtle">Skipped until</dt><dd className="text-fg">{when(p.circuitBreakerUntil)}</dd></>
              )}
              {p.lastErrorCode && (
                <><dt className="text-fg-subtle">Last error</dt><dd className="text-error break-words"><code>{p.lastErrorCode}</code>{p.lastErrorMessage ? ` — ${p.lastErrorMessage}` : ""}</dd></>
              )}
            </dl>
          </div>

          <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-end justify-between gap-3">
            <LimitEditor key={`${p.daily.limit}-${p.monthly.limit}`} p={p} headers={headers} onSaved={refresh} />
            {p.healthStatus === "suspended" && (
              <Button size="sm" variant="danger" loading={clear.isPending} onClick={() => {
                const reason = window.prompt(`Only clear this after ${PROVIDER_LABEL[p.provider]} has lifted the suspension. How was it resolved?`);
                if (reason && reason.trim().length >= 5) clear.mutate({ provider: p.provider, reason: reason.trim() });
              }}>Clear suspension…</Button>
            )}
          </div>
        </Card>
      ))}
      <p className="text-xs text-fg-subtle">
        Usage is counted by Clipiro as it reserves each send, so it is an estimate of what the provider has counted. Daily limits
        reset at 00:00 UTC; 10% of each daily limit is held back for sign-in codes and password resets.
      </p>
    </div>
  );
}
