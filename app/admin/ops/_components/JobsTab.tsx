"use client";

// Scheduled jobs: every entry of lib/cron-schedule.ts with its last outcome,
// and Run now / Pause / Resume. Danger-tier jobs (money, deletion, user email)
// need the job id typed to run — the server checks the same phrase.

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { jobState, postJson, type CronJobRow, type Headers, type OpsData } from "./types";

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

const STATE_BADGE = {
  ok: { tone: "success", label: "OK" },
  failing: { tone: "error", label: "Failing" },
  never: { tone: "warning", label: "Never ran" },
  paused: { tone: "neutral", label: "Paused" },
} as const;

type Filter = "all" | "attention" | "paused";

export function JobsTab({
  data,
  headers,
  pending,
  onStarted,
  refresh,
}: {
  data: OpsData;
  headers: Headers;
  /** runId → ISO time a manual run was started, until its result lands. */
  pending: Record<string, string>;
  onStarted: (runId: string, at: string) => void;
  refresh: () => void;
}) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [runTarget, setRunTarget] = useState<CronJobRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<CronJobRow | null>(null);

  const jobs = data.cronJobs.filter((j) => {
    const s = jobState(j);
    if (filter === "attention") return s === "failing" || s === "never";
    if (filter === "paused") return s === "paused";
    return true;
  });
  const attention = data.cronJobs.filter((j) => ["failing", "never"].includes(jobState(j))).length;
  const pausedCount = data.cronJobs.filter((j) => j.paused).length;
  const tickOk = data.cronTickAgeSeconds != null && data.cronTickAgeSeconds < 5 * 60;

  async function run(job: CronJobRow, input: { phrase: string; reason: string }) {
    try {
      const res = (await postJson("/api/admin/ops/cron/run", headers, {
        path: job.path,
        ...(job.confirmPhrase ? { confirmPhrase: input.phrase } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      })) as { at: string };
      onStarted(job.runId, res.at);
      showToast(`${job.label} started — the result appears here when it finishes.`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function setPaused(job: CronJobRow, paused: boolean, reason?: string) {
    try {
      await postJson("/api/admin/ops/cron/pause", headers, { path: job.path, paused, ...(reason ? { reason } : {}) });
      showToast(paused ? `${job.label} paused` : `${job.label} resumed`, "success");
      refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card shadow padding="md">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={tickOk ? "success" : "error"}>{tickOk ? "Scheduler running" : "Scheduler not running"}</StatusBadge>
          <p className="text-xs text-fg-subtle flex-1 min-w-[12rem]">
            {data.cronTickLastAt
              ? `Last /api/cron-tick call ${when(data.cronTickLastAt)}.`
              : "/api/cron-tick has never been called — no scheduled job runs until an external scheduler (cron-job.org) calls it every minute."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Filter jobs">
          {([
            ["all", `All (${data.cronJobs.length})`],
            ["attention", `Needs attention (${attention})`],
            ["paused", `Paused (${pausedCount})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`text-xs font-semibold rounded-full border px-3 py-1.5 min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                filter === id ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <ul className="space-y-2">
        {jobs.map((j) => {
          const state = jobState(j);
          const badge = STATE_BADGE[state];
          const running = !!pending[j.runId];
          return (
            <li key={j.path}>
              <Card padding="md">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-fg">{j.label}</h3>
                      {running ? <StatusBadge tone="info">Running…</StatusBadge> : <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                      {j.tier === "danger" && <StatusBadge tone="warning">Typed confirm</StatusBadge>}
                      {!j.secretConfigured && <StatusBadge tone="error">{j.secretEnv} not set</StatusBadge>}
                    </div>
                    <p className="text-xs text-fg-muted mt-1">{j.description}</p>
                    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[11px]">
                      <div><dt className="text-fg-subtle">Schedule</dt><dd className="text-fg font-mono">{j.scheduleText}</dd></div>
                      <div><dt className="text-fg-subtle">Next due</dt><dd className="text-fg">{j.paused ? "paused" : when(j.nextDueAt)}</dd></div>
                      <div><dt className="text-fg-subtle">Last success</dt><dd className="text-fg">{when(j.status?.lastSuccessAt)}</dd></div>
                      <div><dt className="text-fg-subtle">Last failure</dt><dd className={j.status?.failing ? "text-error" : "text-fg"}>{when(j.status?.lastFailureAt)}</dd></div>
                    </dl>
                    {j.status?.failing && j.status.lastError && (
                      <p className="mt-2 text-[11px] text-error font-mono break-all bg-error/5 border border-error/20 rounded-lg px-2 py-1">{j.status.lastError}</p>
                    )}
                    {(j.paused || j.lastManual) && (
                      <p className="mt-1.5 text-[11px] text-fg-subtle">
                        {j.paused && <>Paused by {j.paused.by} {when(j.paused.at)}{j.paused.reason ? ` — “${j.paused.reason}”` : ""}. </>}
                        {j.lastManual && <>Last run by hand: {j.lastManual.by}, {when(j.lastManual.at)}.</>}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-fg-subtle font-mono break-all">{j.path}</p>
                  </div>
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <Button size="sm" variant={j.tier === "danger" ? "danger" : "primary"} loading={running} disabled={!j.secretConfigured} onClick={() => setRunTarget(j)}>
                      Run now
                    </Button>
                    {j.paused ? (
                      <Button size="sm" variant="secondary" onClick={() => setPaused(j, false)}>Resume</Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setPauseTarget(j)}>Pause</Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
        {jobs.length === 0 && <li className="text-sm text-fg-subtle px-1">Nothing here.</li>}
      </ul>

      <ConfirmDialog
        open={!!runTarget}
        title={`Run “${runTarget?.label ?? ""}” now`}
        message={
          runTarget?.tier === "danger"
            ? `${runTarget.description} This runs for real, against production data.`
            : `${runTarget?.description ?? ""} It runs in the background; the result shows on this page.`
        }
        confirmLabel="Run now"
        danger={runTarget?.tier === "danger"}
        confirmPhrase={runTarget?.confirmPhrase ?? undefined}
        requireReason={runTarget?.tier === "danger"}
        onConfirm={(input) => (runTarget ? run(runTarget, input) : undefined)}
        onClose={() => setRunTarget(null)}
      />
      <ConfirmDialog
        open={!!pauseTarget}
        title={`Pause “${pauseTarget?.label ?? ""}”`}
        message="The scheduler will skip this job until you resume it. Runs it misses are not replayed. Run now still works while paused."
        confirmLabel="Pause"
        requireReason
        onConfirm={({ reason }) => (pauseTarget ? setPaused(pauseTarget, true, reason) : undefined)}
        onClose={() => setPauseTarget(null)}
      />

      <EmptyDraftSweep headers={headers} />
    </div>
  );
}

interface SweepResult {
  dryRun: boolean;
  matched: number;
  deleted: number;
  usersAffected: number;
  sample: Array<{ id: string; title: string; productType: string; updatedAt: string }>;
}

// Manual-only task: it deletes user-owned rows, so it has no schedule.
function EmptyDraftSweep({ headers }: { headers: Headers }) {
  const { showToast } = useToast();
  const [preview, setPreview] = useState<SweepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = (await postJson("/api/admin/ops/run-empty-draft-sweep", headers, body)) as SweepResult;
      setPreview(r);
      if (!r.dryRun) showToast(`Deleted ${r.deleted} empty draft(s).`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card shadow padding="md">
      <h2 className="text-sm font-bold text-fg">Manual task: empty-draft clean-up</h2>
      <p className="text-xs text-fg-subtle mt-1 mb-3">
        Deletes empty draft projects the app created on users&apos; behalf (older than 7 days). Preview first — nothing is deleted until you confirm.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => call({ dryRun: true })}>Preview</Button>
        {preview?.dryRun && preview.matched > 0 && (
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>Delete {preview.matched}</Button>
        )}
      </div>
      {preview && (
        <div className="mt-3 text-xs text-fg-muted">
          <p>
            {preview.dryRun
              ? `${preview.matched} empty draft(s) across ${preview.usersAffected} user(s) would be deleted.`
              : `Deleted ${preview.deleted} of ${preview.matched}.`}
          </p>
          {preview.dryRun && preview.sample.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-fg-subtle">
              {preview.sample.map((s) => <li key={s.id}>{s.id} · {s.productType} · {s.title || "(untitled)"}</li>)}
            </ul>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Delete empty drafts"
        message={`Permanently delete ${preview?.matched ?? 0} empty draft project(s)?`}
        confirmLabel="Delete"
        danger
        confirmPhrase="DELETE"
        onConfirm={({ phrase }) => call({ dryRun: false, confirmPhrase: phrase })}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
