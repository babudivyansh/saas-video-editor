"use client";

// Content & Storage: what's stored and by whom, the moderation queue with
// approve / remove, the two storage sweeps (preview first, then run), and a
// browser over every account's projects and library assets with delete.

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminShell from "../AdminShell";
import { ErrorCard } from "../dashboard/ui";
import { ContentBrowser } from "../_components/ContentBrowser";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";

interface AssetsAdminData {
  totalBytes: number;
  totalAssets: number;
  archivedBytes: number;
  archivedCount: number;
  orphanedPendingUploads: number;
  topUsers: Array<{ userId: string; email: string; name: string | null; bytes: number; count: number }>;
  flaggedAssets: Array<{ id: string; name: string; kind: string; size: number; createdAt: string; moderationLabels: unknown; user: { id: string; email: string } | null }>;
}

interface SweepResult {
  dryRun: boolean;
  matched: number;
  deleted: number;
  failed: number;
  bytes: number;
  sample: Array<{ id: string; key: string; createdAt: string }>;
}

const fmtBytes = (b: number) =>
  b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

const SWEEPS = {
  orphans: {
    title: "Orphaned uploads",
    body: "S3 objects from uploads older than 30 minutes that never became an asset (the upload finished but saving it failed). Runs every 15 minutes on schedule.",
  },
  retention: {
    title: "Archive retention",
    body: "Assets users archived more than 30 days ago — deleted permanently with their files. Runs daily on schedule.",
  },
} as const;

type SweepJob = keyof typeof SWEEPS;

