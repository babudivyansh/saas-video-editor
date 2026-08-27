"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "@/app/components/ui/Toast";

interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  featureUsed: string;
  status: "pending" | "published" | "rejected" | "hidden";
  verifiedCustomer: boolean;
  pinned: boolean;
  spamScore: number | null;
  reportCount: number;
  helpfulCount: number;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
}

const STATUS_TABS = ["all", "pending", "published", "rejected", "hidden"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const STATUS_BADGE: Record<AdminReview["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  hidden: "bg-gray-200 text-gray-600",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const LIMIT = 25;

export default function AdminReviewsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StatusTab>("pending");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-reviews", tab, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (tab !== "all") params.set("status", tab);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/reviews?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load reviews");
      return (await res.json()) as { reviews?: AdminReview[]; total?: number };
    },
    enabled: !!token && user?.role === "ADMIN",
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: string; reason?: string }) => {
      const res = await fetch(`/api/admin/reviews/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Action failed.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-reviews"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  function reject(id: string) {
    const reason = window.prompt("Reason for rejecting this review (shown to the reviewer):");
    if (reason === null) return;
    if (!reason.trim()) { showToast("A reason is required to reject a review.", "error"); return; }
    moderateMutation.mutate({ id, action: "reject", reason: reason.trim() });
  }

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AdminShell title="Reviews">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/reviews/analytics" className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
            Analytics
          </Link>
          <Link href="/admin/reviews/reports" className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
            Reports
          </Link>
          <Link href="/admin/reviews/settings" className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
            Settings
          </Link>
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="Search title or body…"
            className="w-64 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          <span className="text-sm text-gray-400">{total} review{total !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">No reviews in this view.</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="py-3.5 px-5">Review</th>
                    <th className="py-3.5 px-3">Rating</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3">Spam</th>
                    <th className="py-3.5 px-3">Reports</th>
                    <th className="py-3.5 px-3">Date</th>
                    <th className="py-3.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => {
                    const busy = moderateMutation.isPending && moderateMutation.variables?.id === r.id;
                    return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 px-5 max-w-sm">
                        <Link href={`/admin/reviews/${r.id}`} className="font-semibold text-gray-900 hover:text-blue-600 line-clamp-1">
                          {r.title || r.body.slice(0, 60)}
                        </Link>
                        <p className="text-xs text-gray-400">{r.user.name || r.user.email}{r.verifiedCustomer ? " · Verified" : ""}{r.pinned ? " · Pinned" : ""}</p>
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-900">{r.rating}★</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{r.spamScore ?? "—"}</td>
                      <td className="py-3 px-3 text-gray-600">{r.reportCount || "—"}</td>
                      <td className="py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.status !== "published" && (
                            <button disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "approve" })}
                              className="text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50 disabled:opacity-50">
                              Approve
                            </button>
                          )}
                          {r.status !== "rejected" && (
                            <button disabled={busy} onClick={() => reject(r.id)}
                              className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 disabled:opacity-50">
                              Reject
                            </button>
                          )}
                          {r.status === "hidden" ? (
                            <button disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "unhide" })}
                              className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                              Unhide
                            </button>
                          ) : (
                            <button disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "hide" })}
                              className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                              Hide
                            </button>
                          )}
                          {r.status === "published" && (
                            r.pinned ? (
                              <button disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "unpin" })}
                                className="text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1.5 hover:bg-violet-50 disabled:opacity-50">
                                Unpin
                              </button>
                            ) : (
                              <button disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "pin" })}
                                className="text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1.5 hover:bg-violet-50 disabled:opacity-50">
                                Feature
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                ← Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
