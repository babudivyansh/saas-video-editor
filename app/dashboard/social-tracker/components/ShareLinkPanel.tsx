"use client";

// Shareable read-only report links.
//
// v1 could mint these and never revoke them: the token was a bare 7-day JWT with
// no server-side record, so a link pasted into the wrong channel stayed live for
// a week and the only kill switch was rotating JWT_SECRET — which signs out
// every user of the product.
//
// The SocialReportLink model landed and made revocation instant (a row plus a
// Redis denylist the public page checks first). The panel never caught up: it
// still warned that links "cannot currently be revoked early" and offered no way
// to do it, while DELETE /api/social/report-link/[id] had been live the whole
// time. It also POSTed `{ accountId }` to a route that requires `accountIds`,
// so every "Create share link" click 400'd. Both are fixed here.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { useSocialApi } from "./useSocialApi";

interface ShareLink {
  id: string;
  accountIds: string[];
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}

export function ShareLinkPanel({
  accounts,
}: {
  accounts: Array<{ id: string; label: string }>;
}) {
  const { showToast } = useToast();
  const api = useSocialApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pendingRevoke, setPendingRevoke] = useState<ShareLink | null>(null);

  /** Bumped after a create or revoke to re-run the listing effect. */
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // The token is only ever returned once, at creation. Everything after that is
  // metadata, which is why the list can show a link's status but not its URL.
  //
  // Fetched inside the effect behind a cancellation flag, the same shape
  // ContentTable uses: it satisfies react-hooks/set-state-in-effect, and it
  // stops a slow response from a previous render landing after a newer one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { links: rows } = await api<{ links: ShareLink[] }>("/api/social/report-link");
        if (!cancelled) setLinks(rows);
      } catch {
        // A listing failure is not worth a toast on page load; the create path
        // still works and will refresh this.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  const create = useCallback(
    async (accountId: string) => {
      setBusy(accountId);
      try {
        const { url, link } = await api<{ url: string; link: ShareLink }>("/api/social/report-link", {
          method: "POST",
          body: JSON.stringify({ accountIds: [accountId] }),
        });
        setUrls((prev) => ({ ...prev, [link.id]: url }));
        reload();

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
    [api, reload, showToast],
  );

  const revoke = useCallback(async () => {
    if (!pendingRevoke) return;
    setBusy(pendingRevoke.id);
    try {
      await api(`/api/social/report-link/${pendingRevoke.id}`, { method: "DELETE" });
      showToast("Link revoked — it stops working immediately.", "success");
      setUrls((prev) => {
        const next = { ...prev };
        delete next[pendingRevoke.id];
        return next;
      });
      reload();
    } catch {
      showToast("Couldn't revoke that link.", "error");
    } finally {
      setBusy(null);
      setPendingRevoke(null);
    }
  }, [api, reload, pendingRevoke, showToast]);

  const labelFor = (link: ShareLink) =>
    link.accountIds
      .map((id) => accounts.find((a) => a.id === id)?.label ?? "Unknown account")
      .join(", ");

  const live = links.filter((l) => !l.revokedAt && new Date(l.expiresAt) > new Date());

  return (
    <section id="share" aria-labelledby="share-heading">
      <h2 id="share-heading" className="mb-1 text-sm font-semibold text-ink">
        Share a read-only report
      </h2>
      <p className="mb-3 max-w-2xl text-sm text-ink-soft">
        Anyone with the link can see this account&apos;s headline metrics — no sign-in needed.
        Links expire after 7 days, and you can revoke one at any time below.
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
          </div>
        ))}
      </div>

      {live.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">
            Active links
          </h3>
          <ul className="space-y-2">
            {live.map((link) => (
              <li
                key={link.id}
                className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{labelFor(link)}</p>
                    <p className="text-xs text-ink-soft">
                      Expires {new Date(link.expiresAt).toLocaleDateString("en-GB")} ·{" "}
                      {link.viewCount === 0
                        ? "not opened yet"
                        : `${link.viewCount} view${link.viewCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setPendingRevoke(link)}
                    disabled={busy === link.id}
                  >
                    Revoke
                  </Button>
                </div>

                {urls[link.id] && (
                  <label className="mt-3 block">
                    <span className="sr-only">Share link for {labelFor(link)}</span>
                    <input
                      readOnly
                      value={urls[link.id]}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full rounded-xl border border-card-border bg-surface px-3 py-2 font-mono text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Revoke this share link?"
        message="Anyone holding the link loses access immediately. This cannot be undone — you can create a new link, but it will have a different URL."
        confirmLabel="Revoke"
        danger
        onConfirm={revoke}
        onClose={() => setPendingRevoke(null)}
      />
    </section>
  );
}
