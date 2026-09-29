"use client";

// Render queues: worker liveness, per-queue counts, and the failed-job
// dead-letter set with Retry / Remove.

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";
import { postJson, type FailedJob, type Headers, type OpsData } from "./types";

export function QueuesTab({ data, headers, refresh }: { data: OpsData; headers: Headers; refresh: () => void }) {
  const { showToast } = useToast();
  const [target, setTarget] = useState<{ job: FailedJob; action: "retry" | "remove" } | null>(null);

  async function act(job: FailedJob, action: "retry" | "remove") {
    try {
      await postJson("/api/admin/ops/jobs", headers, { jobId: job.id, action, queueName: job.queueName });
      showToast(action === "retry" ? "Job re-queued" : "Job removed", "success");
      refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card shadow padding="md">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-fg">Workers</h2>
          <StatusBadge tone={data.queueDriver === "bullmq" ? "info" : "warning"}>
            Driver: {data.queueDriver}
          </StatusBadge>
        </div>
        {data.queueDriver === "in-process" && (
          <p className="text-xs text-warning mb-3">
            In-process driver: jobs run inside the web process and are lost on a restart; there is no failed-job set to retry from.
          </p>
        )}
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {Object.entries(data.heartbeats).map(([name, beat]) => {
            const counts = data.queueCounts?.[name];
            return (
              <li key={name} className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${beat ? "bg-success" : "bg-line-strong"}`} aria-hidden />
                <span className="text-fg font-mono text-xs truncate">{name}</span>
                <span className="text-[11px] text-fg-subtle ml-auto whitespace-nowrap">
                  {counts ? `${counts.waiting ?? 0} waiting · ${counts.active ?? 0} active` : ""}
                  {counts?.failed ? <span className="text-error"> · {counts.failed} failed</span> : null}
                  {!beat && !counts ? "no heartbeat" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card shadow padding="md">
        <h2 className="text-sm font-bold text-fg mb-3">Failed jobs</h2>
        {data.failedJobs.length === 0 ? (
          <p className="text-sm text-fg-subtle">None — the dead-letter set is empty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                  <th className="font-semibold pb-2">Queue</th>
                  <th className="font-semibold pb-2">Project / job</th>
                  <th className="font-semibold pb-2">Reason</th>
                  <th className="font-semibold pb-2 text-right">Attempts</th>
                  <th className="font-semibold pb-2 text-right">Failed at</th>
                  <th className="font-semibold pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.failedJobs.map((j) => (
                  <tr key={`${j.queueName}:${j.id}`} className="border-t border-line">
                    <td className="py-2 text-xs text-fg-muted whitespace-nowrap">{j.queueName}</td>
                    <td className="py-2 font-mono text-xs text-fg-muted">{j.projectId ?? j.id}</td>
                    <td className="py-2 text-xs text-fg-muted max-w-md truncate" title={j.failedReason}>{j.failedReason ?? "—"}</td>
                    <td className="py-2 text-right text-fg-muted">{j.attemptsMade}</td>
                    <td className="py-2 text-right text-xs text-fg-subtle whitespace-nowrap">{new Date(j.timestamp).toLocaleString()}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="link" onClick={() => setTarget({ job: j, action: "retry" })} className="text-brand mr-3">Retry</Button>
                      <Button variant="link" onClick={() => setTarget({ job: j, action: "remove" })} className="text-error">Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!target}
        title={target?.action === "retry" ? "Retry job" : "Remove job"}
        message={
          target?.action === "retry"
            ? `Re-queue ${target.job.projectId ?? target.job.id} on ${target.job.queueName}?`
            : `Remove ${target?.job.projectId ?? target?.job.id ?? ""} from the failed set? It won't be retried.`
        }
        confirmLabel={target?.action === "retry" ? "Retry" : "Remove"}
        danger={target?.action === "remove"}
        onConfirm={() => (target ? act(target.job, target.action) : undefined)}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
