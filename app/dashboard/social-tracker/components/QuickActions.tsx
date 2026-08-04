"use client";

// The four things people come here to DO, rather than to look at: sync now,
// export, share a link, build a report.
//
// Sync is the one with real consequences (it burns provider rate limit and can
// take a while), so it reports what happened rather than silently succeeding.

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/Button";

export interface QuickActionsProps {
  accountIds: string[];
  /** Disables sync and says why — e.g. no accounts connected. */
  disabledReason?: string;
}

type Status = { kind: "idle" } | { kind: "syncing" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export function QuickActions({ accountIds, disabledReason }: QuickActionsProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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

  const exportHref =
    accountIds.length > 0 ? `/api/social/export?accountId=${accountIds[0]}&kind=posts` : undefined;

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

        <Button size="sm" variant="secondary" href="/dashboard/social-tracker/settings#share">
          Share a link
        </Button>

        {exportHref && (
          // A plain anchor, not fetch: the CSV comes back as a file download,
          // and routing it through JS would mean buffering it in memory first.
          <Link
            href={exportHref}
            className="inline-flex items-center rounded-full border border-card-border px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Export CSV
          </Link>
        )}
      </div>

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
