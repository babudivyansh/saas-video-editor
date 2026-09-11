"use client";

// Create, review and delete goals.
//
// The model, both API routes, the progress maths and the GoalsStrip that
// displays them all shipped. There was no way to make one: a goal could only
// be created by hand-crafting a bearer-token POST, and GoalsStrip's "Manage"
// link pointed at a settings page containing no goal UI at all. This is that
// page.
//
// The metric picker is filtered by what the selected account can actually
// report. Offering an impressions goal on a YouTube channel would create a
// goal that can never be measured — GoalsStrip already has a "cannot be
// measured" branch for exactly that, and it should stay unreachable.

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FieldLabel, Input } from "@/app/components/ui/Field";
import { Panel } from "@/app/components/dashboard";
import type { MetricKey, Support } from "@/lib/social/capabilities";
import { SocialApiError, useSocialApi } from "./useSocialApi";

export interface GoalRow {
  id: string;
  accountId: string | null;
  metric: string;
  target: number;
  dueAt: string;
  status: string;
}

export interface GoalAccount {
  id: string;
  label: string;
  capabilities: Record<MetricKey, Support>;
}

export function GoalManager({
  accounts,
  initialGoals,
  metricLabels,
  maxGoals,
}: {
  accounts: GoalAccount[];
  initialGoals: GoalRow[];
  metricLabels: Record<string, string>;
  maxGoals: number;
}) {
  const api = useSocialApi();
  const [goals, setGoals] = useState(initialGoals);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [metric, setMetric] = useState<string>("");
  const [target, setTarget] = useState("");
  const [dueAt, setDueAt] = useState("");
  // Earliest pickable due date (tomorrow). Read once: Date.now() in the render
  // body is impure and fails the react-hooks/purity lint.
  const [minDueDate] = useState(() => new Date(Date.now() + 86400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GoalRow | null>(null);

  const selected = accounts.find((a) => a.id === accountId);

  // Only metrics this account reports. "all accounts" takes the union, since a
  // portfolio goal is measurable if any account can supply the number.
  const available = useMemo(() => {
    const pool = accountId ? (selected ? [selected] : []) : accounts;
    const keys = new Set<string>();
    for (const a of pool) {
      for (const [k, support] of Object.entries(a.capabilities)) {
        if (support !== "unavailable") keys.add(k);
      }
    }
    return [...keys].sort((a, b) => (metricLabels[a] ?? a).localeCompare(metricLabels[b] ?? b));
  }, [accountId, selected, accounts, metricLabels]);

  const atLimit = goals.filter((g) => g.status === "active").length >= maxGoals;

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ goal: GoalRow }>("/api/social/goals", {
        method: "POST",
        body: JSON.stringify({
          accountId: accountId || null,
          metric,
          target: Number(target),
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      setGoals((prev) => [...prev, data.goal]);
      setMetric("");
      setTarget("");
      setDueAt("");
    } catch (e) {
      setError(e instanceof SocialApiError ? e.message : "Couldn't create that goal.");
    } finally {
      setBusy(false);
    }
  }, [api, accountId, metric, target, dueAt]);

  const remove = useCallback(async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try {
      await api(`/api/social/goals/${id}`, { method: "DELETE" });
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      setError(e instanceof SocialApiError ? e.message : "Couldn't delete that goal.");
    }
  }, [api, deleting]);

  const canSubmit =
    !busy && !atLimit && metric !== "" && Number(target) > 0 && dueAt !== "" && new Date(dueAt) > new Date();

  return (
    <Panel title="Goals" subtitle={`${goals.filter((g) => g.status === "active").length} of ${maxGoals} active`}>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-tint-amber-border bg-tint-amber px-3 py-2 text-xs text-warning">
          {error}
        </p>
      )}

      {goals.length > 0 && (
        <ul className="mb-5 space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-fg">
                  {metricLabels[g.metric] ?? g.metric} → {g.target.toLocaleString()}
                </p>
                <p className="text-[11px] text-fg-subtle">
                  {g.accountId
                    ? (accounts.find((a) => a.id === g.accountId)?.label ?? "one account")
                    : "all accounts"}
                  {" · due "}
                  {new Date(g.dueAt).toLocaleDateString()}
                  {g.status !== "active" ? ` · ${g.status}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleting(g)}
                className="flex-shrink-0 cursor-pointer text-[11px] font-semibold text-error hover:underline"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void create();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="goal-account">Account</FieldLabel>
            <select
              id="goal-account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setMetric("");
              }}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
              <option value="">All accounts</option>
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="goal-metric">Metric</FieldLabel>
            <select
              id="goal-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">Choose a metric…</option>
              {available.map((m) => (
                <option key={m} value={m}>{metricLabels[m] ?? m}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="goal-target">Target</FieldLabel>
            <Input
              id="goal-target"
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="10000"
            />
          </div>

          <div>
            <FieldLabel htmlFor="goal-due">Due by</FieldLabel>
            <Input
              id="goal-due"
              type="date"
              value={dueAt}
              min={minDueDate}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
        </div>

        {atLimit ? (
          <p className="text-xs text-fg-subtle">
            You&rsquo;re tracking the maximum of {maxGoals} active goals. Delete one to add another.
          </p>
        ) : (
          <p className="text-[11px] text-fg-subtle">
            Progress is measured from where you are today, not from zero — so a target you are
            already close to reads as close.
          </p>
        )}

        <Button type="submit" size="sm" disabled={!canSubmit}>
          {busy ? "Saving…" : "Add goal"}
        </Button>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this goal?"
        message="Its progress history goes with it. You can create a new one at any time."
        confirmLabel="Delete goal"
        danger
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </Panel>
  );
}
