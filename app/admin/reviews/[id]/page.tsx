"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

interface ReviewDetail {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  featureUsed: string;
  status: "pending" | "published" | "rejected" | "hidden";
  verifiedCustomer: boolean;
  pinned: boolean;
  spamScore: number | null;
  spamFlags: string[] | null;
  rejectionReason: string | null;
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  createdAt: string;
  editedAt: string | null;
  user: { id: string; email: string; name: string | null; createdAt: string };
  attachments: Array<{ id: string; s3Key: string; kind: string; moderationStatus: string }>;
  reply: { body: string; editedAt: string | null; createdAt: string } | null;
  _count: { votes: number; reports: number };
}

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  before: string | null;
  after: string | null;
  createdAt: string;
}

const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function AdminReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDeleteReview, setConfirmDeleteReview] = useState(false);
  const [confirmDeleteReply, setConfirmDeleteReply] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [replyEditing, setReplyEditing] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editSeededFor, setEditSeededFor] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-review-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}`, { headers: headers() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load review");
      return (await res.json()) as { review: ReviewDetail; moderationHistory: AuditEntry[] };
    },
    enabled: !!token,
  });

  // Seed the edit/reply drafts once per review, without clobbering an
  // in-progress edit on every background refetch.
  if (data && editSeededFor !== id) {
    setEditSeededFor(id);
    setEditBody(data.review.body);
    setEditTitle(data.review.title ?? "");
    setReplyBody(data.review.reply?.body ?? "");
  }

  const moderateMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: string; reason?: string }) => {
      const res = await fetch(`/api/admin/reviews/${id}/moderate`, { method: "POST", headers: headers(), body: JSON.stringify({ action, reason }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Action failed.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-review-detail", id] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ title: editTitle.trim() || null, body: editBody.trim() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-review-detail", id] }); setEditing(false); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const saveReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, {
        method: data?.review.reply ? "PATCH" : "POST", headers: headers(), body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed.");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-review-detail", id] }); setReplyEditing(false); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-review-detail", id] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed.");
    },
    onSuccess: () => { window.location.href = "/admin/reviews"; },
    onError: (e: Error) => { showToast(e.message, "error"); setConfirmDeleteReview(false); },
  });

  if (data === null) {
    return (
      <AdminShell title="Review">
        <p className="text-sm text-gray-400">Review not found. <Link href="/admin/reviews" className="text-blue-600 hover:underline">Back to Reviews</Link></p>
      </AdminShell>
    );
  }
  if (isError) {
    return <AdminShell title="Review"><ErrorCard onRetry={refetch} /></AdminShell>;
  }
  if (isLoading || !data) {
    return <AdminShell title="Review"><p className="text-sm text-gray-400">Loading…</p></AdminShell>;
  }

  const review = data.review;
  const history = data.moderationHistory;
  const busy = moderateMutation.isPending || saveEditMutation.isPending || deleteReviewMutation.isPending;

  return (
    <AdminShell title="Review">
      <Link href="/admin/reviews" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Back to Reviews</Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
        <div className="lg:col-span-2 space-y-5">
          <Card shadow padding="lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{review.rating}★</span>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-gray-100 text-gray-600">{review.status}</span>
                {review.verifiedCustomer && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Verified</span>}
                {review.pinned && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-violet-100 text-violet-700">Pinned</span>}
              </div>
              {!editing && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="!text-blue-600 !border-blue-200 hover:!bg-blue-50">
                  Edit content
                </Button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => saveEditMutation.mutate()} disabled={saveEditMutation.isPending}>
                    {saveEditMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setEditBody(review.body); setEditTitle(review.title ?? ""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {review.title && <p className="font-bold text-gray-900 mb-1">{review.title}</p>}
                <p className="text-sm text-gray-700 whitespace-pre-line">{review.body}</p>
              </>
            )}

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-50 text-xs text-gray-500">
              <span className="bg-gray-50 rounded-full px-2.5 py-1">{review.featureUsed}</span>
              <span className="bg-gray-50 rounded-full px-2.5 py-1">{review.helpfulCount} helpful · {review.notHelpfulCount} not helpful</span>
              <span className="bg-gray-50 rounded-full px-2.5 py-1">{review._count.reports} report{review._count.reports === 1 ? "" : "s"}</span>
              <span className="bg-gray-50 rounded-full px-2.5 py-1">Spam score: {review.spamScore ?? "—"}{review.spamFlags?.length ? ` (${review.spamFlags.join(", ")})` : ""}</span>
            </div>
            {review.rejectionReason && (
              <p className="text-xs text-red-600 mt-3">Rejection reason: {review.rejectionReason}</p>
            )}
          </Card>

          {review.attachments.length > 0 && (
            <Card shadow padding="lg">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Attachments</p>
              <div className="grid grid-cols-4 gap-2">
                {review.attachments.map((a) => (
                  <div key={a.id} className="aspect-square bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center p-1">
                    {a.kind} · {a.moderationStatus}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card shadow padding="lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Response from Clipiro</p>
              {!replyEditing && (
                <Button variant="secondary" size="sm" onClick={() => setReplyEditing(true)} className="!text-blue-600 !border-blue-200 hover:!bg-blue-50">
                  {review.reply ? "Edit reply" : "Add reply"}
                </Button>
              )}
            </div>
            {replyEditing ? (
              <div className="space-y-3">
                <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={4} maxLength={2000}
                  placeholder="Write a public reply as Clipiro…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => saveReplyMutation.mutate()} disabled={saveReplyMutation.isPending || !replyBody.trim()}>
                    {saveReplyMutation.isPending ? "Saving…" : "Save reply"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setReplyEditing(false); setReplyBody(review.reply?.body ?? ""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : review.reply ? (
              <div>
                <p className="text-sm text-gray-700 whitespace-pre-line">{review.reply.body}</p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-xs text-gray-400">{dt(review.reply.editedAt ?? review.reply.createdAt)}{review.reply.editedAt ? " (edited)" : ""}</p>
                  <Button variant="link" onClick={() => setConfirmDeleteReply(true)} disabled={deleteReplyMutation.isPending} className="text-red-600">Delete</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No reply yet.</p>
            )}
          </Card>

          <Card shadow padding="lg">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Moderation history</p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No moderation actions yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm border-l-2 border-gray-100 pl-3">
                    <p className="font-semibold text-gray-800">{h.action}</p>
                    <p className="text-xs text-gray-400">{dt(h.createdAt)} · admin {h.adminId}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card shadow padding="lg">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Reviewer</p>
            <p className="font-semibold text-gray-900 text-sm">{review.user.name || review.user.email}</p>
            <p className="text-xs text-gray-400">{review.user.email}</p>
            <p className="text-xs text-gray-400 mt-1">Joined {dt(review.user.createdAt)}</p>
            <Link href={`/admin/users/${review.user.id}`} className="inline-block mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800">
              View user →
            </Link>
          </Card>

          <Card shadow padding="lg" className="space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Actions</p>
            {review.status !== "published" && (
              <Button variant="secondary" disabled={busy} onClick={() => moderateMutation.mutate({ action: "approve" })} className="w-full !text-emerald-700 !border-emerald-200 hover:!bg-emerald-50">Approve</Button>
            )}
            {review.status !== "rejected" && (
              <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)} className="w-full">Reject</Button>
            )}
            {review.status === "hidden" ? (
              <Button variant="secondary" disabled={busy} onClick={() => moderateMutation.mutate({ action: "unhide" })} className="w-full">Unhide</Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => moderateMutation.mutate({ action: "hide" })} className="w-full">Hide</Button>
            )}
            {review.status === "published" && (
              review.pinned ? (
                <Button variant="secondary" disabled={busy} onClick={() => moderateMutation.mutate({ action: "unpin" })} className="w-full !text-violet-700 !border-violet-200 hover:!bg-violet-50">Unpin</Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => moderateMutation.mutate({ action: "pin" })} className="w-full !text-violet-700 !border-violet-200 hover:!bg-violet-50">Feature</Button>
              )
            )}
            <div className="pt-2 border-t border-gray-50">
              <Button variant="danger" onClick={() => setConfirmDeleteReview(true)} className="w-full">Delete review</Button>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteReview}
        title="Delete review"
        message="Delete this review? This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await deleteReviewMutation.mutateAsync(); }}
        onClose={() => setConfirmDeleteReview(false)}
      />

      <ConfirmDialog
        open={confirmDeleteReply}
        title="Delete reply"
        message="Delete this reply? This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await deleteReplyMutation.mutateAsync(); }}
        onClose={() => setConfirmDeleteReply(false)}
      />

      <ConfirmDialog
        open={rejecting}
        title="Reject review"
        message="This reason is shown to the reviewer."
        confirmLabel="Reject"
        danger
        confirmDisabled={!rejectReason.trim()}
        onConfirm={async () => {
          await moderateMutation.mutateAsync({ action: "reject", reason: rejectReason.trim() });
          setRejectReason("");
        }}
        onClose={() => { setRejecting(false); setRejectReason(""); }}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Reason for rejecting this review…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
        />
      </ConfirmDialog>
    </AdminShell>
  );
}
