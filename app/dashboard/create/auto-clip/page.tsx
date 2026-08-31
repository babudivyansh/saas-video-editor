"use client";
import { Suspense, useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import SubtitleStylePicker from "@/app/components/SubtitleStylePicker";
import { ReframeAndCutsControls } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { LiteEditTab, type LiteEdits } from "@/app/components/auto-clip/LiteEditTab";
import { CaptionTemplatePicker, TranslateCaptions } from "@/app/components/auto-clip/CaptionTemplatePicker";
import { CAPTION_TEMPLATES } from "@/lib/caption-templates";
import { UrlImportField } from "@/app/components/auto-clip/UrlImportField";
import { ScorePerformanceBanner } from "@/app/components/auto-clip/ScorePerformanceBanner";
import { Switch } from "@/app/components/ui/Switch";
import { Button } from "@/app/components/ui/Button";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useVideoGenerate, getStoredToken, type GenerateStatus } from "@/app/hooks/useVideoGenerate";
import { registerAsset, type AssetRow } from "@/app/dashboard/editor/components/panels/shared/assetData";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";

// ── Icons ────────────────────────────────────────────────────────────────────
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcCloud() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
}
function IcFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>;
}
function IcChevronLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>;
}
function IcChevronRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z" /></svg>;
}
function IcWarning() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>;
}
function IcMore() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>;
}
function IcClock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}

const AUTH_HEADERS = () => ({ Authorization: `Bearer ${getStoredToken() ?? ""}` });

class ApiError extends Error {
  status: number;
  body: { error?: string; required?: number; balance?: number };
  constructor(status: number, body: { error?: string; required?: number; balance?: number }) {
    super(body.error ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...AUTH_HEADERS(), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data as { error?: string });
  return data as T;
}

type SortKey = "score" | "order" | "duration";

const WARNING_COPY: Record<string, string> = {
  transcription_failed: "We couldn't transcribe this video, so the AI never read its content — clip moments are spaced out rather than chosen, and the titles, captions and insights are generic placeholders you should replace. There are no burned-in subtitles.",
  reframe_unavailable: "No faces were detected in this video, so clips use a centered crop instead of following a speaker.",
  reframe_failed: "Speaker tracking couldn't run on our side, so clips use a centered crop. This affects every video until it's fixed — please report it if it persists.",
};

// ── Shared types ─────────────────────────────────────────────────────────────
interface ScoreBreakdown {
  hook: number; pacing: number; payoff: number; engagement: number;
  audio: number; speechRate: number; composite: number;
}
export interface ClipItem {
  id: string;
  index: number;
  title: string | null;
  startSec: number;
  endSec: number;
  durationSec: number;
  aspectRatio: string;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  mood: string | null;
  status: string; // pending_review | queued | rendering | ready | failed
  progress: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  hasCaptions: boolean;
  captionStyleIndex: number | null;
  brollQuery: string | null;
  subtitleStyleOverride: Record<string, unknown> | null;
  silenceSettings: Record<string, unknown> | null;
  liteEdits: LiteEdits | null;
  audioPeaks: number[] | null;
  rerenderCount: number;
}
interface ScoreBreakdownWithInsights extends ScoreBreakdown {
  reasoning?: string;
  hookExplanation?: string;
  retentionPrediction?: string;
  audience?: string;
  platform?: string;
  suggestedPostingTime?: string;
  hashtags?: string[];
  suggestedCaption?: string;
}

// Every "Apply" in the workspace re-renders the clip. The first re-render of
// each clip is free; after that it costs a credit.
function RerenderCostNote({ clip }: { clip: ClipItem }) {
  return (
    <p className="text-[11px] text-ink-soft text-center">
      {clip.rerenderCount === 0
        ? "Your first re-render of this clip is free."
        : "Applying changes re-renders this clip (1 credit)."}
    </p>
  );
}
export interface ProjectMeta { status: string; warnings: string[] | null; failureReason: string | null; captionStyleIndex: number | null; uploadedVideoUrl: string | null }
interface CostEstimate {
  clipCount: number; totalDurationSec: number;
  gross: number; analysisCredit: number; total: number;
  balance: number; sufficient: boolean;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// A single number badge means nothing on its own. A labelled band + icon + colour
// makes the keep/post decision scannable, and survives colour-blindness/greyscale.
function scoreBand(score: number | null): { label: string; icon: string; text: string; bg: string; border: string } {
  if (score != null && score >= 75) return { label: "High potential", icon: "▲", text: "#15803d", bg: "#ecfdf5", border: "#d1fae5" };
  if (score != null && score >= 50) return { label: "Good potential", icon: "◆", text: "#a16207", bg: "#fffbeb", border: "#fde68a" };
  return { label: "Needs review", icon: "•", text: "#475569", bg: "#f1f5f9", border: "#e5e7eb" };
}
function arCss(aspect: string): string {
  return aspect === "16:9" ? "16/9" : aspect === "1:1" ? "1/1" : "9/16";
}

const ASPECTS: { value: "9:16" | "16:9" | "1:1"; label: string; box: string }[] = [
  { value: "9:16", label: "9:16", box: "w-[9px] h-4" },
  { value: "16:9", label: "16:9", box: "w-4 h-[9px]" },
  { value: "1:1", label: "1:1", box: "w-[13px] h-[13px]" },
];

// A one-line reason a creator can act on, distilled from the AI breakdown.
function clipReason(clip: ClipItem): string {
  const bd = clip.scoreBreakdown as unknown as ScoreBreakdownWithInsights | null;
  if (bd?.reasoning) return bd.reasoning;
  const band = scoreBand(clip.score).label;
  if (clip.mood) return `${clip.mood[0].toUpperCase()}${clip.mood.slice(1)} moment · ${band.toLowerCase()}`;
  return band;
}

function WarningsBanner({ warnings }: { warnings: string[] | null | undefined }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <IcWarning />
          <span>{WARNING_COPY[w] ?? w}</span>
        </div>
      ))}
    </div>
  );
}

