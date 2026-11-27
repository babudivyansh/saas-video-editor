"use client";

// Content review: every video/image users put on Clipiro, watchable here.
// Flagged = the automated scan's hits (hidden from the owner until approved);
// Uploads / Clips = everything not yet watched by an admin; Reviewed = done.
// Open one to play it full screen, then Approve (A) or Remove; approving moves
// straight on to the next item so the queue drains without extra clicks.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Film, ImageIcon, ShieldAlert, Trash2 } from "lucide-react";
import AdminShell from "../../AdminShell";
import { ErrorCard } from "../../dashboard/ui";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Modal } from "@/app/components/ui/Modal";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useToast } from "@/app/components/ui/Toast";

type Kind = "asset" | "clip";
type Filter = "flagged" | "pending" | "reviewed";

interface Item {
  id: string;
  kind: Kind;
  mediaKind: "video" | "image";
  title: string;
  detail: string;
  thumbnailUrl: string | null;
  moderationStatus: string | null;
  labels: Array<{ name: string; confidence: number }>;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: string;
  reviewedAt: string | null;
  owner: { id: string; email: string };
}

interface Page {
  items: Item[];
  nextCursor: string | null;
  counts: { flagged: number; pendingAssets: number; pendingClips: number };
}

const TABS: Array<{ id: string; label: string; kind: Kind; filter: Filter; count?: keyof Page["counts"] }> = [
  { id: "flagged", label: "Flagged by scan", kind: "asset", filter: "flagged", count: "flagged" },
  { id: "uploads", label: "Uploads to review", kind: "asset", filter: "pending", count: "pendingAssets" },
  { id: "clips", label: "Clips to review", kind: "clip", filter: "pending", count: "pendingClips" },
  { id: "reviewed-uploads", label: "Reviewed uploads", kind: "asset", filter: "reviewed" },
  { id: "reviewed-clips", label: "Reviewed clips", kind: "clip", filter: "reviewed" },
];

const fmtDuration = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const fmtBytes = (b: number | null) =>
  b == null ? null : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

