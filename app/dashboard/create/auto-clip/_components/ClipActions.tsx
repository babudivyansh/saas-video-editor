"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef, useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { registerAsset, type AssetRow } from "@/app/dashboard/editor/components/panels/shared/assetData";
import { IcMore, apiFetch, ClipItem, publishStatusLabel } from "./shared";

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
              {d.status === "ready" && d.videoUrl ? <a href={d.videoUrl} download className="text-brand font-semibold">Download</a> : <span className="capitalize text-ink-soft/60">{d.status}</span>}
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

export function PublishPanel({ projectId, clip, embedded }: { projectId: string; clip: ClipItem; embedded?: boolean }) {
  const [open, setOpen] = useState(!!embedded);
  const [accountId, setAccountId] = useState("");
  const [permalink, setPermalink] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [minSchedule] = useState(() => new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16));

  const publishQuery = useQuery({
    queryKey: ["auto-clip-publish", projectId, clip.id],
    queryFn: () => apiFetch<{ accounts: PublishAccount[]; publishes: PublishItem[] }>(`/api/projects/${projectId}/clips/${clip.id}/publish`),
    enabled: open,
  });
  const accounts = publishQuery.data?.accounts ?? NO_ACCOUNTS;
  const publishes = publishQuery.data?.publishes ?? NO_PUBLISHES;

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isYoutube = selectedAccount?.provider === "youtube";

  const publishMutation = useMutation({
    mutationFn: (body: { permalink?: string; scheduledFor?: string }) =>
      apiFetch(`/api/projects/${projectId}/clips/${clip.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ socialAccountId: accountId, ...body }),
      }),
    onSuccess: () => {
      setPermalink("");
      publishQuery.refetch();
    },
  });
  const err = publishMutation.error instanceof Error ? publishMutation.error.message : null;
  const needsReauth = !!err && /reconnect/i.test(err);
  function submit(body: { permalink?: string; scheduledFor?: string }) {
    if (!accountId) return;
    publishMutation.mutate(body);
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Publish or schedule</button>;
  }
  return (
    <div className="w-full space-y-3">
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-card-border p-3">
          <p className="text-xs text-ink-soft">Connect a social account in <a href="/dashboard/social-tracker" className="text-brand font-semibold">Social Tracker</a> first to publish directly.</p>
        </div>
      ) : (
        <>
          <div>
            <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-2">Publish directly</h4>
            <div className="rounded-xl border border-card-border p-3 space-y-2.5">
              <select aria-label="Account to publish to" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs bg-panel">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.displayName ?? a.username ?? a.id.slice(0, 6)}</option>)}
              </select>
              {isYoutube ? (
                <>
                  <p className="text-[10px] text-ink-soft/70">Uploads this clip directly to YouTube as Unlisted — change visibility on YouTube afterward if you want it Public.</p>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-ink-soft block">Schedule for later (optional)</label>
                    <input type="datetime-local" value={scheduledFor} min={minSchedule} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
                  </div>
                  {err && <p className="text-[11px] text-error">{err} {needsReauth && <a href="/dashboard/social-tracker" className="underline font-semibold">Reconnect →</a>}</p>}
                  <button onClick={() => submit(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {})} disabled={publishMutation.isPending} className="w-full min-h-[40px] text-xs font-bold rounded-lg grad-brand text-on-primary shadow-glow disabled:opacity-50">
                    {publishMutation.isPending ? "Working…" : scheduledFor ? "Schedule upload" : "Publish to YouTube"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[10px] text-ink-soft/70">Instagram/Facebook auto-publish needs a Meta app review this app hasn&apos;t completed — post it yourself, then paste the link here to track its performance.</p>
                  <input value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="Paste the live post URL after posting manually" className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
                  {err && <p className="text-[11px] text-error">{err}</p>}
                  <button onClick={() => submit({ permalink: permalink || undefined })} disabled={publishMutation.isPending} className="w-full min-h-[40px] text-xs font-bold rounded-lg grad-brand text-on-primary shadow-glow disabled:opacity-50">{publishMutation.isPending ? "…" : "Save link"}</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {publishes.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-card-border">
          {publishes.map((p) => (
            <li key={p.id} className="text-[11px] text-ink-soft flex items-center justify-between gap-2">
              <span className="truncate">{p.socialAccount.provider} — {p.socialAccount.username ?? "linked"}</span>
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="text-brand font-semibold shrink-0">View</a> : <span className="text-ink-soft/60 shrink-0">{publishStatusLabel(p.status)}</span>}
            </li>
          ))}
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

// A small popover menu anchored to a trigger. Closes on outside-click / Esc.
export function OverflowMenu({ children, ariaLabel = "More actions", align = "right" }: { children: (close: () => void) => ReactNode; ariaLabel?: string; align?: "right" | "left" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-8 h-8 flex-shrink-0 rounded-lg border border-card-border bg-panel text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"
      >
        <IcMore />
      </button>
      {open && (
        <div role="menu" className={`ac-pop absolute z-30 mt-1 w-52 rounded-xl border border-card-border bg-panel p-1.5 shadow-card ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