// ── Trimmed preview (review phase — no render exists yet) ────────────────────
function TrimmedPreviewPlayer({ sourceVideoUrl, startSec, endSec, aspectRatio, className }: {
  sourceVideoUrl: string | null;
  startSec: number;
  endSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (playing && videoRef.current) videoRef.current.currentTime = startSec;
  }, [startSec, endSec, playing]);

  return (
    <div className={`relative bg-gray-900 ${className ?? ""}`} style={{ aspectRatio: arCss(aspectRatio) }}>
      {playing && sourceVideoUrl ? (
        <video
          ref={videoRef}
          src={sourceVideoUrl}
          preload="none"
          playsInline
          autoPlay
          className="w-full h-full object-contain bg-black"
          onLoadedMetadata={(e) => { e.currentTarget.currentTime = startSec; }}
          onTimeUpdate={(e) => {
            if (endSec > startSec && e.currentTarget.currentTime >= endSec) e.currentTarget.currentTime = startSec;
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/25">
          <IcFilm />
        </div>
      )}
      {sourceVideoUrl ? (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="absolute inset-0 flex items-center justify-center bg-black/15 hover:bg-black/25 transition-colors group"
        >
          {!playing && (
            <span className="w-12 h-12 rounded-full bg-white/90 text-ink flex items-center justify-center group-hover:scale-105 transition-transform"><IcPlay /></span>
          )}
        </button>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs font-medium">Preview unavailable</div>
      )}
    </div>
  );
}

const MAX_CLIP_SECONDS = 300;
interface ReviewEdit { keep: boolean; startSec: number; endSec: number; aspectRatio: "9:16" | "16:9" | "1:1" }
function trimError(edit: ReviewEdit): string | null {
  if (!edit.keep) return null;
  if (!Number.isFinite(edit.startSec) || !Number.isFinite(edit.endSec)) return "Enter a start and end time.";
  if (edit.startSec < 0) return "Start can't be negative.";
  if (edit.endSec <= edit.startSec) return "End must come after start.";
  if (edit.endSec - edit.startSec > MAX_CLIP_SECONDS) return `Clips can't be longer than ${MAX_CLIP_SECONDS / 60} minutes.`;
  return null;
}

// ── Per-clip actions (ready clips): re-render, edit-in-editor, dub, publish ───
function RerenderPanel({ projectId, clip, onQueued }: { projectId: string; clip: ClipItem; onQueued: () => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(clip.startSec);
  const [end, setEnd] = useState(clip.endSec);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/rerender`, {
        method: "POST",
        body: JSON.stringify({ startSec: start, endSec: end }),
      });
      setOpen(false);
      onQueued();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Re-render range</button>;
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-card-border p-3">
      <div className="flex items-center gap-2">
        <input type="number" step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
        <span className="text-ink-soft/40">—</span>
        <input type="number" step={0.5} value={end} onChange={(e) => setEnd(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 text-xs font-semibold py-1.5 rounded-lg grad-brand text-white shadow-glow disabled:opacity-50">{busy ? "…" : "Re-render (1 credit)"}</button>
        <button onClick={() => setOpen(false)} className="text-xs font-semibold py-1.5 px-2 rounded-lg border border-card-border text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

function EditInEditorButton({ projectId, clip, className }: { projectId: string; clip: ClipItem; className?: string }) {
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

interface DubItem { id: string; targetLang: string; status: string; videoUrl: string | null }
interface DubLang { code: string; label: string }

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
  const langs = dubQuery.data?.languages ?? [];
  const dubs = dubQuery.data?.dubs ?? [];

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
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 rounded-lg border border-card-border px-2 py-1.5 text-xs bg-white">
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button onClick={() => startDubMutation.mutate()} disabled={startDubMutation.isPending} className="text-xs font-semibold py-1.5 px-3 rounded-lg grad-brand text-white shadow-glow disabled:opacity-50">{startDubMutation.isPending ? "…" : "Dub (1 credit)"}</button>
      </div>
      {startDubMutation.isError && <p className="text-[11px] text-red-600">{startDubMutation.error instanceof Error ? startDubMutation.error.message : "Failed"}</p>}
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

interface PublishAccount { id: string; provider: string; username: string | null; displayName: string | null }
interface PublishItem { id: string; permalink: string | null; status: string; socialAccount: { provider: string; username: string | null } }

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
  const accounts = publishQuery.data?.accounts ?? [];
  const publishes = publishQuery.data?.publishes ?? [];

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
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs bg-white">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.displayName ?? a.username ?? a.id.slice(0, 6)}</option>)}
              </select>
              {isYoutube ? (
                <>
                  <p className="text-[10px] text-ink-soft/70">Uploads this clip directly to YouTube as Unlisted — change visibility on YouTube afterward if you want it Public.</p>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-ink-soft block">Schedule for later (optional)</label>
                    <input type="datetime-local" value={scheduledFor} min={minSchedule} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
                  </div>
                  {err && <p className="text-[11px] text-red-600">{err} {needsReauth && <a href="/dashboard/social-tracker" className="underline font-semibold">Reconnect →</a>}</p>}
                  <button onClick={() => submit(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {})} disabled={publishMutation.isPending} className="w-full min-h-[40px] text-xs font-bold rounded-lg grad-brand text-white shadow-glow disabled:opacity-50">
                    {publishMutation.isPending ? "Working…" : scheduledFor ? "Schedule upload" : "Publish to YouTube"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[10px] text-ink-soft/70">Instagram/Facebook auto-publish needs a Meta app review this app hasn&apos;t completed — post it yourself, then paste the link here to track its performance.</p>
                  <input value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="Paste the live post URL after posting manually" className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs" />
                  {err && <p className="text-[11px] text-red-600">{err}</p>}
                  <button onClick={() => submit({ permalink: permalink || undefined })} disabled={publishMutation.isPending} className="w-full min-h-[40px] text-xs font-bold rounded-lg grad-brand text-white shadow-glow disabled:opacity-50">{publishMutation.isPending ? "…" : "Save link"}</button>
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
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="text-brand font-semibold shrink-0">View</a> : <span className="capitalize text-ink-soft/60 shrink-0">{p.status}</span>}
            </li>
          ))}
        </ul>
      )}
      {!embedded && <button onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-soft/70">Close</button>}
    </div>
  );
}

function RetryClipButton({ projectId, clip, onQueued }: { projectId: string; clip: ClipItem; onQueued: () => void }) {
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
      <button onClick={retry} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/90 hover:bg-white text-ink transition-colors disabled:opacity-50">
        {busy ? "Retrying…" : "Retry"}
      </button>
      {err && <span className="text-[10px] text-red-300">{err}</span>}
    </div>
  );
}

// ── Subtitle styling helpers (ASS colour packing) ────────────────────────────
function hexToASS(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 6) {
    const r = cleaned.slice(0, 2);
    const g = cleaned.slice(2, 4);
    const b = cleaned.slice(4, 6);
    return `&H00${b}${g}${r}`;
  }
  return "&H00FFFFFF";
}
function assToHex(ass: string): string {
  const match = ass.match(/&H[0-9a-fA-F]{2}([0-9a-fA-F]{6})/);
  if (match) {
    const bgr = match[1];
    const b = bgr.slice(0, 2);
    const g = bgr.slice(2, 4);
    const r = bgr.slice(4, 6);
    return `#${r}${g}${b}`;
  }
  return "#ffffff";
}

// A small popover menu anchored to a trigger. Closes on outside-click / Esc.
function OverflowMenu({ children, ariaLabel = "More actions", align = "right" }: { children: (close: () => void) => ReactNode; ariaLabel?: string; align?: "right" | "left" }) {
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
        className="w-8 h-8 flex-shrink-0 rounded-lg border border-card-border bg-white text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"
      >
        <IcMore />
      </button>
      {open && (
        <div role="menu" className={`ac-pop absolute z-30 mt-1 w-52 rounded-xl border border-card-border bg-white p-1.5 shadow-card ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ── Results feed clip card (ready + in-flight) ───────────────────────────────
function ClipCard({ projectId, clip, onChanged, onOpen }: {
  projectId: string; clip: ClipItem; onChanged: () => void;
  onOpen: (clip: ClipItem, tab?: WorkspaceTab, origin?: string) => void;
}) {
  const band = scoreBand(clip.score);
  const ready = clip.status === "ready" && !!clip.videoUrl;
  const failed = clip.status === "failed";
  const cardRef = useRef<HTMLDivElement | null>(null);

  const openWith = (tab: WorkspaceTab) => {
    const el = cardRef.current;
    let origin = "50% 50%";
    if (el) {
      const r = el.getBoundingClientRect();
      origin = `${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`;
    }
    onOpen(clip, tab, origin);
  };

  return (
    <div ref={cardRef} className="ac-card rounded-2xl bg-white overflow-hidden flex flex-col shadow-card">
      <div className="relative" style={{ aspectRatio: arCss(clip.aspectRatio), background: "linear-gradient(160deg,#243447,#0f172a 65%,#111827)" }}>
        {clip.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Band + duration (non-interactive, under the open button) */}
        <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold shadow-sm pointer-events-none" style={{ background: "rgba(255,255,255,.94)", color: band.text }}>
          <span aria-hidden>{band.icon}</span>{band.label}
        </span>
        <span className="absolute top-2.5 right-2.5 z-10 px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-white pointer-events-none" style={{ background: "rgba(15,23,42,.6)" }}>{fmtTime(clip.durationSec)}</span>

        {ready ? (
          <button type="button" onClick={() => openWith("edit")} aria-label={`Open ${clip.title || `clip ${clip.index + 1}`}`} className="group absolute inset-0 w-full h-full text-left">
            <span className="ac-reveal absolute inset-x-0 bottom-0 h-[64%] block" style={{ background: "linear-gradient(to top, rgba(9,14,26,.92), rgba(9,14,26,0))" }} />
            <span className="ac-reveal ac-rise-in absolute inset-x-3 bottom-3 block text-white">
              <span className="block text-[12px] leading-snug text-white/80 mb-2 line-clamp-2">{clipReason(clip)}</span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full grad-brand text-[12.5px] font-bold text-white"><IcPlay /> Open clip</span>
            </span>
            <span className="ac-scrub absolute inset-x-0 bottom-0 h-[3px] opacity-0" style={{ background: "rgba(255,255,255,.22)" }}>
              <span className="block h-full w-2/5 bg-white" />
            </span>
          </button>
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white text-xs font-medium">
            <span>Failed to render</span>
            <RetryClipButton projectId={projectId} clip={clip} onQueued={onChanged} />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white">
            <span className="w-9 h-9 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-xs font-semibold">{clip.status === "queued" ? "Queued" : `${clip.progress}%`}</span>
          </div>
        )}
        {clip.status === "rendering" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${clip.progress}%` }} />
          </div>
        )}
      </div>
      <div className="px-3.5 py-3 flex items-center gap-2">
        <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink leading-snug line-clamp-1">{clip.title || `Clip ${clip.index + 1}`}</p>
        {ready && (
          <OverflowMenu>
            {(close) => (
              <>
                <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download onClick={close} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Download</a>
                <button onClick={() => { close(); openWith("edit"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Edit clip</button>
                <button onClick={() => { close(); openWith("captions"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Captions</button>
                <button onClick={() => { close(); openWith("publish"); }} className="block w-full text-left text-[13px] font-medium py-2 px-3 rounded-lg text-ink hover:bg-tint-blue transition-colors">Publish / Dub</button>
              </>
            )}
          </OverflowMenu>
        )}
      </div>
    </div>
  );
}

// ── Review card (pending_review — select, trim, aspect) ──────────────────────
function ReviewClipCard({ clip, edit, onChange, onOpen }: {
  clip: ClipItem; edit: ReviewEdit;
  onChange: (patch: Partial<ReviewEdit>) => void;
  onOpen: (origin: string) => void;
}) {
  const band = scoreBand(clip.score);
  const invalid = trimError(edit);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [adjust, setAdjust] = useState(false);

  return (
    <div ref={cardRef} className={`ac-card rounded-2xl bg-white overflow-hidden flex flex-col shadow-card ${edit.keep ? "ring-2 ring-brand/60" : "opacity-70"}`}>
      <button
        type="button"
        onClick={() => {
          const el = cardRef.current;
          let origin = "50% 50%";
          if (el) { const r = el.getBoundingClientRect(); origin = `${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`; }
          onOpen(origin);
        }}
        className="group relative block w-full text-left"
        style={{ aspectRatio: arCss(edit.aspectRatio), background: "linear-gradient(160deg,#243447,#0f172a 65%,#111827)" }}
      >
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold shadow-sm" style={{ background: "rgba(255,255,255,.94)", color: band.text }}>
          <span aria-hidden>{band.icon}</span>{band.label}
        </span>
        <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-white" style={{ background: "rgba(15,23,42,.6)" }}>{fmtTime(Math.max(0, edit.endSec - edit.startSec))}</span>
        <span className="ac-reveal absolute inset-x-0 bottom-0 h-[64%] pointer-events-none" style={{ background: "linear-gradient(to top, rgba(9,14,26,.92), rgba(9,14,26,0))" }} />
        <span className="ac-reveal ac-rise-in absolute inset-x-3 bottom-3 block text-white">
          <span className="block text-[12px] leading-snug text-white/80 mb-2 line-clamp-2">{clipReason(clip)}</span>
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full grad-brand text-[12.5px] font-bold text-white"><IcPlay /> Open clip</span>
        </span>
      </button>
      <div className="px-3.5 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink leading-snug line-clamp-1">{clip.title || `Clip ${clip.index + 1}`}</p>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft shrink-0 cursor-pointer">
            <input type="checkbox" checked={edit.keep} onChange={(e) => onChange({ keep: e.target.checked })} className="w-4 h-4 accent-brand" />
            Keep
          </label>
        </div>
        <button onClick={() => setAdjust((a) => !a)} className="flex items-center justify-between text-left">
          <span className="text-[12px] text-ink-soft">{edit.keep ? "Selected to render" : "Won't render"}</span>
          <span className="text-[12px] font-semibold text-brand">{adjust ? "Hide timing" : "Adjust timing"}</span>
        </button>
        {adjust && (
          <div className="ac-panel-in space-y-2.5 border-t border-card-border pt-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-ink-soft block mb-0.5">Start (s)</label>
                <input type="number" min={0} step={0.5} value={edit.startSec} onChange={(e) => onChange({ startSec: Math.max(0, Number(e.target.value)) })} disabled={!edit.keep} className="w-full rounded-lg border border-card-border px-2 py-1.5 text-xs text-ink disabled:bg-surface" />
              </div>
              <span className="text-ink-soft/40 mt-3">—</span>
              <div className="flex-1">
                <label className="text-[10px] text-ink-soft block mb-0.5">End (s)</label>
                <input type="number" min={0} step={0.5} value={edit.endSec} onChange={(e) => onChange({ endSec: Number(e.target.value) })} disabled={!edit.keep} className={`w-full rounded-lg border px-2 py-1.5 text-xs text-ink disabled:bg-surface ${invalid ? "border-red-300" : "border-card-border"}`} />
              </div>
            </div>
            {invalid && <p className="text-[11px] font-medium text-red-600">{invalid}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECTS.map((a) => (
                <button key={a.value} type="button" disabled={!edit.keep} onClick={() => onChange({ aspectRatio: a.value })}
                  className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${edit.aspectRatio === a.value ? "grad-brand text-white shadow-glow border-transparent" : "bg-white border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type WorkspaceTab = "edit" | "captions" | "reframe" | "insights" | "transcript" | "publish";

// ── Clip Workspace (ready clips) — full-screen, video hero + contextual tools ─
function ClipWorkspace({
  projectId, clip, transcriptionFailed, initialTab, expandOrigin,
  index, total, onPrev, onNext, onClose, onChanged,
}: {
  projectId: string; clip: ClipItem; transcriptionFailed: boolean;
  initialTab: WorkspaceTab; expandOrigin: string;
  index: number; total: number;
  onPrev: () => void; onNext: () => void;
  onClose: () => void; onChanged: () => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [panelOpen, setPanelOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Esc closes the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Brand kits (Captions tab).
  interface BrandKit {
    id: string; name: string;
    fontName: string | null; fontSize: number | null;
    baseColor: string | null; highlightColor: string | null; outlineColor: string | null; shadowColor: string | null;
    outlineWidth: number | null; shadowDepth: number | null; borderStyle: number | null; alignment: number | null;
    animated: boolean | null;
  }
  const brandKitsQuery = useQuery({
    queryKey: ["brand-kits"],
    queryFn: () => apiFetch<{ kits: BrandKit[] }>("/api/brand-kits"),
  });
  const brandKits = brandKitsQuery.data?.kits ?? [];
  const [namingKit, setNamingKit] = useState(false);
  const [newKitName, setNewKitName] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const override = (clip.subtitleStyleOverride as any) ?? {};
  const [fontName, setFontName] = useState((override.fontName as string) ?? "Outfit");
  const [fontSize, setFontSize] = useState((override.fontSize as number) ?? 80);
  const [baseColor, setBaseColor] = useState(assToHex((override.baseColor as string) ?? "&H00FFFFFF"));
  const [highlightColor, setHighlightColor] = useState(assToHex((override.highlightColor as string) ?? "&H0000FFFF"));
  const [outlineColor, setOutlineColor] = useState(assToHex((override.outlineColor as string) ?? "&H00000000"));
  const [shadowColor, setShadowColor] = useState(assToHex((override.shadowColor as string) ?? "&H00000000"));
  const [outlineWidth, setOutlineWidth] = useState((override.outlineWidth as number) ?? 8);
  const [shadowDepth, setShadowDepth] = useState((override.shadowDepth as number) ?? 0);
  const [borderStyle, setBorderStyle] = useState((override.borderStyle as number) ?? 1);
  const [alignment, setAlignment] = useState((override.alignment as number) ?? 5);
  const [animatedCaptions, setAnimatedCaptions] = useState((override.animated as boolean) ?? true);
  const [templateId, setTemplateId] = useState<string | null>((override.templateId as string) ?? null);
  const [captionsOn, setCaptionsOn] = useState(clip.hasCaptions);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  function applyBrandKit(kit: BrandKit) {
    if (kit.fontName != null) setFontName(kit.fontName);
    if (kit.fontSize != null) setFontSize(kit.fontSize);
    if (kit.baseColor != null) setBaseColor(assToHex(kit.baseColor));
    if (kit.highlightColor != null) setHighlightColor(assToHex(kit.highlightColor));
    if (kit.outlineColor != null) setOutlineColor(assToHex(kit.outlineColor));
    if (kit.shadowColor != null) setShadowColor(assToHex(kit.shadowColor));
    if (kit.outlineWidth != null) setOutlineWidth(kit.outlineWidth);
    if (kit.shadowDepth != null) setShadowDepth(kit.shadowDepth);
    if (kit.borderStyle != null) setBorderStyle(kit.borderStyle);
    if (kit.alignment != null) setAlignment(kit.alignment);
    if (kit.animated != null) setAnimatedCaptions(kit.animated);
  }
  const saveBrandKitMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ kit: BrandKit }>("/api/brand-kits", {
        method: "POST",
        body: JSON.stringify({
          name: newKitName.trim(),
          fontName, fontSize,
          baseColor: hexToASS(baseColor), highlightColor: hexToASS(highlightColor),
          outlineColor: hexToASS(outlineColor), shadowColor: hexToASS(shadowColor),
          outlineWidth, shadowDepth, borderStyle, alignment, animated: animatedCaptions,
        }),
      }),
    onSuccess: () => {
      setNamingKit(false);
      setNewKitName("");
      brandKitsQuery.refetch();
    },
  });
  function handleSaveBrandKit() {
    if (!newKitName.trim()) return;
    saveBrandKitMutation.mutate();
  }

  // Audio cuts / reframe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const silence = (clip.silenceSettings as any) ?? {};
  const [removeSilence, setRemoveSilence] = useState((silence.removeSilence as boolean) ?? false);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState((silence.silenceThresholdMs as number) ?? 400);
  const [removeFillers, setRemoveFillers] = useState((silence.removeFillers as boolean) ?? false);
  const [reframingPreset, setReframingPreset] = useState((silence.reframingPreset as string) ?? "balanced");
  const [smartAutoReframe, setSmartAutoReframe] = useState((silence.smartAutoReframe as boolean) ?? true);
  const [zoomStrength, setZoomStrength] = useState((silence.zoomStrength as string) ?? "medium");
  const [speakerMode, setSpeakerMode] = useState((silence.speakerMode as string) ?? "auto");
  const [smoothness, setSmoothness] = useState((silence.smoothness as number) ?? 50);
  const [trackingSpeed, setTrackingSpeed] = useState((silence.trackingSpeed as number) ?? 50);

  // Transcript (fetched on open — clips list omits transcriptJson).
  interface WordTimingInfo { word: string; start: number; end: number }
  const transcriptQuery = useQuery({
    queryKey: ["auto-clip-transcript", projectId, clip.id],
    queryFn: () => apiFetch<{ detail?: { transcriptJson: WordTimingInfo[] | null } }>(`/api/projects/${projectId}/clips?clipId=${encodeURIComponent(clip.id)}`),
  });
  const [localWords, setLocalWords] = useState<WordTimingInfo[]>([]);
  // Seed the editable draft once the fetch lands, then leave it alone — a
  // background refetch (e.g. window refocus) must not clobber in-progress
  // edits. ClipWorkspace is remounted (key={clip.id}) on every clip switch,
  // so this only ever needs to guard "seeded or not", not "seeded for which
  // clip" — a fresh instance already means a fresh, unseeded draft.
  const [transcriptSeeded, setTranscriptSeeded] = useState(false);
  if (transcriptQuery.data && !transcriptSeeded) {
    setTranscriptSeeded(true);
    setLocalWords(transcriptQuery.data.detail?.transcriptJson ?? []);
  }
  const transcriptLoading = transcriptQuery.isLoading;

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function handleSaveStyleOrCuts() {
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/style`, {
        method: "PUT",
        body: JSON.stringify({
          captionStyleIndex: captionsOn ? (clip.captionStyleIndex != null && clip.captionStyleIndex >= 0 ? clip.captionStyleIndex : 0) : -1,
          subtitleStyleOverride: {
            ...(templateId ? { templateId } : {}),
            fontName, fontSize,
            baseColor: hexToASS(baseColor), highlightColor: hexToASS(highlightColor),
            outlineColor: hexToASS(outlineColor), shadowColor: hexToASS(shadowColor),
            outlineWidth, shadowDepth, borderStyle, alignment, animated: animatedCaptions,
          },
          silenceSettings: { removeSilence, silenceThresholdMs, removeFillers, reframingPreset, smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed },
        }),
      });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleApplyLiteEdits(edits: LiteEdits, trim: { startSec: number; endSec: number } | null) {
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/lite`, {
        method: "PUT",
        body: JSON.stringify({ liteEdits: edits, ...(trim ? { startSec: clip.startSec + trim.startSec, endSec: clip.startSec + trim.endSec } : {}) }),
      });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleSaveTranscript() {
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/transcript`, { method: "PUT", body: JSON.stringify({ transcript: localWords }) });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  const bd = clip.scoreBreakdown as unknown as ScoreBreakdownWithInsights | null;
  const caption = bd?.suggestedCaption ?? "Check out this amazing clip!";
  const hashtags = Array.isArray(bd?.hashtags) ? bd.hashtags.join(" ") : "#highlight #viral";
  function copySocial() {
    navigator.clipboard.writeText(`${caption}\n\n${hashtags}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const band = scoreBand(clip.score);
  const isRendering = clip.status === "rendering" || clip.status === "queued";
  const TABS: { id: WorkspaceTab; label: string }[] = [
    { id: "edit", label: "Edit" }, { id: "captions", label: "Captions" }, { id: "reframe", label: "Reframe" },
    { id: "insights", label: "Insights" }, { id: "transcript", label: "Transcript" }, { id: "publish", label: "Publish" },
  ];
  const panelTitle: Record<WorkspaceTab, string> = { edit: "Edit", captions: "Captions", reframe: "Reframe & Audio", insights: "Insights", transcript: "Transcript", publish: "Publish" };

  return (
    <div className="fixed inset-0 z-50 ac-expand" style={{ background: "var(--surface)", transformOrigin: expandOrigin }}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="ac-rise h-[60px] flex-shrink-0 border-b border-card-border bg-white flex items-center gap-3 px-4">
          <button onClick={onClose} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-card-border bg-white text-ink text-[13px] font-semibold hover:bg-tint-blue transition-colors">
            <IcChevronLeft /> Back to clips
          </button>
          <div className="w-px h-6 bg-card-border" />
          <span className="text-sm font-bold text-ink truncate max-w-[38ch]">{clip.title || `Clip ${clip.index + 1}`}</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: band.bg, color: band.text }}><span aria-hidden>{band.icon}</span>{band.label}</span>
          <div className="flex-1" />
          <span className="hidden md:block text-xs text-ink-soft/70">Esc to close</span>
          <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-card-border bg-white text-ink hover:bg-tint-blue transition-colors">Download</a>
        </div>

        {/* Body: stage + tools panel */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "#0b1220" }}>
          {isRendering && (
            <div className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-[3.5px] border-white/25 border-t-white rounded-full animate-spin" />
              <p className="text-sm font-semibold text-white">Applying changes…</p>
              <p className="text-xs text-white/60">{clip.status === "queued" ? "Queued" : `${clip.progress}% rendered`}</p>
            </div>
          )}
          <div className={panelOpen ? "ac-stage ac-stage-open" : "ac-stage"} style={{ padding: "20px 24px" }}>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="ac-pop relative h-full flex items-center justify-center">
                {playing && clip.videoUrl ? (
                  <video src={clip.videoUrl} controls autoPlay className="h-full max-h-full rounded-2xl bg-black" style={{ aspectRatio: arCss(clip.aspectRatio) }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    className="group relative h-full rounded-2xl overflow-hidden"
                    style={{ aspectRatio: arCss(clip.aspectRatio), background: "linear-gradient(160deg,#243447,#0f172a 65%,#111827)", boxShadow: "0 24px 70px rgba(0,0,0,.5)" }}
                  >
                    {clip.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-16 h-16 rounded-full bg-white/90 text-ink flex items-center justify-center group-hover:scale-105 transition-transform"><IcPlay /></span>
                    </span>
                  </button>
                )}
              </div>
            </div>
            {/* Clip navigation */}
            <div className="h-[52px] flex-shrink-0 flex items-center justify-center gap-2 relative">
              <button aria-label="Previous clip" onClick={onPrev} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronLeft /></button>
              <span className="text-xs text-white/70 font-medium">Clip {index + 1} of {total}</span>
              <button aria-label="Next clip" onClick={onNext} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronRight /></button>
              {!panelOpen && (
                <button onClick={() => setPanelOpen(true)} className="absolute right-0 inline-flex items-center gap-2 min-h-[38px] px-4 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition-colors">Tools</button>
              )}
            </div>
          </div>

          {panelOpen && (
            <aside className="ac-tools-panel bg-white flex flex-col">
              <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 border-b border-card-border">
                <p className="flex-1 text-sm font-bold text-ink">{panelTitle[tab]}</p>
                <button onClick={() => setPanelOpen(false)} aria-label="Hide tools" className="w-8 h-8 rounded-lg border border-card-border bg-white text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcChevronRight /></button>
              </div>
              <div className="flex flex-wrap gap-1 px-3 py-2.5 border-b border-card-border">
                {TABS.map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "true" : undefined}
                    className={`min-h-[36px] px-3 rounded-full text-[12.5px] font-bold transition-colors ${tab === t.id ? "bg-ink text-white" : "text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === "edit" && (
                  <div className="ac-panel-in">
                    <LiteEditTab
                      projectId={projectId}
                      clipId={clip.id}
                      durationSec={clip.durationSec}
                      peaks={clip.audioPeaks ?? []}
                      initial={clip.liteEdits}
                      busy={saving}
                      isFirstRerenderFree={clip.rerenderCount === 0}
                      onApply={handleApplyLiteEdits}
                    />
                  </div>
                )}

                {tab === "captions" && (
                  <div className="ac-panel-in space-y-5">
                    <div>
                      <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-1">Caption style</h4>
                      <p className="text-[12.5px] text-ink-soft mb-3">One choice sets typography, keyword colour and emoji.</p>
                      <CaptionTemplatePicker
                        value={templateId}
                        onChange={(id) => {
                          setTemplateId(id);
                          const t = CAPTION_TEMPLATES.find((x) => x.id === id);
                          if (!t) return;
                          if (t.style.fontName) setFontName(t.style.fontName);
                          if (t.style.fontSize) setFontSize(t.style.fontSize);
                          if (t.style.baseColor) setBaseColor(assToHex(t.style.baseColor));
                          if (t.style.highlightColor) setHighlightColor(assToHex(t.style.highlightColor));
                          if (t.style.outlineColor) setOutlineColor(assToHex(t.style.outlineColor));
                          if (t.style.outlineWidth != null) setOutlineWidth(t.style.outlineWidth);
                          if (t.style.shadowDepth != null) setShadowDepth(t.style.shadowDepth);
                          if (t.style.borderStyle != null) setBorderStyle(t.style.borderStyle);
                          if (t.style.alignment != null) setAlignment(t.style.alignment);
                          if (t.style.animated != null) setAnimatedCaptions(t.style.animated);
                        }}
                        disabled={saving}
                      />
                    </div>

                    <button onClick={() => setCustomizeOpen((o) => !o)} className="flex items-center justify-between w-full">
                      <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Customize</span>
                      <span className="text-[12px] font-semibold text-brand">{customizeOpen ? "Hide" : "Show"}</span>
                    </button>
                    {customizeOpen && (
                      <div className="ac-panel-in space-y-4 border-t border-card-border pt-4">
                        {brandKits.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Load from Brand Kit</label>
                            <select defaultValue="" onChange={(e) => { const kit = brandKits.find((k) => k.id === e.target.value); if (kit) applyBrandKit(kit); e.target.value = ""; }} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-white">
                              <option value="" disabled>Choose a saved style…</option>
                              {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Font</label>
                            <select value={fontName} onChange={(e) => setFontName(e.target.value)} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-white">
                              {["Outfit", "Arial", "Impact", "Courier New", "Georgia", "Times New Roman"].map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Size (px)</label>
                            <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Layout</label>
                            <select value={borderStyle} onChange={(e) => setBorderStyle(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-white">
                              <option value={1}>Outline &amp; Shadow</option>
                              <option value={3}>Background Box</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Alignment</label>
                            <select value={alignment} onChange={(e) => setAlignment(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-white">
                              <option value={5}>Center</option>
                              <option value={2}>Bottom</option>
                              <option value={8}>Top</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          {[["Text", baseColor, setBaseColor] as const, ["Highlight", highlightColor, setHighlightColor] as const, ["Outline", outlineColor, setOutlineColor] as const, ["Shadow", shadowColor, setShadowColor] as const].map(([label, val, set]) => (
                            <div key={label} className="space-y-1">
                              <label className="text-[11px] font-semibold text-ink-soft block">{label}</label>
                              <input type="color" value={val} onChange={(e) => set(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-card-border" />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-ink-soft"><span>Outline thickness</span><span>{outlineWidth}px</span></div>
                          <input type="range" min={0} max={12} step={1} value={outlineWidth} onChange={(e) => setOutlineWidth(Number(e.target.value))} className="w-full accent-brand" />
                          <div className="flex justify-between text-[11px] text-ink-soft"><span>Shadow depth</span><span>{shadowDepth}px</span></div>
                          <input type="range" min={0} max={12} step={1} value={shadowDepth} onChange={(e) => setShadowDepth(Number(e.target.value))} className="w-full accent-brand" />
                        </div>
                        {namingKit ? (
                          <div className="flex items-center gap-2">
                            <input value={newKitName} onChange={(e) => setNewKitName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveBrandKit(); }} placeholder="Name this style…" autoFocus className="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
                            <Button onClick={handleSaveBrandKit} disabled={saveBrandKitMutation.isPending || !newKitName.trim()} size="sm">{saveBrandKitMutation.isPending ? "Saving…" : "Save"}</Button>
                            <button type="button" onClick={() => { setNamingKit(false); setNewKitName(""); }} className="text-xs text-ink-soft/70 px-1">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setNamingKit(true)} className="w-full text-center text-xs font-semibold text-brand hover:underline py-1">Save as Brand Kit</button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                      <div className="pr-3">
                        <p className="text-[12.5px] font-semibold text-ink">Burn captions in</p>
                        <p className="text-[11px] text-ink-soft">{captionsOn ? "Baked into the exported file." : "This clip renders without subtitles."}</p>
                      </div>
                      <Switch checked={captionsOn} onChange={setCaptionsOn} label="Burn in captions" disabled={saving} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                      <div className="pr-3">
                        <p className="text-[12.5px] font-semibold text-ink">Animated subtitles</p>
                        <p className="text-[11px] text-ink-soft">Word-by-word active highlighting with pop zoom.</p>
                      </div>
                      <Switch checked={animatedCaptions} onChange={setAnimatedCaptions} label="Animated subtitles" disabled={saving} />
                    </div>
                    <TranslateCaptions projectId={projectId} clipId={clip.id} disabled={saving} onQueued={onChanged} />
                    {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
                    <Button onClick={handleSaveStyleOrCuts} disabled={saving} className="w-full">{saving ? "Saving & Rendering…" : "Apply caption style"}</Button>
                    <RerenderCostNote clip={clip} />
                  </div>
                )}

                {tab === "reframe" && (
                  <div className="ac-panel-in space-y-5">
                    <ReframeAndCutsControls
                      smartAutoReframe={smartAutoReframe} setSmartAutoReframe={setSmartAutoReframe}
                      reframingPreset={reframingPreset} setReframingPreset={setReframingPreset}
                      zoomStrength={zoomStrength as "low" | "medium" | "high"} setZoomStrength={setZoomStrength}
                      speakerMode={speakerMode as "auto" | "single" | "split" | "active"} setSpeakerMode={setSpeakerMode}
                      smoothness={smoothness} setSmoothness={setSmoothness}
                      trackingSpeed={trackingSpeed} setTrackingSpeed={setTrackingSpeed}
                      removeSilence={removeSilence} setRemoveSilence={setRemoveSilence}
                      silenceThresholdMs={silenceThresholdMs} setSilenceThresholdMs={setSilenceThresholdMs}
                      removeFillers={removeFillers} setRemoveFillers={setRemoveFillers}
                    />
                    {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
                    <Button onClick={handleSaveStyleOrCuts} disabled={saving} className="w-full">{saving ? "Saving & Rendering…" : "Apply reframe & audio"}</Button>
                    <RerenderCostNote clip={clip} />
                  </div>
                )}

                {tab === "insights" && (
                  transcriptionFailed ? (
                    <div className="ac-panel-in rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-1.5">Insights unavailable</h4>
                      <p className="text-sm text-amber-800 leading-relaxed">This video couldn&apos;t be transcribed, so the AI never read its content. Virality scores and suggested captions would just be guesses, so they&apos;re hidden. Add a working transcription key and re-run the analysis to get genuine insights.</p>
                    </div>
                  ) : (
                    <div className="ac-panel-in space-y-4">
                      <div className="rounded-2xl p-4" style={{ background: band.bg, border: `1px solid ${band.border}` }}>
                        <p className="text-[12px] font-bold uppercase tracking-wider mb-1.5" style={{ color: band.text }}>{band.icon} {band.label}</p>
                        <p className="text-[13.5px] font-bold text-ink mb-1">Why this clip works</p>
                        <p className="text-[12.5px] text-ink-soft leading-relaxed">{bd?.reasoning || "Highly engaging highlight from the source video."}</p>
                      </div>
                      <button onClick={() => setDetailOpen((o) => !o)} className="flex items-center justify-between w-full">
                        <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Detailed insights</span>
                        <span className="text-[12px] font-semibold text-brand">{detailOpen ? "Hide" : "View"}</span>
                      </button>
                      {detailOpen && (
                        <div className="ac-panel-in space-y-4">
                          <div className="grid grid-cols-2 gap-2.5">
                            {[["Hook", bd?.hook], ["Engagement", bd?.engagement], ["Pacing", bd?.pacing], ["Payoff", bd?.payoff]].map(([label, val]) => (
                              <div key={label as string} className="rounded-xl border border-card-border px-3 py-2.5">
                                <span className="text-[11px] text-ink-soft font-semibold block">{label as string}</span>
                                <span className="text-base font-extrabold text-ink">{(val as number) ?? 50}</span><span className="text-[11px] text-ink-soft/60"> / 99</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2.5 text-[12.5px]">
                            <div className="flex justify-between gap-3"><span className="text-ink-soft">Audience</span><span className="text-ink font-semibold text-right">{bd?.audience || "General audience"}</span></div>
                            <div className="h-px bg-card-border" />
                            <div className="flex justify-between gap-3"><span className="text-ink-soft">Platform fit</span><span className="text-ink font-semibold text-right">{bd?.platform || "Shorts, Reels"}</span></div>
                            <div className="h-px bg-card-border" />
                            <div className="flex justify-between gap-3"><span className="text-ink-soft">Best time to post</span><span className="text-ink font-semibold text-right">{bd?.suggestedPostingTime || "5:00 PM local"}</span></div>
                          </div>
                          <div className="rounded-xl border border-dashed border-card-border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider">Suggested post copy</span>
                              <button onClick={copySocial} className="text-[12px] font-bold text-brand hover:underline">{copied ? "✓ Copied!" : "Copy"}</button>
                            </div>
                            <p className="text-[12.5px] text-ink italic">&quot;{caption}&quot;</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {(bd?.hashtags ?? ["#highlight", "#viral"]).map((h) => <span key={h} className="px-2 py-0.5 rounded-md text-[10.5px] font-bold" style={{ background: "var(--tint-blue)", color: "#3730a3" }}>{h}</span>)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}

                {tab === "transcript" && (
                  <div className="ac-panel-in space-y-4">
                    <p className="text-[12px] text-ink-soft">Click any word to correct spelling or formatting. Saving re-renders the clip&apos;s captions.</p>
                    <div className="flex flex-wrap gap-2 p-3 bg-surface rounded-xl border border-card-border max-h-72 overflow-y-auto">
                      {transcriptLoading && <p className="text-xs text-ink-soft">Loading transcript…</p>}
                      {!transcriptLoading && localWords.length === 0 && (
                        <p className="text-xs text-ink-soft">No transcript for this clip — captions were off, or transcription didn&apos;t succeed for this video.</p>
                      )}
                      {localWords.map((w, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-card-border shadow-sm text-xs">
                          <input type="text" value={w.word} onChange={(e) => { const next = [...localWords]; next[idx] = { ...next[idx], word: e.target.value }; setLocalWords(next); }} className="w-16 bg-transparent focus:outline-none border-b border-transparent focus:border-brand font-semibold" />
                          <span className="text-[9px] text-ink-soft/60 font-mono">{(w.start / 1000).toFixed(1)}s</span>
                        </div>
                      ))}
                    </div>
                    {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
                    <Button onClick={handleSaveTranscript} disabled={saving || transcriptLoading || localWords.length === 0} className="w-full">{saving ? "Saving & Rendering…" : "Save transcript changes"}</Button>
                    <RerenderCostNote clip={clip} />
                  </div>
                )}

                {tab === "publish" && (
                  <div className="ac-panel-in space-y-4">
                    <PublishPanel projectId={projectId} clip={clip} embedded />
                    <div className="pt-1 border-t border-card-border">
                      <DubPanel projectId={projectId} clip={clip} />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-card-border px-5 py-3.5 flex items-center gap-2.5">
                <EditInEditorButton projectId={projectId} clip={clip} className="min-h-[44px] px-4 rounded-xl border border-card-border bg-white text-ink text-[12.5px] font-semibold hover:bg-tint-blue transition-colors disabled:opacity-50" />
                <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download className="flex-1 min-h-[44px] rounded-xl grad-brand text-white text-[13.5px] font-bold shadow-glow flex items-center justify-center">Download clip</a>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Results orchestrator (processing → feed → workspace) ─────────────────────

// A pure function of the query's last-known data, not inline in the
// useQuery call, so the "when do we stop polling" decision is testable
// without needing real or faked timers — react-query calls this itself on
// its own schedule; the test only needs to check what it WOULD return.
export function autoClipPollIntervalMs(data: { project: ProjectMeta; clips: ClipItem[] } | undefined): number | false {
  if (!data) return 2500;
  const settled = data.project.status === "completed" || data.project.status === "failed";
  const inFlight = data.clips.some((c) => c.status === "queued" || c.status === "rendering");
  return !settled || inFlight ? 2500 : false;
}

const DEFAULT_PROJECT_META: ProjectMeta = { status: "rendering", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null };
const EMPTY_CLIPS: ClipItem[] = [];

export function ClipsResults({ projectId, status, error, expectedCount, fileName, onReset }: {
  projectId: string | null;
  status: GenerateStatus;
  error: string | null;
  expectedCount: number;
  fileName: string | null;
  onReset: () => void;
}) {
  const clipsQuery = useQuery({
    queryKey: ["auto-clip-project", projectId],
    queryFn: () => apiFetch<{ project: ProjectMeta; clips: ClipItem[] }>(`/api/projects/${projectId}/clips`),
    enabled: !!projectId,
    // Keep polling while anything could still change — re-evaluated on every
    // fetch (including a failed one, which leaves .data at its last good
    // value: same "silently keep polling on a transient error" behavior the
    // old setInterval had, without a bare catch swallowing the error).
    refetchInterval: (query) => autoClipPollIntervalMs(query.state.data),
  });
  // Stable fallback references, not inline `?? []` / `?? {...}` literals —
  // the edits-seeding effect below depends on `clips` by reference, and a
  // fresh empty array every render (while the query is still loading) would
  // make that dependency look "changed" every render, firing the effect's
  // setState every time and looping forever (verified: reproduced an OOM
  // from a single render with an inline `?? []` here).
  const clips = clipsQuery.data?.clips ?? EMPTY_CLIPS;
  const project = clipsQuery.data?.project ?? DEFAULT_PROJECT_META;
  const fireReviewPrompt = useReviewPromptTrigger();
  const reviewPromptFiredRef = useRef(false);
  const insufficientCredits = useInsufficientCredits();

  // Workspace / review-workspace selection.
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<WorkspaceTab>("edit");
  const [openOrigin, setOpenOrigin] = useState("50% 50%");

  const [sort, setSort] = useState<SortKey>("score");

  const projectStatus = project.status;

  const readyClips = clips.filter((c) => c.status === "ready" && c.videoUrl);
  const sortedClips = [...clips].sort((a, b) => {
    if (sort === "order") return a.index - b.index;
    if (sort === "duration") return b.durationSec - a.durationSec;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  const ready = clips.filter((c) => c.status === "ready").length;
  const total = clips.length || expectedCount;
  const failedHard = status === "failed" || (projectStatus === "failed" && clips.length > 0 && clips.every((c) => c.status === "failed")) || (projectStatus === "failed" && clips.length === 0);
  const analyzing = clips.length === 0 && !failedHard;
  const pendingReview = projectStatus === "pending_review";
  const allDone = projectStatus === "completed";

  useEffect(() => {
    if (!allDone || reviewPromptFiredRef.current) return;
    reviewPromptFiredRef.current = true;
    fireReviewPrompt("autoclips_milestone", { featureHint: "auto_clips" }).catch(() => {});
  }, [allDone, fireReviewPrompt]);

  // ── Review edits (pending_review) ──
  const [edits, setEdits] = useState<Record<string, ReviewEdit>>({});
  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of clips) {
        if (!next[c.id]) next[c.id] = { keep: true, startSec: c.startSec, endSec: c.endSec, aspectRatio: (c.aspectRatio as ReviewEdit["aspectRatio"]) || "9:16" };
      }
      return next;
    });
  }, [clips]);
  const keptCount = Object.values(edits).filter((e) => e.keep).length;
  const firstTrimError = Object.values(edits).map(trimError).find(Boolean) ?? null;

  // Debounce the edits payload the same 300ms the old setTimeout did — keying
  // a query on a value that itself updates on a delay gets the same effect,
  // plus (unlike the manual fetch this replaces) a stale in-flight estimate
  // can no longer clobber a newer one: each distinct payload gets its own
  // query-cache slot, so a late response for an edit the user has since
  // changed just lands in a slot nothing is reading from anymore.
  type EstimatePayload = ({ id: string } & ReviewEdit)[];
  const [debouncedPayload, setDebouncedPayload] = useState<EstimatePayload | null>(null);
  useEffect(() => {
    if (!pendingReview || clips.length === 0 || Object.keys(edits).length === 0 || Object.values(edits).some((e) => trimError(e))) {
      setDebouncedPayload(null);
      return;
    }
    const payload = clips.filter((c) => edits[c.id]).map((c) => ({ id: c.id, ...edits[c.id] }));
    if (payload.length === 0) { setDebouncedPayload(null); return; }
    const timer = setTimeout(() => setDebouncedPayload(payload), 300);
    return () => clearTimeout(timer);
  }, [pendingReview, clips, edits]);

  const estimateQuery = useQuery({
    queryKey: ["auto-clip-estimate", projectId, debouncedPayload],
    queryFn: () => apiFetch<CostEstimate>(`/api/projects/${projectId}/clips/estimate`, { method: "POST", body: JSON.stringify({ clips: debouncedPayload }) }),
    enabled: !!projectId && !!debouncedPayload,
  });
  const estimate = estimateQuery.data ?? null;

  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const confirmMutation = useMutation({
    mutationFn: (payload: EstimatePayload) => apiFetch(`/api/projects/${projectId}/clips/confirm`, { method: "POST", body: JSON.stringify({ clips: payload }) }),
    onSuccess: () => {
      setOpenId(null);
      clipsQuery.refetch();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 402) insufficientCredits.open({ required: err.body.required, balance: err.body.balance, action: "Auto Clips" });
      else setConfirmErr(err instanceof Error ? err.message : "Failed to confirm");
    },
  });
  function handleConfirm() {
    if (!projectId) return;
    setConfirmErr(null);
    const payload = clips.map((c) => ({ id: c.id, ...(edits[c.id] ?? { keep: true, startSec: c.startSec, endSec: c.endSec, aspectRatio: (c.aspectRatio as ReviewEdit["aspectRatio"]) || "9:16" }) }));
    confirmMutation.mutate(payload);
  }

  const openClip = (clip: ClipItem, tab: WorkspaceTab = "edit", origin = "50% 50%") => { setOpenId(clip.id); setOpenTab(tab); setOpenOrigin(origin); };
  const transcriptionFailed = project.warnings?.includes("transcription_failed") ?? false;

  // ── Processing (upload + analysis) — honest, single state ──
  if (analyzing || status === "uploading") {
    const heading = failedHard ? "Something went wrong" : status === "uploading" ? "Uploading your video…" : "Finding your strongest moments";
    return (
      <div className="max-w-xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="relative w-[180px] mx-auto mb-8 rounded-2xl overflow-hidden shadow-card" style={{ aspectRatio: "9/16", background: "linear-gradient(160deg,#1e293b,#0f172a)" }}>
          <div className="ac-shimmer absolute inset-0" />
          <div className="absolute left-0 right-0 bottom-0 p-3.5 text-left">
            <div className="h-2 w-[70%] rounded bg-white/35 mb-1.5" />
            <div className="h-2 w-[45%] rounded bg-white/20" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-ink mb-2">{heading}</h1>
        <p className="text-[15px] text-ink-soft mb-7">{status === "uploading" ? "Uploading your source video…" : `Analyzing speech, pacing and engagement${fileName ? ` across ${fileName}` : ""}.`}</p>
        <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden max-w-[360px] mx-auto mb-2.5 relative">
          <div className="ac-shimmer absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, var(--brand), transparent)" }} />
        </div>
        <p className="text-[13px] text-ink-soft mb-8">Usually 2–5 minutes for an hour of video.</p>
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-card-border bg-white px-4 py-3 text-[13px] text-ink-soft">
          <span className="text-brand"><IcClock /></span>
          You can leave this page — your clips will be ready when you return.
        </div>
        <div className="mt-6"><WarningsBanner warnings={project.warnings} /></div>
      </div>
    );
  }

  if (failedHard) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-20 pb-32 text-center">
        <h1 className="text-2xl font-extrabold text-ink mb-2">Something went wrong</h1>
        <p className="text-[15px] text-ink-soft mb-7">{project.failureReason ?? error ?? "We couldn't generate clips from this video. Please try again."}</p>
        <button onClick={onReset} className="inline-flex items-center gap-2 grad-brand shadow-glow text-white text-sm font-bold px-6 py-3 rounded-xl">Create another</button>
      </div>
    );
  }

  const openIdx = openId ? sortedClips.findIndex((c) => c.id === openId) : -1;
  const openClipItem = openIdx >= 0 ? sortedClips[openIdx] : null;

  return (
    <div className="max-w-[1240px] mx-auto px-6 md:px-8 pt-8 pb-40">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink mb-1.5">{pendingReview ? "Review your clips" : allDone ? "Your clips are ready 🎉" : "Generating your clips"}</h1>
          <p className="text-sm text-ink-soft">
            {pendingReview
              ? `${clips.length} moment${clips.length === 1 ? "" : "s"} pre-selected by score — keep what you want, then render.`
              : `${ready} of ${total} ready${fileName ? ` · ${fileName}` : ""}`}
          </p>
        </div>
        {!pendingReview && readyClips.length > 1 && (
          <div className="flex items-center gap-4">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border-0 bg-transparent py-1.5 text-[13px] font-semibold text-ink-soft cursor-pointer">
              <option value="score">Best first</option>
              <option value="order">Order in video</option>
              <option value="duration">Longest first</option>
            </select>
            <a href={`/api/projects/${projectId}/clips/download-all`} className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors">Download all ({readyClips.length})</a>
          </div>
        )}
        {(allDone || pendingReview) && (
          <button onClick={onReset} className="text-[13px] font-semibold text-brand hover:underline">Create another</button>
        )}
      </div>

      {/* Progress bar while rendering */}
      {!pendingReview && !allDone && (
        <div className="mb-6 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-brand transition-all duration-500" style={{ width: `${total ? (ready / total) * 100 : 0}%` }} />
        </div>
      )}

      <WarningsBanner warnings={project.warnings} />
      {allDone && <div className="mb-4"><ScorePerformanceBanner /></div>}

      {/* Feed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {sortedClips.length > 0
          ? sortedClips.map((c) =>
              pendingReview
                ? (edits[c.id] ? <ReviewClipCard key={c.id} clip={c} edit={edits[c.id]} onChange={(patch) => setEdits((prev) => ({ ...prev, [c.id]: { ...prev[c.id], ...patch } }))} onOpen={(origin) => openClip(c, "edit", origin)} /> : null)
                : <ClipCard key={c.id} projectId={projectId!} clip={c} onChanged={() => clipsQuery.refetch()} onOpen={openClip} />,
            )
          : Array.from({ length: Math.max(1, expectedCount) }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white overflow-hidden shadow-card">
                <div className="relative" style={{ aspectRatio: "9/16", background: "linear-gradient(160deg,#1e293b,#0f172a)" }}><div className="ac-shimmer absolute inset-0" /></div>
                <div className="p-3.5 space-y-2"><div className="h-3 bg-gray-100 rounded animate-pulse" /><div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse" /></div>
              </div>
            ))}
      </div>

      {/* Sticky selection / confirm bar (pending_review) */}
      {pendingReview && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-card-border" style={{ background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)" }}>
          <div className="max-w-[1240px] mx-auto w-full px-6 md:px-8 py-3.5 flex items-center gap-5 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-bold text-ink">{keptCount} of {clips.length} clip{clips.length === 1 ? "" : "s"} selected</p>
              <p className="text-[12.5px] text-ink-soft mt-0.5">
                {firstTrimError
                  ? <span className="text-red-600">Fix the highlighted in/out points — {firstTrimError.toLowerCase()}</span>
                  : estimate
                    ? `Rendering costs ${estimate.total} credit${estimate.total === 1 ? "" : "s"}${estimate.analysisCredit > 0 ? " — analysis already paid" : ""}. ${estimate.sufficient ? `Balance after: ${estimate.balance - estimate.total}.` : `You have ${estimate.balance} — ${estimate.total - estimate.balance} more needed.`}`
                    : "You're only charged for the clips you keep."}
              </p>
              {confirmErr && <p className="text-[12px] text-red-600 mt-0.5">{confirmErr}</p>}
            </div>
            <button onClick={() => setEdits((prev) => { const next: Record<string, ReviewEdit> = {}; for (const [id, e] of Object.entries(prev)) next[id] = { ...e, keep: keptCount > 0 ? false : true }; return next; })} className="text-[13px] font-semibold px-4 py-2.5 rounded-xl border border-card-border bg-white text-ink hover:bg-tint-blue transition-colors">
              {keptCount > 0 ? "Deselect all" : "Select all"}
            </button>
            <button onClick={handleConfirm} disabled={confirmMutation.isPending || keptCount === 0 || !!firstTrimError} className="text-sm font-bold px-6 py-3 rounded-xl grad-brand shadow-glow text-white disabled:opacity-40 disabled:cursor-not-allowed">
              {confirmMutation.isPending ? "Starting render…" : `Confirm & render${estimate ? ` · ${estimate.total} credit${estimate.total === 1 ? "" : "s"}` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Workspace overlay (ready clips) */}
      {openClipItem && !pendingReview && openClipItem.status === "ready" && (
        <ClipWorkspace
          key={openClipItem.id}
          projectId={projectId!}
          clip={openClipItem}
          transcriptionFailed={transcriptionFailed}
          initialTab={openTab}
          expandOrigin={openOrigin}
          index={openIdx}
          total={sortedClips.length}
          onPrev={() => { const p = sortedClips[(openIdx - 1 + sortedClips.length) % sortedClips.length]; if (p) setOpenId(p.id); }}
          onNext={() => { const n = sortedClips[(openIdx + 1) % sortedClips.length]; if (n) setOpenId(n.id); }}
          onClose={() => setOpenId(null)}
          onChanged={() => clipsQuery.refetch()}
        />
      )}

      {/* Review workspace (pending_review — trim/aspect/keep in focus) */}
      {openClipItem && pendingReview && edits[openClipItem.id] && (
        <ReviewWorkspace
          key={openClipItem.id}
          clip={openClipItem}
          edit={edits[openClipItem.id]}
          sourceVideoUrl={project.uploadedVideoUrl}
          expandOrigin={openOrigin}
          index={openIdx}
          total={sortedClips.length}
          onChange={(patch) => setEdits((prev) => ({ ...prev, [openClipItem.id]: { ...prev[openClipItem.id], ...patch } }))}
          onPrev={() => { const p = sortedClips[(openIdx - 1 + sortedClips.length) % sortedClips.length]; if (p) setOpenId(p.id); }}
          onNext={() => { const n = sortedClips[(openIdx + 1) % sortedClips.length]; if (n) setOpenId(n.id); }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// ── Review workspace (pending_review — focused trim/aspect/keep) ─────────────
function ReviewWorkspace({ clip, edit, sourceVideoUrl, expandOrigin, index, total, onChange, onPrev, onNext, onClose }: {
  clip: ClipItem; edit: ReviewEdit; sourceVideoUrl: string | null; expandOrigin: string;
  index: number; total: number;
  onChange: (patch: Partial<ReviewEdit>) => void;
  onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  const band = scoreBand(clip.score);
  const invalid = trimError(edit);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 ac-expand" style={{ background: "var(--surface)", transformOrigin: expandOrigin }}>
      <div className="h-full flex flex-col">
        <div className="ac-rise h-[60px] flex-shrink-0 border-b border-card-border bg-white flex items-center gap-3 px-4">
          <button onClick={onClose} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-card-border bg-white text-ink text-[13px] font-semibold hover:bg-tint-blue transition-colors"><IcChevronLeft /> Back to clips</button>
          <div className="w-px h-6 bg-card-border" />
          <span className="text-sm font-bold text-ink truncate max-w-[38ch]">{clip.title || `Clip ${clip.index + 1}`}</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: band.bg, color: band.text }}><span aria-hidden>{band.icon}</span>{band.label}</span>
          <div className="flex-1" />
          <span className="hidden md:block text-xs text-ink-soft/70">Esc to close</span>
        </div>
        <div className="flex-1 relative overflow-hidden" style={{ background: "#0b1220" }}>
          <div className="ac-stage ac-stage-open" style={{ padding: "20px 24px" }}>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="ac-pop h-full" style={{ aspectRatio: arCss(edit.aspectRatio) }}>
                <TrimmedPreviewPlayer sourceVideoUrl={sourceVideoUrl} startSec={edit.startSec} endSec={edit.endSec} aspectRatio={edit.aspectRatio} className="h-full rounded-2xl overflow-hidden" />
              </div>
            </div>
            <div className="h-[52px] flex-shrink-0 flex items-center justify-center gap-2">
              <button aria-label="Previous clip" onClick={onPrev} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronLeft /></button>
              <span className="text-xs text-white/70 font-medium">Clip {index + 1} of {total}</span>
              <button aria-label="Next clip" onClick={onNext} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronRight /></button>
            </div>
          </div>
          <aside className="ac-tools-panel bg-white flex flex-col">
            <div className="px-5 py-3 border-b border-card-border"><p className="text-sm font-bold text-ink">Trim &amp; frame</p></div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                <div><p className="text-[12.5px] font-semibold text-ink">Keep this clip</p><p className="text-[11px] text-ink-soft">Only kept clips are rendered and charged.</p></div>
                <Switch checked={edit.keep} onChange={(v) => onChange({ keep: v })} label="Keep this clip" />
              </div>
              <div>
                <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-2.5">Timing</h4>
                <div className="flex items-center gap-2">
                  <div className="flex-1"><label className="text-[11px] text-ink-soft block mb-1">Start (s)</label><input type="number" min={0} step={0.5} value={edit.startSec} onChange={(e) => onChange({ startSec: Math.max(0, Number(e.target.value)) })} disabled={!edit.keep} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm disabled:bg-surface" /></div>
                  <span className="text-ink-soft/40 mt-5">—</span>
                  <div className="flex-1"><label className="text-[11px] text-ink-soft block mb-1">End (s)</label><input type="number" min={0} step={0.5} value={edit.endSec} onChange={(e) => onChange({ endSec: Number(e.target.value) })} disabled={!edit.keep} className={`w-full rounded-lg border px-3 py-2 text-sm disabled:bg-surface ${invalid ? "border-red-300" : "border-card-border"}`} /></div>
                </div>
                {invalid ? <p className="text-[11px] font-medium text-red-600 mt-1.5">{invalid}</p> : <p className="text-[11px] text-ink-soft mt-1.5">{fmtTime(Math.max(0, edit.endSec - edit.startSec))} kept</p>}
              </div>
              <div>
                <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-2.5">Aspect ratio</h4>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECTS.map((a) => (
                    <button key={a.value} type="button" disabled={!edit.keep} onClick={() => onChange({ aspectRatio: a.value })} className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40 ${edit.aspectRatio === a.value ? "grad-brand text-white shadow-glow border-transparent" : "bg-white border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                      <span className={`${a.box} border-[1.5px] border-current rounded-[2px]`} />{a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-card-border px-5 py-3.5">
              <button onClick={onClose} className="w-full min-h-[44px] rounded-xl grad-brand text-white text-[13.5px] font-bold shadow-glow">Done — back to clips</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Main flow (single-screen Create + overlay) ───────────────────────────────
type LengthPreset = "short" | "standard" | "long";
const LENGTH_PRESETS: { id: LengthPreset; label: string; min: number; max: number }[] = [
  { id: "short", label: "<30s", min: 5, max: 30 },
  { id: "standard", label: "15–60s", min: 15, max: 60 },
  { id: "long", label: "60s+", min: 60, max: 120 },
];

function AutoClipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const resumeProjectId = params.get("project");

  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [importedUrl, setImportedUrl] = useState<string | null>(null);
  const [importedTitle, setImportedTitle] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // A video reused from the Global Asset Library — already hosted on our S3,
  // so unlike importedUrl (a third-party link the URL-import route still has
  // to download) this only needs a project created with its URL, no import step.
  const [pickedAsset, setPickedAsset] = useState<PickerAsset | null>(null);

  const [minDuration, setMinDuration] = useState(15);
  const [maxDuration, setMaxDuration] = useState(60);
  const [clipCount, setClipCount] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [instructions, setInstructions] = useState("");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyleIndex, setCaptionStyleIndex] = useState(0);

  const [reframingPreset, setReframingPreset] = useState("balanced");
  const [removeSilence, setRemoveSilence] = useState(false);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState(400);
  const [removeFillers, setRemoveFillers] = useState(false);
  const [smartAutoReframe, setSmartAutoReframe] = useState(true);
  const [zoomStrength, setZoomStrength] = useState<"low" | "medium" | "high">("medium");
  const [speakerMode, setSpeakerMode] = useState<"auto" | "single" | "split" | "active">("auto");
  const [smoothness, setSmoothness] = useState(50);
  const [trackingSpeed, setTrackingSpeed] = useState(50);
  const [animatedCaptions, setAnimatedCaptions] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { status: genStatus, error: genError, projectId: genProjectId, generateAutoClip, generateAutoClipForProject, reset } = useVideoGenerate();

  useEffect(() => { return () => { if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); }; }, [videoPreviewUrl]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(f);
    setVideoPreviewUrl(URL.createObjectURL(f));
  }, [videoPreviewUrl]);

  const handleClearFile = useCallback(() => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(null);
    setVideoPreviewUrl(null);
  }, [videoPreviewUrl]);

  const lengthPreset: LengthPreset = LENGTH_PRESETS.find((p) => p.min === minDuration && p.max === maxDuration)?.id ?? "standard";

  const handleGenerate = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    if (!file && pickedAsset) {
      setImportError(null);
      try {
        const created = await apiFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ title: pickedAsset.name, uploadedVideoUrl: pickedAsset.url, productType: "auto-clip" }) });
        await generateAutoClipForProject({
          projectId: created.project.id, token, minDuration, maxDuration, clipCount, aspectRatio, instructions,
          captionStyleIndex: captionsOn ? captionStyleIndex : -1,
          reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
          smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions,
        });
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Couldn't start from that asset");
      }
      return;
    }
    if (!file && importedUrl) {
      setImportError(null);
      try {
        const created = await apiFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ title: importedTitle ?? "Imported video", productType: "auto-clip" }) });
        const projectId = created.project.id;
        await apiFetch(`/api/projects/${projectId}/import-url`, { method: "POST", body: JSON.stringify({ url: importedUrl }) });
        await generateAutoClipForProject({
          projectId, token, minDuration, maxDuration, clipCount, aspectRatio, instructions,
          captionStyleIndex: captionsOn ? captionStyleIndex : -1,
          reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
          smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions,
        });
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Import failed");
      }
      return;
    }
    if (!file) return;
    await generateAutoClip({
      file, minDuration, maxDuration, clipCount, aspectRatio, instructions,
      captionStyleIndex: captionsOn ? captionStyleIndex : -1,
      token, reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
      smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions,
    });
  }, [file, pickedAsset, importedUrl, importedTitle, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionsOn, captionStyleIndex, reframingPreset, removeSilence, silenceThresholdMs, removeFillers, smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions, generateAutoClip, generateAutoClipForProject]);

  const handleReset = useCallback(() => {
    reset();
    handleClearFile();
    setImportedUrl(null); setImportedTitle(null); setImportError(null); setPickedAsset(null);
    setMinDuration(15); setMaxDuration(60); setClipCount(8); setAspectRatio("9:16");
    setInstructions(""); setCaptionsOn(true); setCaptionStyleIndex(0);
    setReframingPreset("balanced"); setRemoveSilence(false); setSilenceThresholdMs(400); setRemoveFillers(false);
    setSmartAutoReframe(true); setZoomStrength("medium"); setSpeakerMode("auto"); setSmoothness(50); setTrackingSpeed(50); setAnimatedCaptions(true);
    setAdvancedOpen(false);
    router.push("/dashboard/create/auto-clip");
  }, [reset, handleClearFile, router]);

  const showOverlay = !!resumeProjectId || genStatus !== "idle";
  const activeProjectId = resumeProjectId ?? genProjectId;
  const canGenerate = !!file || !!importedUrl || !!pickedAsset;

  if (showOverlay) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
        <ClipsResults projectId={activeProjectId} status={resumeProjectId ? "rendering" : genStatus} error={genError} expectedCount={clipCount} fileName={file?.name ?? importedTitle ?? pickedAsset?.name ?? null} onReset={handleReset} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
      <div className="max-w-[720px] mx-auto px-6 pt-12 pb-32">
        <h1 className="text-[32px] font-extrabold tracking-tight text-ink mb-2">AutoClip</h1>
        <p className="text-base text-ink-soft mb-8 max-w-[52ch]">Add a long video. We find the moments worth posting and cut them into ready-to-publish clips.</p>

        {/* Source: file or URL */}
        <input ref={inputRef} type="file" accept="video/mp4,video/mov,video/quicktime,video/webm" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        {file && videoPreviewUrl ? (
          <div className="rounded-[20px] border border-card-border bg-white p-4 flex items-center gap-4">
            <video src={videoPreviewUrl} className="w-28 rounded-xl object-cover bg-black" style={{ aspectRatio: "16/9" }} />
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><IcFile /><span className="truncate">{file.name}</span></div><p className="text-xs text-ink-soft mt-0.5">Ready to analyze</p></div>
            <button onClick={handleClearFile} aria-label="Remove video" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : importedUrl ? (
          <div className="rounded-[20px] border border-card-border bg-white p-4 flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-tint-blue text-brand flex items-center justify-center"><IcCloud /></span>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-ink truncate">{importedTitle}</p><p className="text-xs text-ink-soft mt-0.5">Downloaded from your link when analysis starts.</p></div>
            <button onClick={() => { setImportedUrl(null); setImportedTitle(null); }} aria-label="Use a different source" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : pickedAsset ? (
          <div className="rounded-[20px] border border-card-border bg-white p-4 flex items-center gap-4">
            <video src={pickedAsset.url} className="w-28 rounded-xl object-cover bg-black" style={{ aspectRatio: "16/9" }} />
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><IcFile /><span className="truncate">{pickedAsset.name}</span></div><p className="text-xs text-ink-soft mt-0.5">From your Assets library</p></div>
            <button onClick={() => setPickedAsset(null)} aria-label="Use a different source" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className="rounded-[20px] border border-dashed bg-white px-6 py-11 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors"
              style={{ borderColor: dragging ? "var(--brand)" : "#cbd5e1", background: dragging ? "var(--tint-blue)" : "#fff" }}
            >
              <span className="w-12 h-12 rounded-2xl bg-tint-blue text-brand flex items-center justify-center"><IcCloud /></span>
              <p className="text-base font-semibold text-ink">Drop a video here, or choose a file</p>
              <p className="text-[13px] text-ink-soft">MP4, MOV or WebM · up to 500 MB · 1 min to 1 h 30 m</p>
            </div>
            <div className="flex items-center justify-center gap-2.5 mt-4">
              <AssetField accept={["video"]} label="Choose from Assets" onSelect={(asset) => { handleClearFile(); setImportedUrl(null); setImportedTitle(null); setPickedAsset(asset); }} />
            </div>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-card-border" />
              <span className="text-xs font-semibold text-ink-soft/70 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-card-border" />
            </div>
            <UrlImportField onImported={(info) => { setImportedUrl(info.url); setImportedTitle(info.title); }} />
          </>
        )}

        {importError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{importError}</p>}

        {/* Essentials */}
        <div className="mt-8 rounded-[20px] border border-card-border bg-white p-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-[13px] font-semibold text-ink block mb-2">Clip length</label>
              <div className="flex gap-1.5">
                {LENGTH_PRESETS.map((p) => (
                  <button key={p.id} onClick={() => { setMinDuration(p.min); setMaxDuration(p.max); }}
                    className={`flex-1 rounded-[10px] border py-2.5 text-[13px] font-semibold transition-colors ${lengthPreset === p.id ? "grad-brand text-white shadow-glow border-transparent" : "bg-white border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-ink block mb-2">How many clips</label>
              <div className="flex items-center gap-3 border border-card-border rounded-[10px] px-3 py-1.5">
                <button onClick={() => setClipCount((c) => Math.max(1, c - 1))} aria-label="Fewer clips" className="w-8 h-8 rounded-lg border border-card-border text-ink hover:bg-tint-blue transition-colors">−</button>
                <span className="flex-1 text-center text-sm font-bold text-ink">{clipCount}</span>
                <button onClick={() => setClipCount((c) => Math.min(20, c + 1))} aria-label="More clips" className="w-8 h-8 rounded-lg border border-card-border text-ink hover:bg-tint-blue transition-colors">+</button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[13px] font-semibold text-ink block mb-2">Aspect ratio</label>
            <div className="flex gap-2">
              {ASPECTS.map((a) => (
                <button key={a.value} onClick={() => setAspectRatio(a.value)} className={`inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${aspectRatio === a.value ? "grad-brand text-white shadow-glow border-transparent" : "bg-white border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                  <span className={`${a.box} border-[1.5px] border-current rounded-[2px]`} />{a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[13px] font-semibold text-ink">Captions</p><p className="text-xs text-ink-soft mt-0.5">Burned in, word-by-word — style below.</p></div>
            <Switch checked={captionsOn} onChange={setCaptionsOn} label="Captions" />
          </div>
          {captionsOn && <SubtitleStylePicker value={captionStyleIndex} onChange={setCaptionStyleIndex} />}

          <div className="h-px bg-card-border" />

          <button onClick={() => setAdvancedOpen((o) => !o)} className="flex items-center justify-between w-full text-left">
            <span className="flex flex-col"><span className="text-[13px] font-semibold text-ink">Advanced</span><span className="text-xs text-ink-soft">Reframe, camera motion, zoom, speaker mode, audio cleanup, instructions</span></span>
            <span className="text-[12px] font-semibold text-brand">{advancedOpen ? "Hide" : "Show"}</span>
          </button>
          {advancedOpen && (
            <div className="ac-panel-in flex flex-col gap-5 border-t border-card-border pt-5">
              <ReframeAndCutsControls
                smartAutoReframe={smartAutoReframe} setSmartAutoReframe={setSmartAutoReframe}
                reframingPreset={reframingPreset} setReframingPreset={setReframingPreset}
                zoomStrength={zoomStrength} setZoomStrength={setZoomStrength}
                speakerMode={speakerMode} setSpeakerMode={setSpeakerMode}
                smoothness={smoothness} setSmoothness={setSmoothness}
                trackingSpeed={trackingSpeed} setTrackingSpeed={setTrackingSpeed}
                removeSilence={removeSilence} setRemoveSilence={setRemoveSilence}
                silenceThresholdMs={silenceThresholdMs} setSilenceThresholdMs={setSilenceThresholdMs}
                removeFillers={removeFillers} setRemoveFillers={setRemoveFillers}
              />
              {captionsOn && (
                <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                  <div><p className="text-[12.5px] font-semibold text-ink">Animated subtitles</p><p className="text-[11px] text-ink-soft">Highlight words with dynamic sizes and colours like Opus Clip.</p></div>
                  <Switch checked={animatedCaptions} onChange={setAnimatedCaptions} label="Animated subtitles" />
                </div>
              )}
              <div>
                <label className="text-[12px] font-bold text-ink-soft uppercase tracking-wider block mb-2">Instructions (optional)</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="e.g. Focus on funny moments, avoid silent parts, prioritize high-energy sections…" className="w-full rounded-xl border border-card-border bg-white px-3 py-3 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all resize-none" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-7 flex-wrap">
          <button onClick={handleGenerate} disabled={!canGenerate} className="inline-flex items-center gap-2.5 grad-brand shadow-glow hover:shadow-glow-hover hover:brightness-105 text-white text-base font-bold px-8 py-4 rounded-[14px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <IcSparkle /> Generate clips
          </button>
          <p className="text-[13px] text-ink-soft">Analysis costs 1 credit. You only pay for the clips you keep.</p>
        </div>
      </div>
    </div>
  );
}

export default function AutoClipPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>}>
      <AutoClipFlow />
    </Suspense>
  );
}
