"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

interface Announcement {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  audience: "featureReleases" | "newsletter";
  publishedAt: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  createdAt: string;
}

const EMPTY = { title: "", body: "", ctaLabel: "", ctaUrl: "", audience: "featureReleases" as const };
const input = "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}

function StatusBadge({ a }: { a: Announcement }) {
  if (a.sentAt) return <span className="text-xs font-semibold text-success bg-tint-emerald px-2 py-0.5 rounded-full">Sent to {a.recipientCount ?? 0}</span>;
  if (a.publishedAt) return <span className="text-xs font-semibold text-brand bg-tint-blue px-2 py-0.5 rounded-full">Published — queued for next send</span>;
  return <span className="text-xs font-semibold text-fg-muted bg-surface-3 px-2 py-0.5 rounded-full">Draft</span>;
}

// Admin authoring UI for FeatureAnnouncement — the producer that was missing
// for the Notifications settings page's "Feature releases" and "Newsletter"
// toggles (they persisted and were enforced, but nothing ever published
// anything for them to gate). A published-but-unsent row is picked up once
// by the daily app/api/cron/feature-announcements job.
export default function AdminAnnouncementsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const res = await fetch("/api/admin/announcements", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load announcements");
      return (await res.json()) as { announcements?: Announcement[] };
    },
    enabled: !!token && user?.role === "ADMIN",
  });
  const announcements = data?.announcements ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          ctaLabel: form.ctaLabel || null,
          ctaUrl: form.ctaUrl || null,
          audience: form.audience,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create draft");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-announcements"] }); setForm({ ...EMPTY }); setErr(""); },
    onError: (e: Error) => setErr(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ publish: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to publish");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-announcements"] }); showToast("Published — will send on the next daily run", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to delete");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-announcements"] }); showToast("Deleted", "success"); },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try { await createMutation.mutateAsync(); } finally { setCreating(false); }
  }

  const toPublish = announcements.find(a => a.id === confirmPublish);
  const toDelete = announcements.find(a => a.id === confirmDelete);

  return (
    <AdminShell title="Announcements">
      {isError ? (
        <ErrorCard onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-fg-subtle">Loading announcements…</p>
      ) : (
        <div className="space-y-5">
          {announcements.length === 0 && (
            <p className="text-sm text-fg-subtle">No announcements yet — draft your first one below.</p>
          )}

          {announcements.map(a => (
            <div key={a.id} className="bg-panel rounded-2xl border border-line shadow-sm p-6">
              <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-fg">{a.title}</h3>
                  <StatusBadge a={a} />
                  <span className="text-xs text-fg-muted bg-surface-3 px-2 py-0.5 rounded-full">
                    {a.audience === "newsletter" ? "Newsletter" : "Feature releases"}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!a.publishedAt && (
                    <Button variant="primary" size="sm" onClick={() => setConfirmPublish(a.id)} disabled={publishMutation.isPending}>
                      Publish
                    </Button>
                  )}
                  {!a.sentAt && (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(a.id)}>Delete</Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-fg-subtle whitespace-pre-wrap">{a.body}</p>
              {a.ctaLabel && a.ctaUrl && (
                <p className="text-xs text-fg-muted mt-2">Button: <strong>{a.ctaLabel}</strong> → {a.ctaUrl}</p>
              )}
              <p className="text-xs text-fg-subtle mt-3">
                Drafted {fmtDateTime(a.createdAt)}
                {a.publishedAt ? ` · Published ${fmtDateTime(a.publishedAt)}` : ""}
                {a.sentAt ? ` · Sent ${fmtDateTime(a.sentAt)}` : ""}
              </p>
            </div>
          ))}

          {/* Draft a new announcement */}
          <form onSubmit={createDraft} className="bg-panel rounded-2xl border border-dashed border-line-strong p-6">
            <h3 className="font-bold text-fg mb-4">Draft an announcement</h3>
            {err && <div className="text-sm text-error bg-error/10 rounded-xl px-4 py-2 mb-4">{err}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Audience</label>
                <select className={input} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
                  <option value="featureReleases">Feature releases</option>
                  <option value="newsletter">Newsletter</option>
                </select>
                <p className="text-[10px] text-fg-subtle mt-1">Only sends to users who haven&apos;t opted out of this category in Settings.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Title (also the email subject)</label>
                <input className={input} placeholder="New: AI Voiceover now supports 12 languages" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength={150} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Body</label>
                <textarea className={`${input} min-h-24`} placeholder="What's new, in a paragraph or two." value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required maxLength={4000} />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Button label (optional)</label>
                <input className={input} placeholder="Try it now" value={form.ctaLabel} onChange={e => setForm({ ...form, ctaLabel: e.target.value })} maxLength={40} />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-subtle block mb-1">Button URL (optional)</label>
                <input className={input} placeholder="https://clipiro.com/dashboard" value={form.ctaUrl} onChange={e => setForm({ ...form, ctaUrl: e.target.value })} type="url" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? "Saving…" : "Save as draft"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmPublish !== null}
        title="Publish this announcement?"
        message={`"${toPublish?.title ?? ""}" will be emailed to every opted-in user on the next daily run, and can no longer be edited (only deleted before that run).`}
        confirmLabel="Publish"
        onConfirm={async () => { if (confirmPublish) await publishMutation.mutateAsync(confirmPublish); }}
        onClose={() => setConfirmPublish(null)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this announcement?"
        message={`Delete "${toDelete?.title ?? ""}"? ${toDelete?.publishedAt ? "It's published but not sent yet — deleting now cancels the send." : "This can't be undone."}`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => { if (confirmDelete) await deleteMutation.mutateAsync(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
    </AdminShell>
  );
}
