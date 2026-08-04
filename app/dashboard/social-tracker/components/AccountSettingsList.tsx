"use client";

// Connect, re-sync and disconnect.
//
// Disconnect now goes through ConfirmDialog. v1 deleted a SocialAccount — and by
// cascade every post, snapshot, audience row and AI insight — on a single
// unguarded click, with no undo. The primitive existed and was unused.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { useToast } from "@/app/components/ui/Toast";
import { useSocialApi, type SocialApiError } from "./useSocialApi";

export interface ConnectableAccount {
  id: string;
  provider: string;
  label: string;
  followers: number | null;
  status: string;
  lastSyncedAt: string | null;
}

const PLATFORM: Record<string, { name: string; color: string; bg: string }> = {
  youtube: { name: "YouTube", color: "#ff0000", bg: "#ffe8e8" },
  instagram: { name: "Instagram", color: "#e1306c", bg: "#ffe8f1" },
  facebook: { name: "Facebook", color: "#1877f2", bg: "#e8f0ff" },
};

export function AccountSettingsList({
  accounts,
  providers,
}: {
  accounts: ConnectableAccount[];
  /** Every provider in the registry, each with whether it can be connected. */
  providers: Array<{ id: string; configured: boolean }>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const api = useSocialApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectableAccount | null>(null);

  // OAuth returns with ?connected= or ?error=; surface it then scrub the URL so
  // a refresh does not replay the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;

    if (connected) showToast(`${PLATFORM[connected]?.name ?? connected} connected`, "success");
    else showToast(OAUTH_ERRORS[error!] ?? "Couldn't connect that account.", "error");

    params.delete("connected");
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [showToast]);

  const connect = useCallback(
    async (provider: string) => {
      setBusy(provider);
      try {
        const { url } = await api<{ url: string }>(`/api/social/connect/${provider}`);
        window.location.href = url;
      } catch {
        showToast("Couldn't start the connection. Try again.", "error");
        setBusy(null);
      }
    },
    [api, showToast],
  );

  const resync = useCallback(
    async (account: ConnectableAccount) => {
      setBusy(account.id);
      try {
        await api(`/api/social/accounts/${account.id}`, { method: "POST" });
        showToast(`${account.label} re-synced`, "success");
        router.refresh();
      } catch (err) {
        // 429 is the per-account cooldown, not a failure worth alarming about.
        showToast(
          (err as SocialApiError).status === 429
            ? "Already refreshed recently — try again in a few minutes."
            : "Sync failed. The platform may be rate-limiting us.",
          (err as SocialApiError).status === 429 ? "info" : "error",
        );
      } finally {
        setBusy(null);
      }
    },
    [api, router, showToast],
  );

  const disconnect = useCallback(async () => {
    if (!pendingDisconnect) return;
    setBusy(pendingDisconnect.id);
    try {
      await api(`/api/social/accounts/${pendingDisconnect.id}`, { method: "DELETE" });
      showToast(`${pendingDisconnect.label} disconnected`, "success");
      router.refresh();
    } catch {
      showToast("Couldn't disconnect that account.", "error");
    } finally {
      setBusy(null);
      setPendingDisconnect(null);
    }
  }, [api, pendingDisconnect, router, showToast]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="connect-heading">
        <h2 id="connect-heading" className="mb-3 text-sm font-semibold text-ink">
          Connect an account
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {providers.map(({ id: p, configured }) => {
            const meta = PLATFORM[p] ?? { name: p, color: "#64748b", bg: "#f1f5f9" };
            const already = accounts.some((a) => a.provider === p);
            return (
              <div
                key={p}
                className={`flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 ${
                  configured
                    ? "border-card-border bg-white shadow-card"
                    : // Visibly inert, but still present: the platform exists,
                      // this deployment just cannot reach it yet.
                      "border-dashed border-card-border bg-surface"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                    style={{
                      background: meta.bg,
                      color: meta.color,
                      opacity: configured ? 1 : 0.45,
                    }}
                  >
                    {meta.name[0]}
                  </span>
                  <p className={`font-semibold ${configured ? "text-ink" : "text-ink-soft"}`}>
                    {meta.name}
                  </p>
                </div>

                {configured ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void connect(p)}
                    disabled={busy === p}
                  >
                    {busy === p ? "Connecting…" : already ? `Reconnect ${meta.name}` : `Connect ${meta.name}`}
                  </Button>
                ) : (
                  // Deliberately not a disabled button: there is nothing to
                  // click and nothing to wait for, and a greyed button invites
                  // the user to keep trying. State the reason instead.
                  <p className="text-xs text-ink-soft">
                    Not enabled on this deployment yet — {meta.name} needs its API credentials
                    configured before accounts can be connected.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {accounts.length > 0 && (
        <section aria-labelledby="connected-heading">
          <h2 id="connected-heading" className="mb-3 text-sm font-semibold text-ink">
            Connected accounts
          </h2>
          <ul className="space-y-3">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{a.label}</p>
                  <p className="text-xs text-ink-soft">
                    {PLATFORM[a.provider]?.name ?? a.provider}
                    {a.status === "needs_reauth" && " · needs reconnecting"}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void resync(a)}
                    disabled={busy === a.id}
                  >
                    {busy === a.id ? "Syncing…" : "Re-sync"}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setPendingDisconnect(a)}>
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title={`Disconnect ${pendingDisconnect?.label ?? ""}?`}
        // Names exactly what is lost. The cascade is correct behaviour for GDPR
        // erasure, but it is not reversible and the user should know that.
        message="This permanently deletes the account's tracked posts, follower history, audience data and AI insights. It cannot be undone, and reconnecting starts the history over."
        confirmLabel="Disconnect"
        danger
        onConfirm={disconnect}
        onClose={() => setPendingDisconnect(null)}
      />
    </div>
  );
}

/** OAuth callback error codes. Kept here until the i18n pass moves them. */
const OAUTH_ERRORS: Record<string, string> = {
  missing_code: "The platform didn't return an authorisation code.",
  bad_provider: "That platform isn't supported.",
  invalid_state: "That connection link expired. Please try again.",
  provider_mismatch: "The connection didn't match what we started. Please try again.",
  connect_failed: "The platform rejected the connection. Please try again.",
};
