"use client";

// Render queues, for either driver: every queue with its counts and worker
// liveness, then one queue's jobs by state with per-job Retry / Remove, a
// detail drawer (payload + error), and bulk actions. Destructive bulk actions
// (drain waiting, clean failed) need the queue name typed — checked
// server-side too.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Modal } from "@/app/components/ui/Modal";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { postJson, type Headers, type JobState, type OpsData, type QueueJob, type QueueSummary } from "./types";

const STATES: JobState[] = ["failed", "waiting", "active", "delayed", "completed"];

type BulkAction = "retry-all-failed" | "clean-failed" | "clean-completed" | "pause" | "resume" | "drain-waiting";

const BULK: Record<BulkAction, { label: string; message: (q: string) => string; danger?: boolean; typed?: boolean }> = {
  "retry-all-failed": { label: "Retry all failed", message: (q) => `Re-queue every failed job on ${q}? A job that charged credits may charge again if its handler doesn't check.` },
  "clean-failed": { label: "Clear failed", message: (q) => `Permanently discard every failed job on ${q}? They can't be retried afterwards.`, danger: true, typed: true },
  "clean-completed": { label: "Clear completed", message: (q) => `Discard the completed-job history on ${q}? Nothing is re-run.` },
  pause: { label: "Pause queue", message: (q) => `Stop ${q} from starting new jobs? The job running now finishes; new ones wait until you resume.` },
  resume: { label: "Resume queue", message: (q) => `Let ${q} start jobs again?` },
  "drain-waiting": { label: "Drain waiting", message: (q) => `Delete every WAITING job on ${q}? Those users' renders will never run and nothing is refunded automatically.`, danger: true, typed: true },
};

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");

