"use client";

// Admin "Export data": builds the same bundle as the user's own "Download my
// data" (profile, projects/clips/assets metadata with signed media links,
// purchases, login history, social data) without emailing the user, then
// shows a download link valid for 24 hours.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";

interface ExportStatus {
  status: "queued" | "ready" | "failed";
  url?: string;
  error?: string;
}

export function DataExport({ userId, email, headers }: { userId: string; email: string; headers: () => Record<string, string> }) {
  const { showToast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const status = useQuery({
    queryKey: ["admin-user-export", userId, jobId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/export/${jobId}`, { headers: headers() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't check the export");
      return (await res.json()) as ExportStatus;
    },
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "queued" || !q.state.data ? 3000 : false),
  });

  async function start(reason: string) {
    const res = await fetch(`/api/admin/users/${userId}/export`, { method: "POST", headers: headers(), body: JSON.stringify({ reason }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(d.issues?.[0]?.message ?? d.error ?? "Export failed to start", "error");
      return;
    }
    setJobId(d.jobId);
    showToast("Export started — it usually takes under a minute.", "success");
  }

  const s = status.data?.status;

  return (
    <Card shadow padding="md">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-fg flex-1">Export data</h2>
        {jobId && (
          <StatusBadge tone={s === "ready" ? "success" : s === "failed" || status.isError ? "error" : "info"}>
            {s === "ready" ? "Ready" : s === "failed" || status.isError ? "Failed" : "Building…"}
          </StatusBadge>
        )}
      </div>
      <p className="text-xs text-fg-subtle mt-1 mb-3">
        The same JSON bundle the user gets from “Download my data”: profile, projects, clips and library metadata (with 24-hour links to the media),
        purchases, login history and social data. The user is not emailed. Use it for a data-access request that came through support.
      </p>
      {s === "ready" && status.data?.url ? (
        <Button size="sm" variant="primary" href={status.data.url}>Download JSON</Button>
      ) : (
        <Button size="sm" variant="secondary" loading={!!jobId && (s === "queued" || status.isLoading)} onClick={() => setConfirm(true)}>
          {jobId && (s === "failed" || status.isError) ? "Try again" : "Export data…"}
        </Button>
      )}
      {(s === "failed" || status.isError) && (
        <p className="text-xs text-error mt-2">{status.data?.error ?? (status.error as Error | null)?.message ?? "The export failed — see the server log."}</p>
      )}
      <ConfirmDialog
        open={confirm}
        title="Export this account's data"
        message={`Build a download of everything stored about ${email}? It contains personal data — only do this for a verified request.`}
        confirmLabel="Export"
        requireReason
        onConfirm={({ reason }) => start(reason)}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
