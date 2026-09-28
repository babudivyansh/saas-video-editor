"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

interface SessionRow {
  sessionId: string;
  device: string;
  ip: string | null;
  country: string | null;
  createdAt: number;
  lastSeenAt: number;
  isCurrent: boolean;
}

interface LoginEventRow {
  id: string;
  ip: string | null;
  device: string | null;
  country: string | null;
  createdAt: string;
}

function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }
function IcDevice() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-ink-soft"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M8 21h8M12 15v6"/></svg>; }

export default function SessionsSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const t = useTranslations("SettingsSessions");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [history, setHistory] = useState<LoginEventRow[] | null>(null);
  const [terminating, setTerminating] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [sessRes, histRes] = await Promise.all([
      fetch("/api/auth/sessions", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/auth/login-history", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (sessRes.ok) setSessions((await sessRes.json()).sessions ?? []);
    if (histRes.ok) setHistory((await histRes.json()).events ?? []);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function terminateOne(sessionId: string) {
    setTerminating(sessionId);
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { showToast(t("toasts.sessionSignedOut")); await load(); }
      else showToast(t("toasts.signOutOneFailed"), "error");
    } finally {
      setTerminating(null);
    }
  }

  async function terminateAllOthers() {
    const res = await fetch("/api/auth/sessions", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { showToast(t("toasts.allOthersSignedOut")); await load(); }
    else showToast(t("toasts.signOutOthersFailed"), "error");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
        <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-ink">{t("activeSessions")}</h2>
          {sessions && sessions.length > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>{t("signOutAllOthers")}</Button>
          )}
        </div>
        {!sessions ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.sessionId} className="flex items-center gap-3 border border-card-border rounded-xl px-4 py-3">
                <IcDevice />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {s.device}
                    {s.isCurrent && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-tint-emerald px-1.5 py-0.5 rounded-full align-middle">{t("thisDevice")}</span>}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">{s.country ?? t("unknownLocation")}{s.ip ? ` · ${s.ip}` : ""} · {t("activeAgo", { relative: format.relativeTime(s.lastSeenAt, now) })}</p>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => terminateOne(s.sessionId)}
                    disabled={terminating === s.sessionId}
                    className="flex-shrink-0 text-xs font-semibold text-error hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {terminating === s.sessionId ? <IcSpinner /> : t("signOut")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="text-base font-extrabold text-ink mb-4">{t("recentSignIns")}</h2>
        {!history ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("noSignInHistory")}</p>
        ) : (
          <div className="divide-y divide-card-border">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-ink font-medium truncate">{h.device ?? t("unknownDevice")}</p>
                  <p className="text-xs text-ink-soft">{h.country ?? t("unknownLocation")}{h.ip ? ` · ${h.ip}` : ""}</p>
                </div>
                <span className="text-xs text-ink-soft/70 flex-shrink-0">{format.dateTime(new Date(h.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmAll}
        title={t("confirmSignOutAllTitle")}
        message={t("confirmSignOutAllMessage")}
        confirmLabel={t("confirmSignOutAllLabel")}
        danger
        onClose={() => setConfirmAll(false)}
        onConfirm={terminateAllOthers}
      />
    </div>
  );
}