export function QueuesTab({ data, headers, refresh }: { data: OpsData; headers: Headers; refresh: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const queues = data.queues ?? [];
  const current = queues.find((q) => q.name === selected) ?? null;

  return (
    <div className="space-y-4">
      <Card shadow padding="md">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="text-sm font-bold text-fg">Queues</h2>
          <StatusBadge tone={data.queueDriver === "bullmq" ? "info" : "warning"}>Driver: {data.queueDriver}</StatusBadge>
        </div>
        {data.queueDriver === "in-process" && (
          <p className="text-xs text-warning mb-3">
            In-process driver: jobs live in this server process&apos;s memory. They are lost on a restart or redeploy, and only the last 50 failures per queue are kept.
          </p>
        )}
        {data.queues === null ? (
          <p className="text-sm text-error">Redis is unreachable — BullMQ queue state can&apos;t be read.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                  <th className="font-semibold pb-2">Queue</th>
                  <th className="font-semibold pb-2 text-right">Waiting</th>
                  <th className="font-semibold pb-2 text-right">Active</th>
                  <th className="font-semibold pb-2 text-right">Delayed</th>
                  <th className="font-semibold pb-2 text-right">Failed</th>
                  <th className="font-semibold pb-2 text-right">Done</th>
                  <th className="sr-only">Open</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => {
                  const beat = data.heartbeats[q.name];
                  return (
                    <tr key={q.name} className={`border-t border-line ${selected === q.name ? "bg-brand/5" : ""}`}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${q.driver === "bullmq" ? (beat ? "bg-success" : "bg-line-strong") : q.started ? "bg-success" : "bg-line-strong"}`}
                            aria-label={q.driver === "bullmq" ? (beat ? "worker alive" : "no worker heartbeat") : q.started ? "started in this process" : "not started in this process"}
                          />
                          <span className="font-mono text-xs text-fg truncate">{q.name}</span>
                          {q.paused && <StatusBadge tone="warning">Paused</StatusBadge>}
                        </div>
                      </td>
                      <td className="py-2 text-right text-fg-muted">{q.counts.waiting}</td>
                      <td className="py-2 text-right text-fg-muted">{q.counts.active}</td>
                      <td className="py-2 text-right text-fg-muted">{q.counts.delayed}</td>
                      <td className={`py-2 text-right font-semibold ${q.counts.failed ? "text-error" : "text-fg-muted"}`}>{q.counts.failed}</td>
                      <td className="py-2 text-right text-fg-subtle">{q.counts.completed}</td>
                      <td className="py-2 pl-3 text-right">
                        <Button variant="link" className="text-brand text-xs" onClick={() => setSelected(selected === q.name ? null : q.name)}>
                          {selected === q.name ? "Close" : "Open"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {current && <QueueDetail key={current.name} queue={current} headers={headers} refresh={refresh} />}

      {!current && data.failedJobs.length > 0 && (
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-2">Recent failures across all queues</h2>
          <ul className="divide-y divide-line">
            {data.failedJobs.slice(0, 10).map((j) => (
              <li key={`${j.queueName}:${j.id}`} className="py-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelected(j.queueName)}
                  className="font-mono text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                >
                  {j.queueName}
                </button>
                <span className="font-mono text-fg-muted">{j.projectId ?? j.id}</span>
                <span className="text-fg-subtle truncate flex-1 min-w-[10rem]" title={j.error ?? undefined}>{j.error ?? "—"}</span>
                <span className="text-fg-subtle whitespace-nowrap">{when(j.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function QueueDetail({ queue, headers, refresh }: { queue: QueueSummary; headers: Headers; refresh: () => void }) {
  const { showToast } = useToast();
  const [state, setState] = useState<JobState>(queue.counts.failed > 0 ? "failed" : "waiting");
  const [view, setView] = useState<QueueJob | null>(null);
  const [jobAction, setJobAction] = useState<{ job: QueueJob; action: "retry" | "remove" } | null>(null);
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  const jobs = useQuery({
    queryKey: ["admin-queue-jobs", queue.name, state],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ops/queues/${encodeURIComponent(queue.name)}?state=${state}`, { headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load jobs");
      return ((await res.json()) as { jobs: QueueJob[] }).jobs;
    },
    refetchInterval: 10_000,
  });

  async function act(body: Record<string, unknown>, done: string) {
    try {
      const r = (await postJson(`/api/admin/ops/queues/${encodeURIComponent(queue.name)}`, headers, body)) as { affected: number };
      showToast(r.affected ? `${done} (${r.affected})` : done, "success");
      refresh();
      void jobs.refetch();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  const bulkButtons: BulkAction[] = [
    "retry-all-failed",
    "clean-failed",
    ...(queue.driver === "bullmq" ? (["clean-completed"] as const) : []),
    queue.paused ? "resume" : "pause",
    "drain-waiting",
  ];

  return (
    <Card shadow padding="md">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-fg font-mono">{queue.name}</h2>
        {queue.paused && <StatusBadge tone="warning">Paused</StatusBadge>}
        {!queue.started && <StatusBadge tone="neutral">Not started in this process</StatusBadge>}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {bulkButtons.map((b) => (
          <Button key={b} size="sm" variant={BULK[b].danger ? "danger" : "secondary"} onClick={() => setBulk(b)}>{BULK[b].label}</Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Job state">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={state === s}
            onClick={() => setState(s)}
            className={`text-xs font-semibold rounded-full border px-3 py-1.5 min-h-[32px] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              state === s ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
            }`}
          >
            {s} ({queue.counts[s]})
          </button>
        ))}
      </div>

      <div className="mt-3">
        {jobs.isError ? (
          <p className="text-sm text-error">{(jobs.error as Error).message}</p>
        ) : jobs.isLoading ? (
          <div className="h-24 bg-surface-3 rounded-xl animate-pulse" />
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-subtle">
            {queue.driver === "in-process" && (state === "completed" || state === "delayed")
              ? "The in-process driver keeps only a count of these, not the jobs."
              : `No ${state} jobs.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                  <th className="font-semibold pb-2">Project / job</th>
                  <th className="font-semibold pb-2">Error</th>
                  <th className="font-semibold pb-2 text-right">Attempts</th>
                  <th className="font-semibold pb-2 text-right">When</th>
                  <th className="font-semibold pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(jobs.data ?? []).map((j) => (
                  <tr key={j.id} className="border-t border-line">
                    <td className="py-2 font-mono text-xs text-fg-muted break-all">{j.projectId ?? j.id}</td>
                    <td className="py-2 text-xs text-fg-muted max-w-xs truncate" title={j.error ?? undefined}>{j.error ?? "—"}</td>
                    <td className="py-2 text-right text-fg-muted">{j.attempts}</td>
                    <td className="py-2 text-right text-xs text-fg-subtle whitespace-nowrap">{when(j.at)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="link" className="text-fg-muted mr-3" onClick={() => setView(j)}>View</Button>
                      {state === "failed" && (
                        <Button variant="link" className="text-brand mr-3" onClick={() => setJobAction({ job: j, action: "retry" })}>Retry</Button>
                      )}
                      {(state === "failed" || state === "waiting" || (queue.driver === "bullmq" && state !== "active")) && (
                        <Button variant="link" className="text-error" onClick={() => setJobAction({ job: j, action: "remove" })}>Remove</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Job ${view.projectId ?? view.id}` : ""} variant="drawer" maxWidth="max-w-xl">
        {view && (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-2 gap-2">
              <div><dt className="text-fg-subtle">Job id</dt><dd className="font-mono text-fg break-all">{view.id}</dd></div>
              <div><dt className="text-fg-subtle">State</dt><dd className="text-fg capitalize">{view.state}</dd></div>
              <div><dt className="text-fg-subtle">Attempts</dt><dd className="text-fg">{view.attempts}</dd></div>
              <div><dt className="text-fg-subtle">When</dt><dd className="text-fg">{when(view.at)}</dd></div>
            </dl>
            {view.error && (
              <div>
                <p className="font-semibold text-fg-muted mb-1">Error</p>
                <p className="font-mono text-error break-all bg-error/5 border border-error/20 rounded-lg p-2">{view.error}</p>
              </div>
            )}
            {view.stack && (
              <div>
                <p className="font-semibold text-fg-muted mb-1">Stack</p>
                <pre className="font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-all bg-surface-2 border border-line rounded-lg p-2 max-h-64 overflow-y-auto">{view.stack}</pre>
              </div>
            )}
            <div>
              <p className="font-semibold text-fg-muted mb-1">Payload (secrets redacted)</p>
              <pre className="font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-all bg-surface-2 border border-line rounded-lg p-2 max-h-80 overflow-y-auto">{view.data}</pre>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!jobAction}
        title={jobAction?.action === "retry" ? "Retry job" : "Remove job"}
        message={
          jobAction?.action === "retry"
            ? `Re-queue ${jobAction.job.projectId ?? jobAction.job.id} with fresh attempts?`
            : `Remove ${jobAction?.job.projectId ?? jobAction?.job.id ?? ""}? It won't run or be retried.`
        }
        confirmLabel={jobAction?.action === "retry" ? "Retry" : "Remove"}
        danger={jobAction?.action === "remove"}
        onConfirm={() =>
          jobAction ? act({ action: jobAction.action, jobId: jobAction.job.id }, jobAction.action === "retry" ? "Job re-queued" : "Job removed") : undefined
        }
        onClose={() => setJobAction(null)}
      />
      <ConfirmDialog
        open={!!bulk}
        title={bulk ? `${BULK[bulk].label}: ${queue.name}` : ""}
        message={bulk ? BULK[bulk].message(queue.name) : ""}
        confirmLabel={bulk ? BULK[bulk].label : ""}
        danger={bulk ? BULK[bulk].danger : false}
        confirmPhrase={bulk && BULK[bulk].typed ? queue.name : undefined}
        requireReason={bulk ? !!BULK[bulk].typed : false}
        onConfirm={({ phrase, reason }) =>
          bulk
            ? act(
                { action: bulk, ...(BULK[bulk].typed ? { confirmPhrase: phrase, reason } : {}) },
                BULK[bulk].label,
              )
            : undefined
        }
        onClose={() => setBulk(null)}
      />
    </Card>
  );
}