export default function AdminContentReviewPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);
  const [tabId, setTabId] = useState("flagged");
  const tab = TABS.find((t) => t.id === tabId)!;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ["admin-review", tab.kind, tab.filter],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ kind: tab.kind, filter: tab.filter, cursor: pageParam });
      const res = await fetch(`/api/admin/content/review?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load the review queue");
      return (await res.json()) as Page;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!token,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = q.data?.pages[0]?.counts;
  const open = openIndex != null ? items[openIndex] ?? null : null;

  async function act(item: Item, action: "approve" | "remove", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content/review", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ kind: item.kind, id: item.id, action, ...(reason ? { reason } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.issues?.[0]?.message ?? d.error ?? "Action failed");
      showToast(action === "approve" ? "Approved" : "Removed with its files", "success");
      // Optimistically drop it from this tab so the next item slides into the
      // same index — that's what makes "approve → next" work.
      if (tab.filter !== "reviewed" || action === "remove") {
        queryClient.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(["admin-review", tab.kind, tab.filter], (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p, pi) => ({
                  ...p,
                  items: p.items.filter((i) => i.id !== item.id),
                  // The tab badge reads page 0's counts; keep it in step.
                  counts: pi === 0 && tab.count ? { ...p.counts, [tab.count]: Math.max(0, p.counts[tab.count] - 1) } : p.counts,
                })),
              }
            : old,
        );
        if (openIndex != null && openIndex >= items.length - 1) setOpenIndex(items.length - 1 > 0 ? openIndex - 1 : null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-review"], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["admin-assets"] }),
      ]);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Content review" wide>
      <p className="text-sm text-fg-muted mb-4 max-w-3xl">
        Every video and image users upload or create with AutoClip. Open one to watch it, then approve it or remove it.
        Items the automatic scan flagged are hidden from their owner until you approve them; everything else stays live while it waits here.{" "}
        <Link href="/admin/content" className="text-brand hover:underline">Storage &amp; sweeps →</Link>
      </p>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Review queue">
        {TABS.map((t) => {
          const active = t.id === tabId;
          const n = t.count && counts ? counts[t.count] : null;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTabId(t.id);
                setOpenIndex(null);
              }}
              className={`text-xs font-semibold rounded-full border px-3 py-1.5 min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
              {n != null && active === false && n > 0 ? <span className="ml-1.5 text-fg-subtle">{n.toLocaleString()}</span> : null}
              {n != null && active ? <span className="ml-1.5">{n.toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>

      {q.isError ? (
        <ErrorCard onRetry={q.refetch} />
      ) : q.isLoading ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }, (_, i) => <li key={i} className="aspect-[9/16] max-h-72 rounded-xl bg-surface-3 animate-pulse" />)}
        </ul>
      ) : items.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-fg-subtle">{tab.filter === "reviewed" ? "Nothing reviewed yet." : "All caught up — nothing waiting here."}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className="group w-full text-left rounded-xl border border-line bg-surface-2 overflow-hidden hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="relative aspect-video bg-surface-3 flex items-center justify-center">
                  {it.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a static asset
                    <img src={it.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  ) : it.mediaKind === "image" ? (
                    <ImageIcon className="w-6 h-6 text-fg-subtle" aria-hidden />
                  ) : (
                    <Film className="w-6 h-6 text-fg-subtle" aria-hidden />
                  )}
                  {it.moderationStatus === "flagged" && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-error/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <ShieldAlert className="w-3 h-3" aria-hidden /> Flagged
                    </span>
                  )}
                  {fmtDuration(it.durationSec) && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{fmtDuration(it.durationSec)}</span>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-semibold text-fg truncate" title={it.title}>{it.title}</p>
                  <p className="text-[11px] text-fg-subtle truncate">{it.owner.email}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-4">
          <Button size="sm" variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>
        </div>
      )}

      <ReviewPlayer
        item={open}
        position={openIndex != null ? `${openIndex + 1} of ${items.length}${q.hasNextPage ? "+" : ""}` : ""}
        headers={headers}
        busy={busy}
        canPrev={openIndex != null && openIndex > 0}
        canNext={openIndex != null && openIndex < items.length - 1}
        onPrev={() => setOpenIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() => {
          setOpenIndex((i) => (i != null && i < items.length - 1 ? i + 1 : i));
          if (openIndex != null && openIndex >= items.length - 3 && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        onApprove={(it) => act(it, "approve")}
        onRemove={(it) => setRemoving(it)}
        onClose={() => setOpenIndex(null)}
      />

      <ConfirmDialog
        open={!!removing}
        title={removing?.kind === "clip" ? "Remove clip" : "Remove upload"}
        message={`Delete “${removing?.title ?? ""}” and its stored file? ${removing?.owner.email ?? "The owner"} loses it permanently.`}
        confirmLabel="Remove"
        danger
        requireReason
        onConfirm={({ reason }) => (removing ? act(removing, "remove", reason) : undefined)}
        onClose={() => setRemoving(null)}
      />
    </AdminShell>
  );
}

function ReviewPlayer({
  item, position, headers, busy, canPrev, canNext, onPrev, onNext, onApprove, onRemove, onClose,
}: {
  item: Item | null;
  position: string;
  headers: () => Record<string, string>;
  busy: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onApprove: (it: Item) => void;
  onRemove: (it: Item) => void;
  onClose: () => void;
}) {
  const media = useQuery({
    queryKey: ["admin-review-media", item?.kind, item?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/content/review/media?${new URLSearchParams({ kind: item!.kind, id: item!.id })}`, { headers: headers() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't load the media");
      return d as { url: string; mimeType: string };
    },
    enabled: !!item,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // A = approve, ←/→ = previous/next. Ignored while typing (none here, but the
  // remove dialog's reason box sits on top of this modal).
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" && canNext) onNext();
      else if (e.key === "ArrowLeft" && canPrev) onPrev();
      else if ((e.key === "a" || e.key === "A") && !busy && !item.reviewedAt) onApprove(item);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, busy, canNext, canPrev, onNext, onPrev, onApprove]);

  return (
    <Modal open={!!item} onClose={onClose} variant="fullscreen" title={item?.title ?? "Review"}>
      {item && (
        <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0">
          <div className="flex-1 min-h-[50vh] rounded-xl bg-black flex items-center justify-center overflow-hidden">
            {media.isLoading ? (
              <p className="text-sm text-fg-subtle">Loading…</p>
            ) : media.isError ? (
              <p className="text-sm text-error">{(media.error as Error).message}</p>
            ) : media.data && item.mediaKind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL
              <img src={media.data.url} alt={item.title} className="max-h-[75vh] max-w-full object-contain" />
            ) : media.data ? (
              <video key={media.data.url} src={media.data.url} controls autoPlay playsInline className="max-h-[75vh] max-w-full" />
            ) : null}
          </div>

          <aside className="lg:w-80 shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <span>{position}</span>
              <span className="flex gap-1">
                <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous item" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-line text-fg hover:border-brand disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next item" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-line text-fg hover:border-brand disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ChevronRight className="w-4 h-4" /></button>
              </span>
            </div>

            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-[11px] font-semibold text-fg-subtle">Owner</dt>
                <dd><Link href={`/admin/users/${item.owner.id}`} className="text-brand hover:underline break-all">{item.owner.email}</Link></dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-fg-subtle">Details</dt>
                <dd className="text-fg-muted">
                  {[item.detail, fmtDuration(item.durationSec), fmtBytes(item.sizeBytes)].filter(Boolean).join(" · ")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold text-fg-subtle">Created</dt>
                <dd className="text-fg-muted">{new Date(item.createdAt).toLocaleString("en-IN")}</dd>
              </div>
              {item.kind === "asset" && (
                <div>
                  <dt className="text-[11px] font-semibold text-fg-subtle">Automatic scan</dt>
                  <dd className="flex flex-wrap gap-1.5 mt-0.5">
                    <StatusBadge tone={item.moderationStatus === "flagged" ? "error" : item.moderationStatus === "clean" ? "success" : "neutral"}>
                      {item.moderationStatus ?? "—"}
                    </StatusBadge>
                  </dd>
                  {item.labels.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
                      {item.labels.map((l) => (
                        <li key={l.name} className="flex justify-between gap-2"><span>{l.name}</span><span className="text-fg-subtle">{l.confidence.toFixed(0)}%</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {item.reviewedAt && (
                <div>
                  <dt className="text-[11px] font-semibold text-fg-subtle">Reviewed</dt>
                  <dd className="text-fg-muted">{new Date(item.reviewedAt).toLocaleString("en-IN")}</dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col gap-2 mt-auto">
              {!item.reviewedAt && (
                <Button onClick={() => onApprove(item)} loading={busy} icon={<Check className="w-4 h-4" />}>
                  {item.moderationStatus === "flagged" ? "Approve — return to owner" : "Approve"}
                  <kbd className="ml-2 text-[10px] opacity-70">A</kbd>
                </Button>
              )}
              <Button variant="danger" onClick={() => onRemove(item)} disabled={busy} icon={<Trash2 className="w-4 h-4" />}>Remove</Button>
              <p className="text-[11px] text-fg-subtle">Each view and decision is recorded in the Audit Log.</p>
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}
