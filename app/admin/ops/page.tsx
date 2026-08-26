"use client";

// Operations console: render-queue state with retry/remove on failed jobs,
// worker liveness, feature flags, maintenance mode, and a storage report.

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

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
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/sessions", { method: "POST", headers: headers(), body: JSON.stringify({ confirm: true }) });
      if (res.ok) onDone();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return confirm ? (
    <button onClick={run} onBlur={() => setConfirm(false)} disabled={busy}
      className="text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50 cursor-pointer">
      {busy ? "Revoking…" : "Confirm — log everyone out?"}
    </button>
  ) : (
    <button onClick={() => setConfirm(true)} className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg cursor-pointer">
      Revoke all user sessions
    </button>
  );
}

export default function AdminOpsPage() {
  const { token } = useAuth();
  const [d, setD] = useState<OpsData | null>(null);
  const [assetsD, setAssetsD] = useState<AssetsAdminData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [maintMessage, setMaintMessage] = useState("");
  const [newFlag, setNewFlag] = useState("");
  const [confirmMaint, setConfirmMaint] = useState(false);
  const [confirmMaintOff, setConfirmMaintOff] = useState(false);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    const [res, assetsRes] = await Promise.all([
      fetch("/api/admin/ops", { headers: headers() }),
      fetch("/api/admin/assets", { headers: headers() }),
    ]);
    if (res.ok) {
      const data = (await res.json()) as OpsData;
      setD(data);
      setMaintMessage(data.maintenance.message ?? "");
    }
    if (assetsRes.ok) setAssetsD(await assetsRes.json());
  }, [token, headers]);

  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/admin/ops", { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setMsg(e.issues?.[0]?.message ?? e.error ?? "Update failed");
    }
    setConfirmMaint(false);
    setConfirmMaintOff(false);
    await load();
  }

  async function jobAction(jobId: string, action: "retry" | "remove", queueName: string) {
    setMsg(null);
    const res = await fetch("/api/admin/ops/jobs", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ jobId, action, queueName }),
    });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error ?? "Action failed");
    await load();
  }

  if (!d) {
    return (
      <AdminShell title="Operations">
        <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-100 rounded-2xl" /><div className="h-64 bg-gray-100 rounded-2xl" /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Operations">
      {msg && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2 mb-4">{msg}</p>}
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
            confirmMaintOff ? (
              <button onClick={() => patch({ maintenance: { on: false, confirm: true } })} onBlur={() => setConfirmMaintOff(false)}
                className="text-xs font-bold text-white bg-emerald-700 px-4 py-2 rounded-lg cursor-pointer">
                Confirm — restore traffic?
              </button>
            ) : (
              <button onClick={() => setConfirmMaintOff(true)} className="text-xs font-semibold text-white bg-emerald-600 px-4 py-2 rounded-lg cursor-pointer">
                Turn OFF maintenance
              </button>
            )
          ) : confirmMaint ? (
            <button onClick={() => patch({ maintenance: { on: true, message: maintMessage.trim() || undefined, confirm: true } })} onBlur={() => setConfirmMaint(false)}
              className="text-xs font-bold text-white bg-red-600 px-4 py-2 rounded-lg cursor-pointer">
              Confirm — take the API down?
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
            <RevokeAllSessions headers={headers} onDone={() => setMsg("All non-admin sessions revoked.")} />
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
                    <button onClick={() => jobAction(j.id!, "retry", j.queueName)} className="text-xs font-semibold text-blue-600 hover:underline mr-3 cursor-pointer">Retry</button>
                    <button onClick={() => jobAction(j.id!, "remove", j.queueName)} className="text-xs font-semibold text-red-500 hover:underline cursor-pointer">Remove</button>
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
                  <input type="checkbox" checked={value} onChange={(e) => patch({ flag: { name, value: e.target.checked } })} />
                  {value ? "on" : "off"}
                </label>
                <button onClick={() => patch({ flag: { name, value: null } })} className="text-xs text-gray-300 hover:text-red-500 cursor-pointer" aria-label={`Delete flag ${name}`}>✕</button>
              </div>
            ))}
            {Object.keys(d.flags).length === 0 && <p className="text-xs text-gray-400">No flags defined.</p>}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (newFlag.trim()) { patch({ flag: { name: newFlag.trim(), value: false } }); setNewFlag(""); } }}
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
    </AdminShell>
  );
}
