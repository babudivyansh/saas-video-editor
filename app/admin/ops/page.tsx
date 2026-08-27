"use client";

// Operations console: render-queue state with retry/remove on failed jobs,
// worker liveness, feature flags, maintenance mode, and a storage report.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";

interface OpsData {
  queueCounts: Record<string, Record<string, number>> | null;
  failedJobs: Array<{ queueName: string; id: string; projectId?: string; failedReason?: string; attemptsMade: number; timestamp: number }>;
  heartbeats: Record<string, string | null>;
  cronRuns: Array<{ name: string; lastRunAt: string | null; ageSeconds: number | null }>;
  flags: Record<string, boolean>;
  maintenance: { on: boolean; message?: string };
  tableSizes: Array<{ table: string; size: string }>;
}

interface AssetsAdminData {
  totalBytes: number;
  totalAssets: number;
  archivedBytes: number;
  archivedCount: number;
  orphanedPendingUploads: number;
  topUsers: Array<{ userId: string; email: string; name: string | null; bytes: number; count: number }>;
  flaggedAssets: Array<{ id: string; name: string; kind: string; size: number; createdAt: string; user: { email: string } | null }>;
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// Incident response: force every non-admin user to log in again.
function RevokeAllSessions({ headers, onDone }: { headers: () => Record<string, string>; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);

  async function run() {
    const res = await fetch("/api/admin/ops/sessions", { method: "POST", headers: headers(), body: JSON.stringify({ confirm: true }) });
    if (res.ok) onDone();
  }

  return (
    <>
      <button onClick={() => setConfirm(true)} className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg cursor-pointer">
        Revoke all user sessions
      </button>
      <ConfirmDialog
        open={confirm}
        title="Revoke all user sessions"
        message="Log every non-admin user out immediately? They'll all need to sign in again."
        confirmLabel="Revoke all"
        danger
        onConfirm={run}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

export default function AdminOpsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [maintMessage, setMaintMessage] = useState("");
  const [maintMessageSeededFor, setMaintMessageSeededFor] = useState(false);
  const [newFlag, setNewFlag] = useState("");
  const [confirmMaint, setConfirmMaint] = useState(false);
  const [confirmMaintOff, setConfirmMaintOff] = useState(false);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data: d, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ops", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load operations data");
      return (await res.json()) as OpsData;
    },
    enabled: !!token,
  });

  // Seed the maintenance-message input once, without clobbering an
  // in-progress edit on every background refetch.
  if (d && !maintMessageSeededFor) {
    setMaintMessageSeededFor(true);
    setMaintMessage(d.maintenance.message ?? "");
  }

  const { data: assetsD } = useQuery({
    queryKey: ["admin-assets"],
    queryFn: async () => {
      const res = await fetch("/api/admin/assets", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load assets");
      return (await res.json()) as AssetsAdminData;
    },
    enabled: !!token,
  });

  const patchMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/ops", { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.issues?.[0]?.message ?? e.error ?? "Update failed");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ops"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const jobActionMutation = useMutation({
    mutationFn: async ({ jobId, action, queueName }: { jobId: string; action: "retry" | "remove"; queueName: string }) => {
      const res = await fetch("/api/admin/ops/jobs", { method: "POST", headers: headers(), body: JSON.stringify({ jobId, action, queueName }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Action failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ops"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  async function saveMaintenance(body: { on: boolean; message?: string; confirm: true }) {
    try {
      await patchMutation.mutateAsync({ maintenance: body });
      return true;
    } catch {
      return false;
    }
  }

  if (isError) {
    return <AdminShell title="Operations"><ErrorCard onRetry={refetch} /></AdminShell>;
  }
  if (isLoading || !d) {
    return (
      <AdminShell title="Operations">
        <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-100 rounded-2xl" /><div className="h-64 bg-gray-100 rounded-2xl" /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Operations">
      <div className="flex justify-end mb-4">
        <Link href="/admin/ops/diagnostics" className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
          Incident Tools →
        </Link>
      </div>
      {d.maintenance.on && (
        <p className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4">
          ⚠ Maintenance mode is ON — non-admin API traffic is being refused with 503.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Maintenance */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-2">Maintenance mode</h2>
          <p className="text-xs text-gray-400 mb-3">Blocks all non-admin API calls with a 503 + your message. Admin routes and /api/health stay reachable.</p>
          <input
            value={maintMessage}
            onChange={(e) => setMaintMessage(e.target.value)}
            placeholder="Message shown to users (optional)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2"
          />
          {d.maintenance.on ? (
            <button onClick={() => setConfirmMaintOff(true)} className="text-xs font-semibold text-white bg-emerald-600 px-4 py-2 rounded-lg cursor-pointer">
              Turn OFF maintenance
            </button>
          ) : (
            <button onClick={() => setConfirmMaint(true)} className="text-xs font-semibold text-red-600 border border-red-200 px-4 py-2 rounded-lg cursor-pointer">
              Turn ON maintenance
            </button>
          )}
        </div>

        {/* Workers */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-gray-800">Workers</h2>
            <RevokeAllSessions headers={headers} onDone={() => showToast("All non-admin sessions revoked.", "success")} />
          </div>
          <div className="space-y-2 text-sm">
            {Object.entries(d.heartbeats).map(([name, beat]) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${beat ? "bg-emerald-500" : "bg-gray-300"}`} aria-hidden />
                <span className="text-gray-700 font-mono text-xs">{name}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {beat ? `beat ${new Date(beat).toLocaleTimeString()}` : "no heartbeat (not running or older build)"}
                </span>
              </div>
            ))}
          </div>
          {/* Cron jobs — a cron that has NEVER run is almost certainly not
              wired into the scheduler's crontab (SETUP.md §7). Amber = never;
              the timestamp lets you judge staleness for the ones that have. */}
          <div className="mt-4 pt-3 border-t border-gray-50 space-y-2 text-sm">
            <p className="text-[11px] font-semibold text-gray-600 mb-1">Cron jobs</p>
            {d.cronRuns.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.lastRunAt ? "bg-emerald-500" : "bg-amber-400"}`} aria-hidden />
                <span className="text-gray-700 font-mono text-xs">{c.name}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {c.lastRunAt ? `ran ${new Date(c.lastRunAt).toLocaleString()}` : "never — not scheduled?"}
                </span>
              </div>
            ))}
          </div>
          {d.queueCounts && (
            <div className="mt-4 pt-3 border-t border-gray-50 space-y-3">
              {Object.entries(d.queueCounts).map(([queueName, counts]) => (
                <div key={queueName}>
                  <p className="text-[11px] font-semibold text-gray-600 font-mono mb-1">{queueName}</p>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {Object.entries(counts).map(([k, v]) => (
                      <div key={k}>
                        <p className={`text-sm font-bold ${k === "failed" && v > 0 ? "text-red-600" : "text-gray-900"}`}>{v}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{k}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Failed jobs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-5">
        <h2 className="text-sm font-bold text-gray-800 mb-3">Failed render jobs</h2>
        {d.failedJobs.length === 0 ? (
          <p className="text-sm text-gray-400">None — the dead-letter set is empty.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-semibold pb-2">Queue</th>
                <th className="font-semibold pb-2">Project</th>
                <th className="font-semibold pb-2">Reason</th>
                <th className="font-semibold pb-2 text-right">Attempts</th>
                <th className="font-semibold pb-2 text-right">Failed at</th>
                <th className="font-semibold pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {d.failedJobs.map((j) => (
                <tr key={`${j.queueName}:${j.id}`} className="border-t border-gray-50">
                  <td className="py-2 text-xs text-gray-500 whitespace-nowrap">{j.queueName}</td>
                  <td className="py-2 font-mono text-xs text-gray-600">{j.projectId ?? j.id}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-md truncate" title={j.failedReason}>{j.failedReason ?? "—"}</td>
                  <td className="py-2 text-right text-gray-500">{j.attemptsMade}</td>
                  <td className="py-2 text-right text-xs text-gray-400">{new Date(j.timestamp).toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => jobActionMutation.mutate({ jobId: j.id!, action: "retry", queueName: j.queueName })} className="text-xs font-semibold text-blue-600 hover:underline mr-3 cursor-pointer">Retry</button>
                    <button onClick={() => jobActionMutation.mutate({ jobId: j.id!, action: "remove", queueName: j.queueName })} className="text-xs font-semibold text-red-500 hover:underline cursor-pointer">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Feature flags */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-1">Feature flags</h2>
          <p className="text-xs text-gray-400 mb-3">Config-backed booleans readable anywhere via <code className="font-mono">isFeatureEnabled(&quot;name&quot;)</code>.</p>
          <div className="space-y-2">
            {Object.entries(d.flags).map(([name, value]) => (
              <div key={name} className="flex items-center gap-2 text-sm">
                <code className="font-mono text-xs text-gray-700 flex-1">{name}</code>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={value} onChange={(e) => patchMutation.mutate({ flag: { name, value: e.target.checked } })} />
                  {value ? "on" : "off"}
                </label>
                <button onClick={() => patchMutation.mutate({ flag: { name, value: null } })} className="text-xs text-gray-300 hover:text-red-500 cursor-pointer" aria-label={`Delete flag ${name}`}>✕</button>
              </div>
            ))}
            {Object.keys(d.flags).length === 0 && <p className="text-xs text-gray-400">No flags defined.</p>}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (newFlag.trim()) { patchMutation.mutate({ flag: { name: newFlag.trim(), value: false } }); setNewFlag(""); } }}
            className="flex gap-2 mt-3"
          >
            <input value={newFlag} onChange={(e) => setNewFlag(e.target.value)} placeholder="new_flag_name"
              className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-3 py-2" />
            <button type="submit" className="text-xs font-semibold text-white bg-gray-900 px-3 py-2 rounded-lg cursor-pointer">Add</button>
          </form>
        </div>

        {/* Storage */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Storage — largest tables</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {d.tableSizes.map((t) => (
                <tr key={t.table} className="border-t border-gray-50 first:border-0">
                  <td className="py-1.5 font-mono text-xs text-gray-600">{t.table}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{t.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Assets library storage */}
      {assetsD && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">Assets library — top storage users</h2>
            <p className="text-xs text-gray-400 mb-3">
              {fmtBytes(assetsD.totalBytes)} across {assetsD.totalAssets} active assets · {fmtBytes(assetsD.archivedBytes)} in {assetsD.archivedCount} archived (pending purge)
              {assetsD.orphanedPendingUploads > 0 && (
                <span className="text-amber-700 font-semibold"> · {assetsD.orphanedPendingUploads} stale pending upload(s) awaiting cleanup cron</span>
              )}
            </p>
            {assetsD.topUsers.length === 0 ? (
              <p className="text-sm text-gray-400">No assets uploaded yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {assetsD.topUsers.map((u) => (
                    <tr key={u.userId} className="border-t border-gray-50 first:border-0">
                      <td className="py-1.5 text-xs text-gray-600 truncate max-w-[160px]">{u.name || u.email}</td>
                      <td className="py-1.5 text-right text-xs text-gray-400">{u.count} files</td>
                      <td className="py-1.5 text-right font-semibold text-gray-800">{fmtBytes(u.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">Moderation queue</h2>
            <p className="text-xs text-gray-400 mb-3">Assets Rekognition flagged for explicit/violent content — excluded from the uploader&apos;s grid pending review.</p>
            {assetsD.flaggedAssets.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing flagged.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {assetsD.flaggedAssets.map((a) => (
                    <tr key={a.id} className="border-t border-gray-50 first:border-0">
                      <td className="py-1.5 text-xs text-gray-600 truncate max-w-[140px]">{a.name}</td>
                      <td className="py-1.5 text-xs text-gray-400">{a.user?.email ?? "—"}</td>
                      <td className="py-1.5 text-right text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmMaint}
        title="Turn ON maintenance"
        message="Block all non-admin API traffic with a 503 immediately? Admin routes and /api/health stay reachable."
        confirmLabel="Turn on"
        danger
        onConfirm={async () => {
          const ok = await saveMaintenance({ on: true, message: maintMessage.trim() || undefined, confirm: true });
          showToast(ok ? "Maintenance mode is ON" : "Failed to turn on maintenance mode", ok ? "success" : "error");
        }}
        onClose={() => setConfirmMaint(false)}
      />
      <ConfirmDialog
        open={confirmMaintOff}
        title="Turn OFF maintenance"
        message="Restore normal traffic immediately?"
        confirmLabel="Turn off"
        onConfirm={async () => {
          const ok = await saveMaintenance({ on: false, confirm: true });
          showToast(ok ? "Maintenance mode is OFF" : "Failed to turn off maintenance mode", ok ? "success" : "error");
        }}
        onClose={() => setConfirmMaintOff(false)}
      />
    </AdminShell>
  );
}
