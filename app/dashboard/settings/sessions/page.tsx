"use client";

import { useCallback, useEffect, useState } from "react";
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

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }
function IcDevice() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-ink-soft"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M8 21h8M12 15v6"/></svg>; }

export default function SessionsSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
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
      if (res.ok) { showToast("Session signed out"); await load(); }
      else showToast("Failed to sign out that session", "error");
    } finally {
      setTerminating(null);
    }
  }

  async function terminateAllOthers() {
    const res = await fetch("/api/auth/sessions", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { showToast("Every other device has been signed out"); await load(); }
    else showToast("Failed to sign out other sessions", "error");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Sessions</h1>
        <p className="text-sm text-ink-soft mt-1">Devices currently signed in, and your recent sign-in history.</p>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-ink">Active sessions</h2>
          {sessions && sessions.length > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>Sign out all other devices</Button>
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
                    {s.isCurrent && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-tint-emerald px-1.5 py-0.5 rounded-full align-middle">This device</span>}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">{s.country ?? "Unknown location"}{s.ip ? ` · ${s.ip}` : ""} · Active {fmtRelative(s.lastSeenAt)}</p>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => terminateOne(s.sessionId)}
                    disabled={terminating === s.sessionId}
                    className="flex-shrink-0 text-xs font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {terminating === s.sessionId ? <IcSpinner /> : "Sign out"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="text-base font-extrabold text-ink mb-4">Recent sign-ins</h2>
        {!history ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink-soft">No sign-in history yet.</p>
        ) : (
          <div className="divide-y divide-card-border">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-ink font-medium truncate">{h.device ?? "Unknown device"}</p>
                  <p className="text-xs text-ink-soft">{h.country ?? "Unknown location"}{h.ip ? ` · ${h.ip}` : ""}</p>
                </div>
                <span className="text-xs text-ink-soft/70 flex-shrink-0">{new Date(h.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmAll}
        title="Sign out all other devices?"
        message="Every session except this one will be signed out immediately."
        confirmLabel="Sign out all"
        danger
        onClose={() => setConfirmAll(false)}
        onConfirm={terminateAllOthers}
      />
    </div>
  );
}
