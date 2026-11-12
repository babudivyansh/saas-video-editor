"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { EmptyState } from "@/app/components/ui/EmptyState";

// "Use as clip thumbnail": pick one of the user's finished clips and the
// current photo becomes its cover (POST /api/tools/photo-edit/set-thumbnail).
// Full-screen like the Assets picker: the app opens no side drawers.

interface ClipRow {
  id: string;
  title: string | null;
  index: number;
  projectTitle: string | null;
  aspectRatio: string | null;
  thumbnailUrl: string | null;
}

export function ClipThumbnailPicker({ open, onClose, assetId, headers }: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  headers: Record<string, string>;
}) {
  const [clips, setClips] = useState<ClipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClips(null);
    setError(null);
    setDoneId(null);
    fetch("/api/clips?status=ready&limit=48", { headers, credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Your clips didn't load.");
        if (!cancelled) setClips(data.clips ?? []);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Your clips didn't load."); });
    return () => { cancelled = true; };
    // headers is rebuilt every render; the list only needs loading on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function choose(clip: ClipRow) {
    if (savingId) return;
    setSavingId(clip.id);
    setError(null);
    try {
      const res = await fetch("/api/tools/photo-edit/set-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({ assetId, clipId: clip.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The thumbnail wasn't changed.");
      setClips((prev) => prev?.map((c) => (c.id === clip.id ? { ...c, thumbnailUrl: data.thumbnailUrl ?? c.thumbnailUrl } : c)) ?? prev);
      setDoneId(clip.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The thumbnail wasn't changed.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Use as clip thumbnail" variant="fullscreen" maxWidth="max-w-5xl">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-fg-muted">
          Pick a clip. The photo is cropped to the clip&apos;s shape and becomes its cover. Re-rendering the clip later puts a video frame back.
        </p>
        {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
        {doneId && <p role="status" className="text-[13px] text-success">Thumbnail updated.</p>}
        {clips === null && !error ? (
          <p className="text-[13px] text-fg-subtle">Loading your clips…</p>
        ) : clips && clips.length === 0 ? (
          <EmptyState
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 9l4 3-4 3z" /></svg>}
            title="No finished clips yet"
            subtitle="Run AutoClip on a video first, then come back to give a clip this cover."
            action={{ label: "Open AutoClip", href: "/dashboard/create/auto-clip" }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(clips ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void choose(c)}
                  disabled={savingId !== null}
                  className={`flex w-full flex-col overflow-hidden rounded-xl border-2 bg-surface-1 text-left transition-colors disabled:opacity-60 ${doneId === c.id ? "border-primary" : "border-line hover:border-line-strong"}`}
                >
                  <span className="relative block aspect-[9/16] w-full bg-surface-2">
                    {c.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {savingId === c.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[12px] font-semibold text-white">Saving…</span>
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 p-2.5">
                    <span className="truncate text-[13px] font-semibold text-fg">{c.title || `Clip ${c.index + 1}`}</span>
                    <span className="truncate text-[11.5px] text-fg-subtle">{c.projectTitle ?? "Project"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
