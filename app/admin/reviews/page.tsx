"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

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
  hidden: "bg-surface-3 text-fg-muted",
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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState("");

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

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AdminShell title="Reviews">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-surface-3 rounded-xl p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                tab === t ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button href="/admin/reviews/analytics" variant="secondary" size="sm">Analytics</Button>
          <Button href="/admin/reviews/reports" variant="secondary" size="sm">Reports</Button>
          <Button href="/admin/reviews/settings" variant="secondary" size="sm">Settings</Button>
          <input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="Search title or body…"
            className="w-64 bg-panel border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
          />
          <span className="text-sm text-fg-subtle">{total} review{total !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-fg-subtle py-12 text-center">No reviews in this view.</p>
      ) : (
        <>
          <Card shadow className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">
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
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="py-3 px-5 max-w-sm">
                        <Link href={`/admin/reviews/${r.id}`} className="font-semibold text-fg hover:text-brand line-clamp-1">
                          {r.title || r.body.slice(0, 60)}
                        </Link>
                        <p className="text-xs text-fg-subtle">{r.user.name || r.user.email}{r.verifiedCustomer ? " · Verified" : ""}{r.pinned ? " · Pinned" : ""}</p>
                      </td>
                      <td className="py-3 px-3 font-semibold text-fg">{r.rating}★</td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="py-3 px-3 text-fg-muted">{r.spamScore ?? "—"}</td>
                      <td className="py-3 px-3 text-fg-muted">{r.reportCount || "—"}</td>
                      <td className="py-3 px-3 text-fg-subtle text-xs whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.status !== "published" && (
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "approve" })} className="!text-emerald-700 !border-emerald-200 hover:!bg-emerald-50">
                              Approve
                            </Button>
                          )}
                          {r.status !== "rejected" && (
                            <Button variant="danger" size="sm" disabled={busy} onClick={() => { setRejectingId(r.id); setRejectReasonText(""); }}>
                              Reject
                            </Button>
                          )}
                          {r.status === "hidden" ? (
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "unhide" })}>
                              Unhide
                            </Button>
                          ) : (
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "hide" })}>
                              Hide
                            </Button>
                          )}
                          {r.status === "published" && (
                            r.pinned ? (
                              <Button variant="secondary" size="sm" disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "unpin" })} className="!text-violet-700 !border-violet-200 hover:!bg-violet-50">
                                Unpin
                              </Button>
                            ) : (
                              <Button variant="secondary" size="sm" disabled={busy} onClick={() => moderateMutation.mutate({ id: r.id, action: "pin" })} className="!text-violet-700 !border-violet-200 hover:!bg-violet-50">
                                Feature
                              </Button>
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
          </Card>

          <div className="flex items-center justify-between text-sm text-fg-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ← Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!rejectingId}
        title="Reject review"
        message="This reason is shown to the reviewer."
        confirmLabel="Reject"
        danger
        confirmDisabled={!rejectReasonText.trim()}
        onConfirm={async () => {
          if (!rejectingId) return;
          await moderateMutation.mutateAsync({ id: rejectingId, action: "reject", reason: rejectReasonText.trim() });
          setRejectReasonText("");
        }}
        onClose={() => { setRejectingId(null); setRejectReasonText(""); }}
      >
        <textarea
          value={rejectReasonText}
          onChange={(e) => setRejectReasonText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Reason for rejecting this review…"
          className="w-full text-sm border border-line rounded-lg px-3 py-2"
        />
      </ConfirmDialog>
    </AdminShell>
  );
}
