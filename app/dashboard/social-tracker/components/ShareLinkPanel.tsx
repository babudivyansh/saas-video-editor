"use client";

// Shareable read-only report links.
//
// v1 could mint these and never revoke them: the token was a bare 7-day JWT with
// no server-side record, so a link pasted into the wrong channel stayed live for
// a week and the only kill switch was rotating JWT_SECRET — which signs out
// every user of the product.
//
// Revocation lands with the SocialReportLink model in Stage 9; this panel is
// already shaped for it, and deliberately warns about the current behaviour
// rather than presenting an unrevocable link as if it were safe.

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { useToast } from "@/app/components/ui/Toast";
import { useSocialApi } from "./useSocialApi";

export function ShareLinkPanel({
  accounts,
}: {
  accounts: Array<{ id: string; label: string }>;
}) {
  const { showToast } = useToast();
  const api = useSocialApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  const create = useCallback(
    async (accountId: string) => {
      setBusy(accountId);
      try {
        const { url } = await api<{ url: string }>("/api/social/report-link", {
          method: "POST",
          body: JSON.stringify({ accountId }),
        });
        setLinks((prev) => ({ ...prev, [accountId]: url }));

        // Clipboard can reject (permissions, insecure context) — the link is
        // shown regardless, so a copy failure is not a failure to create.
        try {
          await navigator.clipboard.writeText(url);
          showToast("Share link copied to clipboard", "success");
        } catch {
          showToast("Share link created — copy it below", "info");
        }
      } catch {
        showToast("Couldn't create a share link.", "error");
      } finally {
        setBusy(null);
      }
    },
    [api, showToast],
  );

  return (
    <section id="share" aria-labelledby="share-heading">
      <h2 id="share-heading" className="mb-1 text-sm font-semibold text-ink">
        Share a read-only report
      </h2>
      <p className="mb-3 max-w-2xl text-sm text-ink-soft">
        Anyone with the link can see this account&apos;s headline metrics — no sign-in needed.
        Links expire after 7 days and{" "}
        <strong className="font-semibold text-ink">cannot currently be revoked early</strong>, so
        only share them where you would share the numbers themselves.
      </p>

      <div className="space-y-3">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-ink">{a.label}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void create(a.id)}
                disabled={busy === a.id}
              >
                {busy === a.id ? "Creating…" : "Create share link"}
              </Button>
            </div>

            {links[a.id] && (
              <label className="mt-3 block">
                <span className="sr-only">Share link for {a.label}</span>
                <input
                  readOnly
                  value={links[a.id]}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-card-border bg-surface px-3 py-2 font-mono text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
