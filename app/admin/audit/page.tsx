"use client";
import { useEffect, useState, useCallback, Fragment } from "react";
import AdminShell from "../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface AuditEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetId: string | null;
  before: string | null;
  after: string | null;
  createdAt: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function prettyJson(raw: string | null) {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const LIMIT = 50;

interface AdminActivity {
  adminEmail: string;
  actions30d: number;
  lastActionAt: string | null;
}

export default function AdminAuditPage() {
  const { token, user } = useAuth();
  const [logs, setLogs]     = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [byAdmin, setByAdmin] = useState<AdminActivity[]>([]);
  const [activityWindow, setActivityWindow] = useState<{ from: string; to: string | null } | null>(null);
  // filters
  const [fAction, setFAction] = useState("");
  const [fTarget, setFTarget] = useState("");
  const [fAdmin, setFAdmin] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    for (const [k, v] of [["action", fAction], ["targetId", fTarget], ["adminEmail", fAdmin], ["from", fFrom], ["to", fTo]] as const) {
      if (v.trim()) params.set(k, v.trim());
    }
    const res = await fetch(`/api/admin/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { logs: [], total: 0, byAdmin: [] };
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    if (page === 1) {
      setByAdmin(data.byAdmin ?? []);
      setActivityWindow(data.activityWindow ?? null);
    }
    setLoading(false);
  }, [token, user?.role, page, fAction, fTarget, fAdmin, fFrom, fTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function actionColor(action: string) {
    if (action.includes("delete") || action.includes("expired") || action.includes("deactivat")) return "bg-red-100 text-red-700";
    if (action.includes("created") || action.includes("refill") || action.includes("extend")) return "bg-green-100 text-green-700";
    return "bg-blue-100 text-blue-700";
  }

  return (
    <AdminShell title="Audit Log">
      <p className="text-sm text-gray-500 mb-4">
        Every admin action is recorded here. Click a row to see the before/after snapshot.
      </p>

      {byAdmin.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
            Admin activity — {activityWindow
              ? `since ${fmtShort(activityWindow.from)}${activityWindow.to ? ` to ${fmtShort(activityWindow.to)}` : ""}`
              : "last 30 days"}
          </p>
          <div className="flex flex-wrap gap-2">
            {byAdmin.map(a => (
              <button
                key={a.adminEmail}
                onClick={() => { setFAdmin(a.adminEmail); setPage(1); }}
                className="text-xs bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-lg px-3 py-1.5 cursor-pointer"
                title="Filter to this admin"
              >
                <span className="font-semibold text-gray-700">{a.adminEmail}</span>
                <span className="text-gray-400"> · {a.actions30d} actions</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-2 items-end">
        <input value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }} placeholder="Action prefix (e.g. user., commission.)"
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 w-56" aria-label="Filter by action" />
        <input value={fTarget} onChange={e => { setFTarget(e.target.value); setPage(1); }} placeholder="Target ID"
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 w-44 font-mono" aria-label="Filter by target" />
        <input value={fAdmin} onChange={e => { setFAdmin(e.target.value); setPage(1); }} placeholder="Admin email"
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 w-44" aria-label="Filter by admin" />
        <input type="date" value={fFrom} onChange={e => { setFFrom(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2" aria-label="From date" />
        <input type="date" value={fTo} onChange={e => { setFTo(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2" aria-label="To date" />
        {(fAction || fTarget || fAdmin || fFrom || fTo) && (
          <button onClick={() => { setFAction(""); setFTarget(""); setFAdmin(""); setFFrom(""); setFTo(""); setPage(1); }}
            className="text-xs font-semibold text-gray-500 hover:text-red-600 px-3 py-2 cursor-pointer">
            Clear filters
          </button>
        )}
        <button
          onClick={async () => {
            const params = new URLSearchParams({ export: "csv" });
            for (const [k, v] of [["action", fAction], ["targetId", fTarget], ["adminEmail", fAdmin], ["from", fFrom], ["to", fTo]] as const) {
              if (v.trim()) params.set(k, v.trim());
            }
            const res = await fetch(`/api/admin/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `audit-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          className="ml-auto text-xs font-semibold text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading logs…</p>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm font-semibold text-gray-600">No audit entries yet</p>
          <p className="text-xs text-gray-400 mt-1">Admin actions will be logged here automatically.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="py-3.5 px-5">Admin</th>
                    <th className="py-3.5 px-3">Action</th>
                    <th className="py-3.5 px-3">Target</th>
                    <th className="py-3.5 px-3">Date</th>
                    <th className="py-3.5 px-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <Fragment key={l.id}>
                      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                        <td className="py-3 px-5 text-xs text-gray-600">{l.adminEmail}</td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${actionColor(l.action)}`}>
                            {l.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-gray-400 truncate max-w-[120px]">
                          {l.targetId ?? "—"}
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">{fmt(l.createdAt)}</td>
                        <td className="py-3 px-3 text-xs text-blue-600">{expanded === l.id ? "▲ Hide" : "▼ Show"}</td>
                      </tr>
                      {expanded === l.id && (
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <td colSpan={5} className="px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Before</p>
                                <pre className="text-xs text-gray-700 bg-white border border-gray-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
                                  {prettyJson(l.before)}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">After</p>
                                <pre className="text-xs text-gray-700 bg-white border border-gray-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
                                  {prettyJson(l.after)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages} ({total} entries)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
