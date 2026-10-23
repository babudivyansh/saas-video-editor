"use client";

// Staff email notifications — today the "new signup" email
// (lib/admin/signup-alerts.ts). Its own snapshot (GET /api/admin/ops/notifications),
// not part of the ops poll: nothing here changes on its own.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/ui/Toast";
import type { Headers } from "./types";

interface NotificationsData {
  signup: { enabled: boolean; recipients: string[] };
  adminEmails: string[];
}

interface TestResult {
  to: string;
  status: string;
  error?: string;
}

const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NotificationsTab({ headers }: { headers: Headers }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
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
    if (!data) return;
    setEnabled(data.signup.enabled);
    setRecipients(data.signup.recipients);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ops/notifications", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ enabled, recipients }),
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

  const dirty =
    enabled !== data.signup.enabled ||
    recipients.length !== data.signup.recipients.length ||
    recipients.some((r, i) => r !== data.signup.recipients[i]);

  const adminSet = new Set(data.adminEmails.map((a) => a.toLowerCase()));

  function addRecipient() {
    const v = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) {
      showToast("Enter a valid email address", "error");
      return;
    }
    if (!recipients.includes(v)) setRecipients([...recipients, v]);
    setDraft("");
  }

  return (
    <Card shadow padding="md" className="max-w-2xl">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-sm font-bold text-fg flex-1">New signup emails</h2>
        <StatusBadge tone={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</StatusBadge>
        <Switch checked={enabled} onChange={(v: boolean) => setEnabled(v)} label="Email admins on every new signup" />
      </div>
      <p className="text-xs text-fg-subtle mb-4">
        Sends an email every time someone creates an account, with email or with Google, on the web or in the app.
      </p>

      <h3 className="text-xs font-semibold text-fg-muted mb-1">Recipients</h3>
      <p className="text-xs text-fg-subtle mb-2">
        Every admin account always gets it. Add more addresses below to send it to them as well.
      </p>
      <ul className="divide-y divide-line mb-3">
        {data.adminEmails.map((r) => (
          <li key={`admin:${r}`} className="flex items-center gap-3 py-2">
            <span className="text-sm text-fg flex-1 break-all">{r}</span>
            <StatusBadge tone="neutral">Admin account</StatusBadge>
          </li>
        ))}
        {recipients
          .filter((r) => !adminSet.has(r))
          .map((r) => (
            <li key={r} className="flex items-center gap-3 py-2">
              <span className="text-sm text-fg flex-1 break-all">{r}</span>
              <Button variant="link" className="text-error text-xs" onClick={() => setRecipients(recipients.filter((x) => x !== r))}>
                Remove
              </Button>
            </li>
          ))}
        {data.adminEmails.length === 0 && recipients.length === 0 && (
          <li className="py-2 text-xs text-warning">No admin accounts and no extra addresses: nobody will get this email.</li>
        )}
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
        <Button type="submit" variant="secondary" size="sm" disabled={recipients.length >= 20}>Add</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={dirty || sendTest.isPending}
          onClick={() => sendTest.mutate()}
        >
          {sendTest.isPending ? "Sending…" : "Send test email"}
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
