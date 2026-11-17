"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { registerAsset, type AssetRow } from "@/app/dashboard/editor/components/panels/shared/assetData";
import { apiFetch, ClipItem, publishStatusLabel } from "./shared";
import { downloadHref } from "@/lib/download-file";

// Stable empty fallbacks. An inline `?? []` is a NEW array every render, so
// the effects that depend on these re-ran on every render (and on every poll
// tick) — react-hooks/exhaustive-deps flagged exactly this.
const NO_LANGS: DubLang[] = [];
const NO_DUBS: DubItem[] = [];
const NO_ACCOUNTS: PublishAccount[] = [];
const NO_PUBLISHES: PublishItem[] = [];

// ── Per-clip actions (ready clips): edit-in-editor, dub, publish ─────────────
export function EditInEditorButton({ projectId, clip, className }: { projectId: string; clip: ClipItem; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { editorProjectId, asset } = await apiFetch<{ editorProjectId: string; asset: AssetRow }>(`/api/projects/${projectId}/clips/${clip.id}/edit-in-editor`, { method: "POST" });
      registerAsset(asset);
      router.push(`/dashboard/editor?projectId=${editorProjectId}`);
    } catch {
      setBusy(false);
    }
  }
  return <button onClick={go} disabled={busy} className={className ?? "text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50"}>{busy ? "Opening…" : "Advanced editor →"}</button>;
}

export interface DubItem { id: string; targetLang: string; status: string; videoUrl: string | null }
export interface DubLang { code: string; label: string }

