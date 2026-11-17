"use client";

// Posts made or planned from Clipiro, each with the one thing it needs next.
//
//   your turn  → Download video · Copy caption · Mark as posted (paste link)
//   scheduled  → Reschedule · Cancel
//   failed     → Retry · Remove
//   posted     → View
//
// Instagram and Facebook can't be posted to automatically (that needs Meta
// App Review), so their posts become "your turn" when due. Until now the web
// had no way to see them at all — the schedule lived only in the mobile app.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPost } from "@clipiro/shared";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Modal } from "@/app/components/ui/Modal";
import { useToast } from "@/app/components/ui/Toast";
import { downloadFile } from "@/lib/download-file";
import { SocialApiError, useSocialApi } from "./useSocialApi";

export type PlannedPost = SocialPost & {
  /** A signed URL for the video, set only for "your turn" posts. */
  videoUrl: string | null;
};

const PROVIDER: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };

const STATUS: Record<SocialPost["status"], { label: string; cls: string }> = {
  your_turn: { label: "Your turn", cls: "bg-tint-amber text-warning" },
  scheduled: { label: "Scheduled", cls: "bg-surface-3 text-fg-muted" },
  posting: { label: "Uploading", cls: "bg-surface-3 text-fg-muted" },
  posted: { label: "Posted", cls: "bg-tint-emerald text-success" },
  failed: { label: "Failed", cls: "bg-tint-rose text-error" },
  missed: { label: "Missed", cls: "bg-tint-rose text-error" },
};

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function when(p: PlannedPost): string {
  const iso = p.status === "posted" ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt;
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function PlannedPosts({
  posts,
  compact = false,
  empty,
}: {
  posts: PlannedPost[];
  /** Overview's "Up next": one action per row, no secondary buttons. */
  compact?: boolean;
  empty: React.ReactNode;
}) {
  const router = useRouter();
  const api = useSocialApi();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<PlannedPost | null>(null);
  const [permalink, setPermalink] = useState("");
  const [rescheduling, setRescheduling] = useState<PlannedPost | null>(null);
  const [newTime, setNewTime] = useState("");
  const [removing, setRemoving] = useState<PlannedPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<unknown>, done: string) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      showToast(done, "success");
      router.refresh();
      return true;
    } catch (e) {
      const message = e instanceof SocialApiError ? e.message : "Something went wrong. Try again.";
      setError(message);
      showToast(message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption(p: PlannedPost) {
    const text = [p.caption.trim(), p.hashtags.join(" ")].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text || p.title);
      showToast("Caption copied", "success");
    } catch {
      showToast("Couldn't copy. Select the caption in the post instead.", "error");
    }
  }

  if (posts.length === 0) return <>{empty}</>;

  return (
    <>
      <ul className="divide-y divide-line">
        {posts.map((p) => {
          const s = STATUS[p.status];
          const name = PROVIDER[p.account.provider] ?? p.account.provider;
          const row = busy === p.id;
          return (
            <li key={p.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              {p.thumbnailUrl ? (
                // Plain img: signed S3/CDN URLs aren't in next/image's remotePatterns.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnailUrl} alt="" className="h-14 w-10 flex-shrink-0 rounded-md bg-surface-3 object-cover" />
              ) : (
                <span aria-hidden="true" className="h-14 w-10 flex-shrink-0 rounded-md bg-surface-3" />
              )}
              <div className={`flex min-w-0 flex-1 gap-x-3 gap-y-2 ${compact ? "flex-col" : "flex-wrap items-center"}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-fg">{p.title}</span>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {name} · {p.account.name}
                  {when(p) && (
                    <>
                      {" · "}
                      <time dateTime={p.scheduledAt ?? undefined} suppressHydrationWarning>
                        {when(p)}
                      </time>
                    </>
                  )}
                </p>
                {p.failureReason && <p className="mt-0.5 text-xs text-error">{p.failureReason}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {p.status === "your_turn" && (
                  <>
                    {!compact && p.videoUrl && (
                      <Button size="sm" variant="secondary" onClick={() => downloadFile(p.videoUrl!, `${p.title}.mp4`)}>
                        Download video
                      </Button>
                    )}
                    {!compact && (
                      <Button size="sm" variant="secondary" onClick={() => void copyCaption(p)}>
                        Copy caption
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setPermalink("");
                        setLinking(p);
                      }}
                      disabled={row}
                    >
                      Mark as posted
                    </Button>
                  </>
                )}
                {p.status === "scheduled" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={row}
                      onClick={() => {
                        setNewTime(p.scheduledAt ? toLocalInput(new Date(p.scheduledAt)) : "");
                        setRescheduling(p);
                      }}
                    >
                      Reschedule
                    </Button>
                    {!compact && (
                      <Button size="sm" variant="danger" disabled={row} onClick={() => setRemoving(p)}>
                        Cancel
                      </Button>
                    )}
                  </>
                )}
                {(p.status === "failed" || p.status === "missed") && (
                  <>
                    <Button
                      size="sm"
                      disabled={row}
                      onClick={() => void act(p.id, () => api(`/api/social/posts/${p.id}/retry`, { method: "POST" }), "Trying again now")}
                    >
                      {row ? "Retrying…" : "Retry"}
                    </Button>
                    {!compact && (
                      <Button size="sm" variant="danger" disabled={row} onClick={() => setRemoving(p)}>
                        Remove
                      </Button>
                    )}
                  </>
                )}
                {p.status === "posted" && p.permalink && (
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}

      <Modal open={linking !== null} onClose={() => setLinking(null)} title="Mark as posted">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linking) return;
            const target = linking;
            void act(
              target.id,
              () => api(`/api/social/posts/${target.id}/link`, { method: "POST", body: JSON.stringify({ permalink: permalink.trim() }) }),
              "Linked. Its numbers appear after the next sync.",
            ).then((ok) => ok && setLinking(null));
          }}
        >
          <p className="text-sm text-fg-muted">
            Paste the link to your {linking ? (PROVIDER[linking.account.provider] ?? "") : ""} post so Clipiro can track how
            it does.
          </p>
          <input
            id="post-permalink"
            type="url"
            required
            autoFocus
            value={permalink}
            onChange={(e) => setPermalink(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            aria-label="Post link"
            className="w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm text-fg"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" type="button" onClick={() => setLinking(null)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={busy === linking?.id}>
              Save link
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={rescheduling !== null} onClose={() => setRescheduling(null)} title="Reschedule">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rescheduling || !newTime) return;
            const target = rescheduling;
            void act(
              target.id,
              () =>
                api(`/api/social/posts/${target.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ scheduledAt: new Date(newTime).toISOString() }),
                }),
              "Rescheduled",
            ).then((ok) => ok && setRescheduling(null));
          }}
        >
          <label htmlFor="post-new-time" className="block text-sm text-fg-muted">
            New time
          </label>
          <input
            id="post-new-time"
            type="datetime-local"
            required
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm text-fg"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" type="button" onClick={() => setRescheduling(null)}>
              Keep current time
            </Button>
            <Button size="sm" type="submit" loading={busy === rescheduling?.id}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title={removing?.status === "scheduled" ? "Cancel this post?" : "Remove this post?"}
        message={
          removing?.status === "scheduled"
            ? "It won't be posted. The video stays in your clips."
            : "This removes it from Clipiro only. Nothing on the platform changes."
        }
        confirmLabel={removing?.status === "scheduled" ? "Cancel post" : "Remove"}
        danger
        onConfirm={async () => {
          if (!removing) return;
          const target = removing;
          setRemoving(null);
          await act(
            target.id,
            () => api(`/api/social/posts/${target.id}`, { method: "DELETE" }),
            target.status === "scheduled" ? "Post cancelled" : "Removed",
          );
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
