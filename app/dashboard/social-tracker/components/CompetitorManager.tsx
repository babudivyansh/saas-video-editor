"use client";

// Add and remove tracked competitor profiles.
//
// v1 had no confirmation on remove and no error handling at all — a failed
// delete looked identical to a successful one.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FieldLabel, Input } from "@/app/components/ui/Field";
import { useToast } from "@/app/components/ui/Toast";
import { useSocialApi } from "./useSocialApi";

export interface TrackedCompetitor {
  id: string;
  handle: string;
  provider: string;
}

const PROVIDERS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
] as const;

export function CompetitorManager({
  existing,
  enabled,
}: {
  existing: TrackedCompetitor[];
  enabled: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const api = useSocialApi();
  const [provider, setProvider] = useState<string>("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TrackedCompetitor | null>(null);

  const add = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!handle.trim()) return;
      setBusy(true);
      try {
        await api("/api/social/competitors", {
          method: "POST",
          body: JSON.stringify({ provider, handle: handle.trim() }),
        });
        showToast(`Now tracking @${handle.replace(/^@/, "")}`, "success");
        setHandle("");
        router.refresh();
      } catch (err) {
        showToast((err as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [api, handle, provider, router, showToast],
  );

  const remove = useCallback(async () => {
    if (!pendingRemove) return;
    setBusy(true);
    try {
      await api(`/api/social/competitors/${pendingRemove.id}`, { method: "DELETE" });
      showToast(`Stopped tracking @${pendingRemove.handle}`, "success");
      router.refresh();
    } catch {
      showToast("Couldn't stop tracking that profile.", "error");
    } finally {
      setBusy(false);
      setPendingRemove(null);
    }
  }, [api, pendingRemove, router, showToast]);

  return (
    <section
      aria-labelledby="competitors-heading"
      className="rounded-[var(--radius-card)] border border-card-border bg-white p-4 shadow-card"
    >
      <h2 id="competitors-heading" className="text-sm font-semibold text-ink">
        Tracked profiles
      </h2>

      {existing.length === 0 ? (
        // The add form below is hidden when the provider is unconfigured, so
        // telling people to "add a public profile" pointed at a control that
        // was not on the page. Say which of the two situations they are in.
        <p className="mt-2 text-sm text-ink-soft">
          {enabled
            ? "Not tracking anyone yet. Add a public profile to compare follower growth and posting cadence against your own."
            : "Not tracking anyone yet, and competitor tracking can't be set up on this deployment until a public-data provider is configured."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {existing.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-full border border-card-border px-3 py-1 text-xs"
            >
              <span className="text-ink">@{c.handle}</span>
              <span className="text-ink-soft">{c.provider}</span>
              <button
                type="button"
                onClick={() => setPendingRemove(c)}
                aria-label={`Stop tracking @${c.handle}`}
                className="cursor-pointer rounded-full px-1 text-ink-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {enabled && (
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <FieldLabel htmlFor="competitor-provider">Platform</FieldLabel>
            <select
              id="competitor-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-xl border border-card-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem] flex-1">
            {/* A visible label, not a placeholder standing in for one. */}
            <FieldLabel htmlFor="competitor-handle">Public handle</FieldLabel>
            <Input
              id="competitor-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@creator"
              maxLength={61}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !handle.trim()}>
            {busy ? "Adding…" : "Track profile"}
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Stop tracking @${pendingRemove?.handle ?? ""}?`}
        message="Their recorded follower history will be deleted. You can add the profile again later, but the history starts over."
        confirmLabel="Stop tracking"
        danger
        onConfirm={remove}
        onClose={() => setPendingRemove(null)}
      />
    </section>
  );
}
