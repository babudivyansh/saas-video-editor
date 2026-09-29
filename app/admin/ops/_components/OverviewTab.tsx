"use client";

// At-a-glance health: one tile per thing that can be broken, each linking to
// the tab where it can be fixed. Plus the storage report.

import { Card } from "@/app/components/ui/Card";
import { StatusBadge, type StatusTone } from "@/app/components/ui/StatusBadge";
import { fmtBytes, jobState, type AssetsAdminData, type OpsData } from "./types";

interface Tile {
  label: string;
  tone: StatusTone;
  value: string;
  detail: string;
  tab: string;
}

export function OverviewTab({ data, assets, go }: { data: OpsData; assets?: AssetsAdminData; go: (tab: string) => void }) {
  const failing = data.cronJobs.filter((j) => jobState(j) === "failing").length;
  const never = data.cronJobs.filter((j) => jobState(j) === "never").length;
  const paused = data.cronJobs.filter((j) => j.paused).length;
  const tickOk = data.cronTickAgeSeconds != null && data.cronTickAgeSeconds < 5 * 60;
  const beats = Object.values(data.heartbeats);
  const alive = beats.filter(Boolean).length;
  const backlog = (data.queues ?? []).reduce((s, q) => s + q.counts.waiting + q.counts.delayed, 0);
  const failedJobs = (data.queues ?? []).reduce((s, q) => s + q.counts.failed, 0);
  const pausedQueues = (data.queues ?? []).filter((q) => q.paused).length;

  const tiles: Tile[] = [
    { label: "Database", tone: data.health.db ? "success" : "error", value: data.health.db ? "Up" : "Down", detail: "SELECT 1", tab: "incident" },
    { label: "Redis", tone: data.health.redis ? "success" : "error", value: data.health.redis ? "Up" : "Down", detail: "Queues, rate limits, cron tracking", tab: "queues" },
    {
      label: "Scheduler",
      tone: tickOk ? "success" : "error",
      value: tickOk ? "Running" : "Not running",
      detail: data.cronTickLastAt ? `Last tick ${new Date(data.cronTickLastAt).toLocaleTimeString()}` : "/api/cron-tick never called",
      tab: "jobs",
    },
    {
      label: "Scheduled jobs",
      tone: failing ? "error" : never ? "warning" : "success",
      value: failing ? `${failing} failing` : never ? `${never} never ran` : "All OK",
      detail: `${data.cronJobs.length} jobs${paused ? ` · ${paused} paused` : ""}`,
      tab: "jobs",
    },
    {
      label: "Workers",
      tone: failedJobs > 0 ? "error" : data.queueDriver === "in-process" ? "info" : alive ? "success" : "warning",
      value: failedJobs > 0 ? `${failedJobs} failed` : data.queueDriver === "in-process" ? "In-process" : `${alive}/${beats.length} alive`,
      detail: `${backlog} waiting · ${failedJobs} failed${pausedQueues ? ` · ${pausedQueues} paused` : ""}`,
      tab: "queues",
    },
    {
      label: "Maintenance",
      tone: data.maintenance.on ? "warning" : "success",
      value: data.maintenance.on ? "ON" : "Off",
      detail: data.maintenance.on ? "Non-admin traffic gets 503" : "Normal traffic",
      tab: "flags",
    },
  ];

  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <button
              type="button"
              onClick={() => go(t.tab)}
              className="w-full text-left rounded-[var(--radius-card)] border border-line bg-surface-2 hover:border-line-strong p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg-muted">{t.label}</span>
                <StatusBadge tone={t.tone}>{t.value}</StatusBadge>
              </div>
              <p className="text-[11px] text-fg-subtle mt-2 truncate">{t.detail}</p>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-3">Storage: largest tables</h2>
          <table className="w-full text-sm">
            <tbody>
              {data.tableSizes.map((t) => (
                <tr key={t.table} className="border-t border-line first:border-0">
                  <td className="py-1.5 font-mono text-xs text-fg-muted break-all">{t.table}</td>
                  <td className="py-1.5 text-right font-semibold text-fg whitespace-nowrap">{t.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {assets && (
          <Card shadow padding="md">
            <h2 className="text-sm font-bold text-fg mb-1">Assets library: top storage users</h2>
            <p className="text-xs text-fg-subtle mb-3">
              {fmtBytes(assets.totalBytes)} across {assets.totalAssets} active assets · {fmtBytes(assets.archivedBytes)} in {assets.archivedCount} archived
              {assets.orphanedPendingUploads > 0 && (
                <span className="text-warning font-semibold"> · {assets.orphanedPendingUploads} stale pending upload(s)</span>
              )}
              {assets.flaggedAssets.length > 0 && (
                <span className="text-warning font-semibold"> · {assets.flaggedAssets.length} flagged for moderation</span>
              )}
            </p>
            {assets.topUsers.length === 0 ? (
              <p className="text-sm text-fg-subtle">No assets uploaded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {assets.topUsers.map((u) => (
                    <tr key={u.userId} className="border-t border-line first:border-0">
                      <td className="py-1.5 text-xs text-fg-muted truncate max-w-[160px]">{u.name || u.email}</td>
                      <td className="py-1.5 text-right text-xs text-fg-subtle">{u.count} files</td>
                      <td className="py-1.5 text-right font-semibold text-fg whitespace-nowrap">{fmtBytes(u.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