export default function AdminContentPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);
  const [previews, setPreviews] = useState<Partial<Record<SweepJob, SweepResult>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [runJob, setRunJob] = useState<SweepJob | null>(null);
  const [moderate, setModerate] = useState<{ asset: AssetsAdminData["flaggedAssets"][number]; action: "approve" | "remove" } | null>(null);

  const assets = useQuery({
    queryKey: ["admin-assets"],
    queryFn: async () => {
      const res = await fetch("/api/admin/assets", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load storage");
      return (await res.json()) as AssetsAdminData;
    },
    enabled: !!token,
  });

  async function sweep(job: SweepJob, body: Record<string, unknown>) {
    setBusy(job);
    try {
      const res = await fetch("/api/admin/storage/cleanup", { method: "POST", headers: headers(), body: JSON.stringify({ job, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.issues?.[0]?.message ?? d.error ?? "Cleanup failed");
      setPreviews((p) => ({ ...p, [job]: d as SweepResult }));
      if (!d.dryRun) {
        showToast(`${SWEEPS[job].title}: cleaned ${d.deleted}${d.failed ? `, ${d.failed} failed` : ""}`, d.failed ? "error" : "success");
        await queryClient.invalidateQueries({ queryKey: ["admin-assets"] });
      }
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(assetId: string, action: "approve" | "remove", reason: string) {
    const res = await fetch("/api/admin/content/moderate", { method: "POST", headers: headers(), body: JSON.stringify({ assetId, action, reason }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(d.issues?.[0]?.message ?? d.error ?? "Action failed", "error");
      return;
    }
    showToast(action === "approve" ? "Asset approved" : "Asset deleted", "success");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-assets"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-content"] }),
    ]);
  }

  const a = assets.data;

  return (
    <AdminShell title="Content & Storage">
      {assets.isError ? (
        <ErrorCard onRetry={assets.refetch} />
      ) : !a ? (
        <div className="h-28 bg-surface-3 rounded-2xl animate-pulse mb-5" />
      ) : (
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ["Library storage", fmtBytes(a.totalBytes), `${a.totalAssets.toLocaleString()} active assets`],
            ["Archived (pending purge)", fmtBytes(a.archivedBytes), `${a.archivedCount.toLocaleString()} assets`],
            ["Stale uploads", String(a.orphanedPendingUploads), "awaiting the orphans sweep"],
            ["Flagged by moderation", String(a.flaggedAssets.length), "hidden from their owners"],
          ].map(([label, value, detail]) => (
            <li key={label} className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4">
              <p className="text-xs font-semibold text-fg-muted">{label}</p>
              <p className="text-xl font-bold text-fg mt-1">{value}</p>
              <p className="text-[11px] text-fg-subtle mt-0.5">{detail}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-1">Moderation queue</h2>
          <p className="text-xs text-fg-subtle mb-3">Assets the scan flagged for explicit or violent content. Approve returns one to its owner; Remove deletes it and its file.</p>
          {!a ? null : a.flaggedAssets.length === 0 ? (
            <p className="text-sm text-fg-subtle">Nothing flagged.</p>
          ) : (
            <ul className="divide-y divide-line">
              {a.flaggedAssets.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <div className="flex-1 min-w-[10rem]">
                    <p className="text-fg truncate" title={f.name}>{f.name}</p>
                    <p className="text-[11px] text-fg-subtle">
                      {f.kind} · {fmtBytes(f.size)} ·{" "}
                      {f.user ? <Link href={`/admin/users/${f.user.id}`} className="text-brand hover:underline">{f.user.email}</Link> : "unknown owner"}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setModerate({ asset: f, action: "approve" })}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => setModerate({ asset: f, action: "remove" })}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-1">Top storage users</h2>
          <p className="text-xs text-fg-subtle mb-3">Active library bytes per account.</p>
          {!a ? null : a.topUsers.length === 0 ? (
            <p className="text-sm text-fg-subtle">No assets yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {a.topUsers.map((u) => (
                  <tr key={u.userId} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-xs truncate max-w-[180px]">
                      <Link href={`/admin/users/${u.userId}`} className="text-brand hover:underline">{u.name || u.email}</Link>
                    </td>
                    <td className="py-1.5 text-right text-xs text-fg-subtle">{u.count} files</td>
                    <td className="py-1.5 text-right font-semibold text-fg whitespace-nowrap">{fmtBytes(u.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {(Object.keys(SWEEPS) as SweepJob[]).map((job) => {
          const p = previews[job];
          return (
            <Card key={job} shadow padding="md">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-fg flex-1">{SWEEPS[job].title}</h2>
                {p && <StatusBadge tone={p.dryRun ? "info" : p.failed ? "error" : "success"}>{p.dryRun ? "Preview" : "Ran"}</StatusBadge>}
              </div>
              <p className="text-xs text-fg-subtle mb-3">{SWEEPS[job].body}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" loading={busy === job} onClick={() => sweep(job, { dryRun: true })}>Preview</Button>
                {p?.dryRun && p.matched > 0 && (
                  <Button size="sm" variant="danger" onClick={() => setRunJob(job)}>Clean {p.matched} now</Button>
                )}
              </div>
              {p && (
                <div className="mt-3 text-xs text-fg-muted">
                  <p>
                    {p.dryRun
                      ? `${p.matched} item(s) would be removed${p.bytes ? ` (${fmtBytes(p.bytes)})` : ""}.`
                      : `Removed ${p.deleted} of ${p.matched}${p.failed ? ` — ${p.failed} failed, see the server log` : ""}.`}
                  </p>
                  {p.dryRun && p.sample.length > 0 && (
                    <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-fg-subtle">
                      {p.sample.map((s) => <li key={s.id} className="break-all">{s.key}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card shadow padding="md">
        <h2 className="text-sm font-bold text-fg mb-3">All content</h2>
        <ContentBrowser headers={headers} />
      </Card>

      <ConfirmDialog
        open={!!runJob}
        title={runJob ? `Run ${SWEEPS[runJob].title.toLowerCase()} now` : ""}
        message={runJob ? `Permanently delete the ${previews[runJob]?.matched ?? 0} item(s) the preview found, including their stored files?` : ""}
        confirmLabel="Clean now"
        danger
        confirmPhrase={runJob ?? undefined}
        requireReason
        onConfirm={({ phrase, reason }) => (runJob ? sweep(runJob, { dryRun: false, confirmPhrase: phrase, reason }) : undefined)}
        onClose={() => setRunJob(null)}
      />
      <ConfirmDialog
        open={!!moderate}
        title={moderate?.action === "approve" ? "Approve asset" : "Remove asset"}
        message={
          moderate?.action === "approve"
            ? `Mark “${moderate.asset.name}” as clean? It reappears in ${moderate.asset.user?.email ?? "the owner"}'s library.`
            : `Delete “${moderate?.asset.name ?? ""}” and its stored file? The owner loses it permanently.`
        }
        confirmLabel={moderate?.action === "approve" ? "Approve" : "Remove"}
        danger={moderate?.action === "remove"}
        requireReason
        onConfirm={({ reason }) => (moderate ? resolve(moderate.asset.id, moderate.action, reason) : undefined)}
        onClose={() => setModerate(null)}
      />
    </AdminShell>
  );
}
