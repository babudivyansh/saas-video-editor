"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

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
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-review-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reviews/reports?status=open", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load reports");
      return (await res.json()) as { reports?: AdminReport[] };
    },
    enabled: !!token,
  });
  const reports = data?.reports ?? [];

  const handleMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "resolve" | "dismiss" }) => {
      const res = await fetch(`/api/admin/reviews/reports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Action failed.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-review-reports"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AdminShell title="Review Reports">
      <Link href="/admin/reviews" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Back to Reviews</Link>

      <div className="mt-4">
        {isError ? (
          <ErrorCard onRetry={refetch} />
        ) : isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">No open reports. Nice and quiet.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const busy = handleMutation.isPending && handleMutation.variables?.id === r.id;
              return (
              <Card key={r.id} shadow padding="md">
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
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleMutation.mutate({ id: r.id, action: "dismiss" })}>
                      Dismiss
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => handleMutation.mutate({ id: r.id, action: "resolve" })} className="!text-emerald-700 !border-emerald-200 hover:!bg-emerald-50">
                      Resolve
                    </Button>
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
