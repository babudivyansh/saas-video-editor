"use client";
import { useEffect, useState, useCallback } from "react";
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

function prettyJson(raw: string | null) {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const LIMIT = 50;

export default function AdminAuditPage() {
  const { token, user } = useAuth();
  const [logs, setLogs]     = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    const res = await fetch(`/api/admin/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { logs: [], total: 0 };
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [token, user?.role, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function actionColor(action: string) {
    if (action.includes("delete") || action.includes("expired") || action.includes("deactivat")) return "bg-red-100 text-red-700";
    if (action.includes("created") || action.includes("refill") || action.includes("extend")) return "bg-green-100 text-green-700";
    return "bg-blue-100 text-blue-700";
  }

  return (
    <AdminShell title="Audit Log">
      <p className="text-sm text-gray-500 mb-6">
        Every admin action is recorded here. Click a row to see the before/after snapshot.
      </p>

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
                    <>
                      <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
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
                        <tr key={`${l.id}-detail`} className="bg-gray-50 border-b border-gray-100">
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
                    </>
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
