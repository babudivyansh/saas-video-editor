"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "dismissed";
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  review: { id: string; title: string | null; body: string; status: string; rating: number };
}

const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function AdminReviewReportsPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/admin/reviews/reports?status=open", { headers: { Authorization: `Bearer ${token}` } });
    const data = res.ok ? await res.json() : { reports: [] };
    setReports(data.reports ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handle(id: string, action: "resolve" | "dismiss") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reviews/reports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setReports((prev) => prev.filter((r) => r.id !== id));
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Action failed."); }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Review Reports">
      <Link href="/admin/reviews" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Back to Reviews</Link>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">No open reports. Nice and quiet.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-amber-100 text-amber-700">{r.reason.replace("_", " ")}</span>
                      <Link href={`/admin/reviews/${r.review.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                        View review ({r.review.rating}★, {r.review.status})
                      </Link>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{r.review.title || r.review.body}</p>
                    {r.details && <p className="text-xs text-gray-500 mt-1">Reporter note: {r.details}</p>}
                    <p className="text-xs text-gray-400 mt-1">Reported by {r.user.name || r.user.email} · {dt(r.createdAt)}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button disabled={busyId === r.id} onClick={() => handle(r.id, "dismiss")}
                      className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
                      Dismiss
                    </button>
                    <button disabled={busyId === r.id} onClick={() => handle(r.id, "resolve")}
                      className="text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50 disabled:opacity-50">
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
