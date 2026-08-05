"use client";

// The four things people come here to DO, rather than to look at: sync now,
// export, share a link, build a report.
//
// Sync is the one with real consequences (it burns provider rate limit and can
// take a while), so it reports what happened rather than silently succeeding.

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { SocialApiError, useSocialDownload } from "./useSocialApi";

export interface QuickActionsProps {
  accountIds: string[];
  /** Disables sync and says why — e.g. no accounts connected. */
  disabledReason?: string;
}

type Status = { kind: "idle" } | { kind: "syncing" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export function QuickActions({ accountIds, disabledReason }: QuickActionsProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const download = useSocialDownload();

  const sync = useCallback(async () => {
    setStatus({ kind: "syncing" });
    try {
      const token = localStorage.getItem("token");
      const headers = {
        "Content-Type": "application/json",
        // /api/social/* is bearer-authenticated; a cookie-only request here
        // comes back 402 and reads as a billing problem.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // One request per account, in parallel: the refresh endpoint is
      // per-account, and a partial failure should still refresh the rest.
      const results = await Promise.all(
        accountIds.map((id) =>
          fetch(`/api/social/accounts/${id}`, { method: "POST", headers }).then((r) => r.ok).catch(() => false),
        ),
      );
      const ok = results.filter(Boolean).length;

      if (ok === 0) {
        setStatus({ kind: "error", message: "Sync failed. Try again shortly." });
        return;
      }
      setStatus({
        kind: "done",
        message:
          ok === accountIds.length
            ? "Synced. New numbers appear as each platform responds."
            : `Synced ${ok} of ${accountIds.length} accounts — the rest failed and will retry on the next scheduled sync.`,
      });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server." });
    }
  }, [accountIds]);

  const exportAccountId = accountIds[0];

  const exportCsv = useCallback(async () => {
    if (!exportAccountId) return;
    setExportError(null);
    setExporting(true);
    try {
      await download(
        `/api/social/export?accountId=${encodeURIComponent(exportAccountId)}&kind=posts`,
        "posts.csv",
      );
    } catch (e) {
      setExportError(
        e instanceof SocialApiError
          ? e.status === 429
            ? "Too many exports just now — try again in a few minutes."
            : e.message
          : "Could not download the file.",
      );
    } finally {
      setExporting(false);
    }
  }, [download, exportAccountId]);

  return (
    <section aria-label="Quick actions" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void sync()}
          disabled={Boolean(disabledReason) || status.kind === "syncing"}
        >
          {status.kind === "syncing" ? "Syncing…" : "Sync now"}
        </Button>

        <Button size="sm" variant="secondary" href="/dashboard/social-tracker/reports">
          Build a report
        </Button>

        {/* Was /settings#share, where the share panel does not live and no #share
            target existed — the button silently landed on an unrelated tab. */}
        <Button size="sm" variant="secondary" href="/dashboard/social-tracker/reports#share">
          Share a link
        </Button>

        {exportAccountId && (
          // This was a <Link> with the comment "a plain anchor, not fetch — routing
          // it through JS would mean buffering it in memory first". The buffering
          // is real, but the anchor never worked: /api/social/* is bearer-only, a
          // navigation carries no Authorization header, and every click returned
          // 402 "available on paid plans". <Link> also prefetched it, running the
          // scan on render. Exports are capped at 5k rows, so one CSV in memory is
          // a cost worth paying for a button that functions.
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        )}
      </div>

      {exportError && (
        <p role="alert" className="text-xs text-red-600">
          {exportError}
        </p>
      )}

      {/* Announced politely — a sync is background work, not an alert. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-xs ${status.kind === "error" ? "text-red-600" : "text-ink-soft"}`}
      >
        {status.kind === "done" || status.kind === "error" ? status.message : disabledReason ?? ""}
      </p>
    </section>
  );
}