export function DubPanel({ projectId, clip, embedded }: { projectId: string; clip: ClipItem; embedded?: boolean }) {
  const [open, setOpen] = useState(!!embedded);
  const [selected, setSelected] = useState("");

  const dubQuery = useQuery({
    queryKey: ["auto-clip-dubs", projectId, clip.id],
    queryFn: () => apiFetch<{ dubs: DubItem[]; languages: DubLang[] }>(`/api/projects/${projectId}/clips/${clip.id}/dub`),
    enabled: open,
    // Only keep polling while a dub is actually in flight — re-evaluated on
    // every fetch, so it starts/stops itself as statuses change, rather than
    // the previous setInterval keyed off a snapshot taken when it was set up.
    refetchInterval: (query) => (query.state.data?.dubs?.some((d) => d.status === "dubbing") ? 4000 : false),
  });
  const langs = dubQuery.data?.languages ?? NO_LANGS;
  const dubs = dubQuery.data?.dubs ?? NO_DUBS;

  useEffect(() => {
    if (!selected && langs[0]) setSelected(langs[0].code);
  }, [langs, selected]);

  const startDubMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/clips/${clip.id}/dub`, { method: "POST", body: JSON.stringify({ targetLang: selected }) }),
    onSuccess: () => dubQuery.refetch(),
  });

  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Dub into another language</button>;
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-card-border p-3">
      <div className="flex items-center gap-2">
        <select aria-label="Dub language" value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 rounded-lg border border-card-border px-2 py-1.5 text-xs bg-panel">
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button onClick={() => startDubMutation.mutate()} disabled={startDubMutation.isPending} className="text-xs font-semibold py-1.5 px-3 rounded-lg grad-brand text-on-primary shadow-glow disabled:opacity-50">{startDubMutation.isPending ? "…" : "Dub (1 credit)"}</button>
      </div>
      {startDubMutation.isError && <p className="text-[11px] text-error">{startDubMutation.error instanceof Error ? startDubMutation.error.message : "Failed"}</p>}
      {dubs.length > 0 && (
        <ul className="space-y-1">
          {dubs.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-[11px] text-ink-soft">
              <span>{langs.find((l) => l.code === d.targetLang)?.label ?? d.targetLang}</span>
              {d.status === "ready" && d.videoUrl ? <a href={downloadHref(d.videoUrl, `clip-${d.targetLang}.mp4`)} download className="text-brand font-semibold">Download</a> : <span className="capitalize text-ink-soft/60">{d.status}</span>}
            </li>
          ))}
        </ul>
      )}
      {!embedded && <button onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-soft/70">Close</button>}
    </div>
  );
}

export interface PublishAccount { id: string; provider: string; username: string | null; displayName: string | null }
export interface PublishItem { id: string; permalink: string | null; status: string; socialAccount: { provider: string; username: string | null } }

// Posting goes through the one composer (/dashboard/social-tracker/new), which
// also does captions, several accounts at once and best-time slots. This panel
// opens it with the clip chosen, and lists where the clip has already gone.
export function PublishPanel({ projectId, clip, embedded }: { projectId: string; clip: ClipItem; embedded?: boolean }) {
  const [open, setOpen] = useState(!!embedded);

  const publishQuery = useQuery({
    queryKey: ["auto-clip-publish", projectId, clip.id],
    queryFn: () => apiFetch<{ accounts: PublishAccount[]; publishes: PublishItem[] }>(`/api/projects/${projectId}/clips/${clip.id}/publish`),
    enabled: open,
  });
  const accounts = publishQuery.data?.accounts ?? NO_ACCOUNTS;
  const publishes = publishQuery.data?.publishes ?? NO_PUBLISHES;

  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Publish or schedule</button>;
  }
  return (
    <div className="w-full space-y-3">
      {publishQuery.isSuccess && accounts.length === 0 ? (
        <div className="rounded-xl border border-card-border p-3">
          <p className="text-xs text-ink-soft">Connect a social account in <a href="/dashboard/social-tracker/settings" className="text-brand font-semibold">Social settings</a> first to publish directly.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <a
            href={`/dashboard/social-tracker/new?clip=${encodeURIComponent(clip.id)}`}
            className="flex w-full min-h-[40px] items-center justify-center text-xs font-bold rounded-lg grad-brand text-on-primary shadow-glow"
          >
            Post or schedule this clip
          </a>
          <p className="text-[10px] text-ink-soft/70">YouTube uploads for you. Instagram and Facebook land in your Posts with the video and caption ready to share.</p>
        </div>
      )}
      {publishes.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-card-border">
          {publishes.map((p) => (
            <li key={p.id} className="text-[11px] text-ink-soft flex items-center justify-between gap-2">
              <span className="truncate">{p.socialAccount.provider} — {p.socialAccount.username ?? "linked"}</span>
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="text-brand font-semibold shrink-0">View</a> : <span className="text-ink-soft/60 shrink-0">{publishStatusLabel(p.status)}</span>}
            </li>
          ))}
          <li>
            <a href="/dashboard/social-tracker/posts?filter=scheduled" className="text-[11px] font-semibold text-brand">See all posts →</a>
          </li>
        </ul>
      )}
      {!embedded && <button onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-soft/70">Close</button>}
    </div>
  );
}

export function RetryClipButton({ projectId, clip, onQueued }: { projectId: string; clip: ClipItem; onQueued: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/rerender`, {
        method: "POST",
        body: JSON.stringify({ startSec: clip.startSec, endSec: clip.endSec }),
      });
      onQueued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {/* States its price: a retry is a re-render, free the first time and
          charged after. It said only "Retry". */}
      <button onClick={retry} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-panel border border-line hover:bg-surface-2 text-fg transition-colors disabled:opacity-50">
        {busy ? "Retrying…" : clip.rerenderCount === 0 ? "Retry (free)" : "Retry (1 credit)"}
      </button>
      {err && <span className="text-[10px] text-error">{err}</span>}
    </div>
  );
}

// ── Subtitle styling helpers (ASS colour packing) ────────────────────────────
// Moved to lib/ass-color.ts so the caption style grid can render swatches
// without importing this 2,200-line page. Re-exported nowhere — the grid
// imports the leaf module directly.

