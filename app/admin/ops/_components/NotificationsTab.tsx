"use client";

// Staff email notifications (lib/admin/signup-alerts.ts): what a new signup
// sends (nothing / a 09:00 IST daily summary / one email each), the instant
// money alerts (lib/admin/staff-alerts.ts), and who receives both. Its own
// snapshot (GET /api/admin/ops/notifications), not part of the ops poll:
// nothing here changes on its own.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/ui/Toast";
import type { Headers } from "./types";

type SignupMode = "off" | "instant" | "daily";

interface AlertSettings {
  signupMode: SignupMode;
  moneyAlerts: boolean;
  recipients: string[];
  mutedAdmins: string[];
}

interface NotificationsData {
  signup: AlertSettings;
  adminEmails: string[];
}

interface TestResult {
  to: string;
  status: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MODES: { value: SignupMode; label: string; hint: string }[] = [
  { value: "daily", label: "Daily summary", hint: "One email at 09:00 IST: yesterday's signups, who never started AutoClip, runs and payments." },
  { value: "instant", label: "Every signup", hint: "One email each time someone creates an account." },
  { value: "off", label: "Off", hint: "No signup email. New users are still listed in Admin → Users." },
];

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function NotificationsTab({ headers }: { headers: Headers }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AlertSettings>({ signupMode: "daily", moneyAlerts: true, recipients: [], mutedAdmins: [] });
  const [draft, setDraft] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-ops-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ops/notifications", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load notification settings");
      return (await res.json()) as NotificationsData;
    },
  });

  useEffect(() => {
    if (data) setForm(data.signup);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ops/notifications", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.issues?.[0]?.message ?? e.error ?? "Save failed");
      }
    },
    onSuccess: () => {
      showToast("Notification settings saved", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-ops-notifications"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ops/notifications/test", { method: "POST", headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Test email failed");
      return body.results as TestResult[];
    },
    onSuccess: (results) => {
      setTestResults(results);
      const failed = results.filter((r) => r.status !== "sent" && r.status !== "dev-logged").length;
      if (results.length === 0) showToast("No recipients to send to", "error");
      else if (failed > 0) showToast(`${failed} of ${results.length} test emails failed`, "error");
      else showToast(`Test email sent to ${results.length} address${results.length === 1 ? "" : "es"}`, "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (isError) {
    return (
      <Card shadow padding="md">
        <p className="text-sm text-error mb-3">Couldn&apos;t load notification settings.</p>
        <Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }
  if (isLoading || !data) return <div className="h-48 bg-surface-3 rounded-2xl animate-pulse" />;

  const saved = data.signup;
  const dirty =
    form.signupMode !== saved.signupMode ||
    form.moneyAlerts !== saved.moneyAlerts ||
    !sameList(form.recipients, saved.recipients) ||
    !sameList(form.mutedAdmins, saved.mutedAdmins);

  const adminSet = new Set(data.adminEmails.map((a) => a.toLowerCase()));
  const muted = new Set(form.mutedAdmins);
  const activeAdmins = data.adminEmails.filter((a) => !muted.has(a.toLowerCase()));
  const extras = form.recipients.filter((r) => !adminSet.has(r));
  const nobody = activeAdmins.length === 0 && extras.length === 0;

  function addRecipient() {
    const v = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) {
      showToast("Enter a valid email address", "error");
      return;
    }
    if (!form.recipients.includes(v)) setForm({ ...form, recipients: [...form.recipients, v] });
    setDraft("");
  }

  function setAdminMuted(email: string, mute: boolean) {
    const e = email.toLowerCase();
    setForm({ ...form, mutedAdmins: mute ? [...form.mutedAdmins, e] : form.mutedAdmins.filter((x) => x !== e) });
  }

  return (
    <Card shadow padding="md" className="max-w-2xl">
      <h2 className="text-sm font-bold text-fg mb-1">New signup emails</h2>
      <p className="text-xs text-fg-subtle mb-3">What staff get when someone creates an account, with email or with Google, on the web or in the app.</p>
      <div role="radiogroup" aria-label="New signup emails" className="grid gap-2 mb-5">
        {MODES.map((m) => {
          const on = form.signupMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setForm({ ...form, signupMode: m.value })}
              className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? "border-brand bg-surface-2" : "border-line hover:bg-surface-2"}`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full border ${on ? "border-brand bg-brand" : "border-line"}`} aria-hidden />
                <span className="text-sm font-semibold text-fg">{m.label}</span>
                {m.value === "daily" && <StatusBadge tone="neutral">Recommended</StatusBadge>}
              </span>
              <span className="block text-xs text-fg-subtle mt-0.5 ml-5">{m.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-sm font-bold text-fg flex-1">Instant money alerts</h2>
        <StatusBadge tone={form.moneyAlerts ? "success" : "neutral"}>{form.moneyAlerts ? "On" : "Off"}</StatusBadge>
        <Switch checked={form.moneyAlerts} onChange={(v: boolean) => setForm({ ...form, moneyAlerts: v })} label="Instant money alerts" />
      </div>
      <p className="text-xs text-fg-subtle mb-5">
        An email straight away for a user&apos;s first payment, a failed renewal, a refund, a chargeback, or 3+ failed AutoClip runs in an hour.
      </p>

      <h3 className="text-xs font-semibold text-fg-muted mb-1">Recipients</h3>
      <p className="text-xs text-fg-subtle mb-2">Admin accounts get these unless unticked here. Add other addresses below.</p>
      <ul className="divide-y divide-line mb-3">
        {data.adminEmails.map((r) => (
          <li key={`admin:${r}`} className="flex items-center gap-3 py-2">
            <Checkbox
              checked={!muted.has(r.toLowerCase())}
              onChange={(v: boolean) => setAdminMuted(r, !v)}
              label={`Email ${r}`}
            />
            <span className="text-sm text-fg flex-1 break-all">{r}</span>
            <StatusBadge tone="neutral">{muted.has(r.toLowerCase()) ? "Muted" : "Admin account"}</StatusBadge>
          </li>
        ))}
        {extras.map((r) => (
          <li key={r} className="flex items-center gap-3 py-2">
            <span className="text-sm text-fg flex-1 break-all">{r}</span>
            <Button variant="link" className="text-error text-xs" onClick={() => setForm({ ...form, recipients: form.recipients.filter((x) => x !== r) })}>
              Remove
            </Button>
          </li>
        ))}
        {nobody && <li className="py-2 text-xs text-warning">Nobody will get these emails.</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addRecipient();
        }}
        className="flex gap-2 mb-4"
      >
        <label htmlFor="signup-alert-recipient" className="sr-only">Recipient email</label>
        <input
          id="signup-alert-recipient"
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="name@example.com"
          maxLength={200}
          className="flex-1 min-w-0 text-sm bg-surface-2 border border-line rounded-lg px-3 py-2 text-fg"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={form.recipients.length >= 20}>Add</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" size="sm" disabled={dirty || sendTest.isPending} onClick={() => sendTest.mutate()}>
          {sendTest.isPending ? "Sending…" : saved.signupMode === "instant" ? "Send test signup email" : "Send today's summary now"}
        </Button>
        {dirty && <span className="text-xs text-fg-subtle">Save your changes to send a test.</span>}
      </div>

      {testResults && (
        <ul className="mt-3 space-y-1">
          {testResults.map((r) => (
            <li key={r.to} className="flex items-center gap-2 text-xs">
              <StatusBadge tone={r.status === "sent" || r.status === "dev-logged" ? "success" : "error"}>
                {r.status === "sent" ? "Sent" : r.status === "dev-logged" ? "Logged (dev)" : r.status}
              </StatusBadge>
              <span className="text-fg break-all">{r.to}</span>
              {r.error && <span className="text-fg-subtle break-all">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
