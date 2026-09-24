"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { type LiteEdits } from "@/app/components/auto-clip/LiteEditTab";
import { getStoredToken } from "@/app/hooks/useVideoGenerate";

// ── Icons ────────────────────────────────────────────────────────────────────
export function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
export function IcCloud() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
}
export function IcFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
export function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
export function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>;
}
export function IcChevronLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>;
}
export function IcChevronRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
export function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z" /></svg>;
}
export function IcMore() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>;
}
export function IcClock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}

export const AUTH_HEADERS = () => ({ Authorization: `Bearer ${getStoredToken() ?? ""}` });

export class ApiError extends Error {
  status: number;
  body: { error?: string; required?: number; balance?: number };
  constructor(status: number, body: { error?: string; required?: number; balance?: number }) {
    super(body.error ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...AUTH_HEADERS(), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data as { error?: string });
  return data as T;
}

export type SortKey = "score" | "order" | "duration";

// ── Shared types ─────────────────────────────────────────────────────────────
export interface ScoreBreakdown {
  hook: number; pacing: number; payoff: number; engagement: number;
  // Measured off the rendered clip's own audio by lib/virality-score.ts and
  // folded into the composite. `silence` was computed and stored but never
  // declared here, so it was invisible to the UI that shows the others.
  audio: number; speechRate: number; silence?: number; composite: number;
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
  status: string; // queued | rendering | ready | failed
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
  /** Why this clip failed, in words a creator can act on. */
  failureReason?: string | null;
}
export interface ScoreBreakdownWithInsights extends ScoreBreakdown {
  // All nullable: the pipeline no longer substitutes invented text when the
  // model returns nothing, so null here genuinely means "not available".
  reasoning?: string | null;
  hookExplanation?: string | null;
  retentionPrediction?: string | null;
  audience?: string | null;
  platform?: string | null;
  suggestedPostingTime?: string | null;
  hashtags?: string[] | null;
  suggestedCaption?: string | null;
}

/** One "Label — value" row that says so when there is no value. */
export function InsightRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      {value ? (
        <span className="text-ink font-semibold text-right">{value}</span>
      ) : (
        <span className="text-ink-soft/40 italic text-right">Not available</span>
      )}
    </div>
  );
}

// Every "Apply" in the workspace re-renders the clip. The first re-render of
// each clip is free; after that it costs a credit.
export function RerenderCostNote({ clip }: { clip: ClipItem }) {
  return (
    <p className="text-[11px] text-ink-soft text-center">
      {clip.rerenderCount === 0
        ? "Your first re-render of this clip is free."
        : "Applying changes re-renders this clip (1 credit)."}
    </p>
  );
}
export interface ProjectMeta { status: string; warnings: string[] | null; failureReason: string | null; captionStyleIndex: number | null; uploadedVideoUrl: string | null; updatedAt?: string }

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// A single number badge means nothing on its own. A labelled band + icon + colour
// makes the keep/post decision scannable, and survives colour-blindness/greyscale.
export function scoreBand(score: number | null): { label: string; icon: string; text: string; bg: string; border: string } {
  // Tokens, not hex: these were light-theme pastels, and the "Why this clip
  // works" card set near-white body text on top of them — unreadable.
  if (score != null && score >= 75) return { label: "High potential", icon: "▲", text: "var(--success)", bg: "var(--tint-emerald)", border: "var(--tint-emerald-border)" };
  if (score != null && score >= 50) return { label: "Good potential", icon: "◆", text: "var(--warning)", bg: "var(--tint-amber)", border: "var(--tint-amber-border)" };
  return { label: "Needs review", icon: "•", text: "var(--fg-muted)", bg: "var(--surface-3)", border: "var(--line)" };
}
export function arCss(aspect: string): string {
  return aspect === "16:9" ? "16/9" : aspect === "1:1" ? "1/1" : "9/16";
}

export const ASPECTS: { value: "9:16" | "16:9" | "1:1"; label: string; box: string }[] = [
  { value: "9:16", label: "9:16", box: "w-[9px] h-4" },
  { value: "16:9", label: "16:9", box: "w-4 h-[9px]" },
  { value: "1:1", label: "1:1", box: "w-[13px] h-[13px]" },
];

// The scheduler writes statuses the UI never knew about — "awaiting_manual"
// and "expired" — and a bare `capitalize` rendered the first of those as
// "Awaiting_manual". Unknown values still fall through to something readable
// rather than a raw enum.
export const PUBLISH_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  linked: "Linked",
  failed: "Failed",
  awaiting_manual: "Ready to post",
  expired: "Expired",
};
export function publishStatusLabel(status: string): string {
  return PUBLISH_STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// A one-line reason a creator can act on, distilled from the AI breakdown.
export function clipReason(clip: ClipItem): string {
  const bd = clip.scoreBreakdown as unknown as ScoreBreakdownWithInsights | null;
  if (bd?.reasoning) return bd.reasoning;
  const band = scoreBand(clip.score).label;
  if (clip.mood) return `${clip.mood[0].toUpperCase()}${clip.mood.slice(1)} moment · ${band.toLowerCase()}`;
  return band;
}

