"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../AdminShell";
import { useAuth } from "@/app/components/AuthContext";

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
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [replyEditing, setReplyEditing] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/admin/reviews/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) { setNotFound(true); return; }
    if (!res.ok) return;
    const data = await res.json() as { review: ReviewDetail; moderationHistory: AuditEntry[] };
    setReview(data.review);
    setHistory(data.moderationHistory);
    setEditBody(data.review.body);
    setEditTitle(data.review.title ?? "");
    setReplyBody(data.review.reply?.body ?? "");
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  async function moderate(action: string, reason?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/moderate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) await load();
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Action failed."); }
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    const reason = window.prompt("Reason for rejecting this review (shown to the reviewer):");
    if (reason === null) return;
    if (!reason.trim()) { alert("A reason is required."); return; }
    moderate("reject", reason.trim());
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ title: editTitle.trim() || null, body: editBody.trim() }),
      });
      if (res.ok) { setEditing(false); await load(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Save failed."); }
    } finally {
      setBusy(false);
    }
  }

  async function saveReply() {
    if (!replyBody.trim()) return;
    setReplyBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, {
        method: review?.reply ? "PATCH" : "POST",
        headers: headers(),
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (res.ok) { setReplyEditing(false); await load(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Save failed."); }
    } finally {
      setReplyBusy(false);
    }
  }

  async function deleteReply() {
    if (!window.confirm("Delete this reply?")) return;
    setReplyBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) await load();
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Delete failed."); }
    } finally {
      setReplyBusy(false);
    }
  }

  async function deleteReview() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) window.location.href = "/admin/reviews";
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? "Delete failed."); }
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (notFound) {
    return (
      <AdminShell title="Review">
        <p className="text-sm text-gray-400">Review not found. <Link href="/admin/reviews" className="text-blue-600 hover:underline">Back to Reviews</Link></p>
      </AdminShell>
    );
  }
  if (!review) {
    return <AdminShell title="Review"><p className="text-sm text-gray-400">Loading…</p></AdminShell>;
  }

  return (
    <AdminShell title="Review">
      <Link href="/admin/reviews" className="text-xs font-semibold text-gray-500 hover:text-gray-800">← Back to Reviews</Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{review.rating}★</span>
                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-gray-100 text-gray-600">{review.status}</span>
                {review.verifiedCustomer && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Verified</span>}
                {review.pinned && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-violet-100 text-violet-700">Pinned</span>}
              </div>
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50">
                  Edit content
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={busy} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50">
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => { setEditing(false); setEditBody(review.body); setEditTitle(review.title ?? ""); }}
                    className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50">
                    Cancel
                  </button>
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
          </div>

          {review.attachments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Attachments</p>
              <div className="grid grid-cols-4 gap-2">
                {review.attachments.map((a) => (
                  <div key={a.id} className="aspect-square bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center p-1">
                    {a.kind} · {a.moderationStatus}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Response from Clipiro</p>
              {!replyEditing && (
                <button onClick={() => setReplyEditing(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50">
                  {review.reply ? "Edit reply" : "Add reply"}
                </button>
              )}
            </div>
            {replyEditing ? (
              <div className="space-y-3">
                <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={4} maxLength={2000}
                  placeholder="Write a public reply as Clipiro…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <div className="flex gap-2">
                  <button onClick={saveReply} disabled={replyBusy || !replyBody.trim()} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50">
                    {replyBusy ? "Saving…" : "Save reply"}
                  </button>
                  <button onClick={() => { setReplyEditing(false); setReplyBody(review.reply?.body ?? ""); }}
                    className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : review.reply ? (
              <div>
                <p className="text-sm text-gray-700 whitespace-pre-line">{review.reply.body}</p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-xs text-gray-400">{dt(review.reply.editedAt ?? review.reply.createdAt)}{review.reply.editedAt ? " (edited)" : ""}</p>
                  <button onClick={deleteReply} disabled={replyBusy} className="text-xs font-semibold text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No reply yet.</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Reviewer</p>
            <p className="font-semibold text-gray-900 text-sm">{review.user.name || review.user.email}</p>
            <p className="text-xs text-gray-400">{review.user.email}</p>
            <p className="text-xs text-gray-400 mt-1">Joined {dt(review.user.createdAt)}</p>
            <Link href={`/admin/users/${review.user.id}`} className="inline-block mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800">
              View user →
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Actions</p>
            {review.status !== "published" && (
              <button disabled={busy} onClick={() => moderate("approve")} className="w-full text-xs font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50 disabled:opacity-50">Approve</button>
            )}
            {review.status !== "rejected" && (
              <button disabled={busy} onClick={reject} className="w-full text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 disabled:opacity-50">Reject</button>
            )}
            {review.status === "hidden" ? (
              <button disabled={busy} onClick={() => moderate("unhide")} className="w-full text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50">Unhide</button>
            ) : (
              <button disabled={busy} onClick={() => moderate("hide")} className="w-full text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50">Hide</button>
            )}
            {review.status === "published" && (
              review.pinned ? (
                <button disabled={busy} onClick={() => moderate("unpin")} className="w-full text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-50 disabled:opacity-50">Unpin</button>
              ) : (
                <button disabled={busy} onClick={() => moderate("pin")} className="w-full text-xs font-semibold text-violet-700 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-50 disabled:opacity-50">Feature</button>
              )
            )}
            <div className="pt-2 border-t border-gray-50">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button disabled={busy} onClick={deleteReview} className="flex-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-2 disabled:opacity-50">Confirm delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="w-full text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50">Delete review</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
