"use client";
import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SubtitleStylePicker from "@/app/components/SubtitleStylePicker";
import { useVideoGenerate, getStoredToken, type GenerateStatus } from "@/app/hooks/useVideoGenerate";
import { registerAsset, type AssetRow } from "@/app/dashboard/editor/components/panels/MediaPanel";

// ── Icons ────────────────────────────────────────────────────────────────────
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcCloud() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
}
function IcFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcScissors() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
}
function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>;
}
function IcChevronLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>;
}
function IcChevronRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z" /></svg>;
}
function IcWarning() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>;
}

const AUTH_HEADERS = () => ({ Authorization: `Bearer ${getStoredToken() ?? ""}` });

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...AUTH_HEADERS(), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "upload-video", label: "Upload" },
  { id: "instructions", label: "Instructions" },
  { id: "review", label: "Review" },
];

const WARNING_COPY: Record<string, string> = {
  transcription_failed: "Transcription failed for this video — clip selection, titles, and captions may be lower quality than usual.",
  reframe_unavailable: "Automatic speaker tracking isn't available for this video — clips use a centered crop instead of following the speaker.",
};

// ── Shared types ─────────────────────────────────────────────────────────────
interface ScoreBreakdown {
  hook: number; pacing: number; payoff: number; engagement: number;
  audio: number; speechRate: number; composite: number;
}
interface ClipItem {
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
}
interface ProjectMeta { status: string; warnings: string[] | null; captionStyleIndex: number | null }

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function scoreColor(score: number | null): { bg: string; text: string } {
  if (score == null) return { bg: "#f1f5f9", text: "#64748b" };
  if (score >= 75) return { bg: "#dcfce7", text: "#15803d" };
  if (score >= 50) return { bg: "#fef9c3", text: "#a16207" };
  return { bg: "#f1f5f9", text: "#64748b" };
}
function arCss(aspect: string): string {
  return aspect === "16:9" ? "16/9" : aspect === "1:1" ? "1/1" : "9/16";
}

const ASPECTS: { value: "9:16" | "16:9" | "1:1"; label: string }[] = [
  { value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" }, { value: "1:1", label: "1:1" },
];

function WarningsBanner({ warnings }: { warnings: string[] | null | undefined }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <IcWarning />
          <span>{WARNING_COPY[w] ?? w}</span>
        </div>
      ))}
    </div>
  );
}

// ── Review step (P1.2 / P1.4) ───────────────────────────────────────────────
interface ReviewEdit { keep: boolean; startSec: number; endSec: number; aspectRatio: "9:16" | "16:9" | "1:1" }

function ReviewCard({ clip, edit, onChange }: {
  clip: ClipItem;
  edit: ReviewEdit;
  onChange: (patch: Partial<ReviewEdit>) => void;
}) {
  const sc = scoreColor(clip.score);
  return (
    <div className={`rounded-2xl border bg-white overflow-hidden flex flex-col shadow-sm transition-opacity ${edit.keep ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{clip.title || `Clip ${clip.index + 1}`}</p>
          <div className="flex items-center gap-2 mt-1">
            {clip.score != null && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{clip.score}</span>
            )}
            {clip.mood && <span className="text-xs text-gray-400 capitalize">{clip.mood}</span>}
            {clip.hasCaptions && <span className="text-xs text-gray-400">• captions</span>}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 shrink-0 cursor-pointer">
          <input type="checkbox" checked={edit.keep} onChange={(e) => onChange({ keep: e.target.checked })} className="w-4 h-4 accent-[#3860FF]" />
          Keep
        </label>
      </div>
      <div className="px-3 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 block mb-0.5">Start (s)</label>
            <input
              type="number" min={0} step={0.5} value={edit.startSec}
              onChange={(e) => onChange({ startSec: Math.max(0, Number(e.target.value)) })}
              disabled={!edit.keep}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
            />
          </div>
          <span className="text-gray-300 mt-3">—</span>
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 block mb-0.5">End (s)</label>
            <input
              type="number" min={0} step={0.5} value={edit.endSec}
              onChange={(e) => onChange({ endSec: Number(e.target.value) })}
              disabled={!edit.keep}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 disabled:bg-gray-50"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">{fmtTime(Math.max(0, edit.endSec - edit.startSec))} duration</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.value} type="button" disabled={!edit.keep}
              onClick={() => onChange({ aspectRatio: a.value })}
              className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                edit.aspectRatio === a.value ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-600"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ projectId, clips, onConfirmed }: { projectId: string; clips: ClipItem[]; onConfirmed: () => void }) {
  const [edits, setEdits] = useState<Record<string, ReviewEdit>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of clips) {
        if (!next[c.id]) {
          next[c.id] = { keep: true, startSec: c.startSec, endSec: c.endSec, aspectRatio: (c.aspectRatio as "9:16" | "16:9" | "1:1") || "9:16" };
        }
      }
      return next;
    });
  }, [clips]);

  const keptCount = Object.values(edits).filter((e) => e.keep).length;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = clips.map((c) => ({ id: c.id, ...edits[c.id] }));
      await apiFetch(`/api/projects/${projectId}/clips/confirm`, {
        method: "POST",
        body: JSON.stringify({ clips: payload }),
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">Adjust in/out points, drop clips you don&apos;t want, or change the aspect ratio per clip — you&apos;re only charged for what you keep.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {clips.map((c) => edits[c.id] ? (
          <ReviewCard key={c.id} clip={c} edit={edits[c.id]} onChange={(patch) => setEdits((prev) => ({ ...prev, [c.id]: { ...prev[c.id], ...patch } }))} />
        ) : null)}
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <button
        onClick={handleConfirm}
        disabled={submitting || keptCount === 0}
        className="inline-flex items-center gap-2 bg-[#3860FF] hover:bg-[#2d50e0] text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <IcSparkle /> {submitting ? "Starting render…" : `Confirm & Render ${keptCount} clip${keptCount === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

// ── Per-clip actions on a ready clip: re-render, edit in editor, dub, publish ─

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
    return <button onClick={() => setOpen(true)} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Re-render</button>;
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-gray-200 p-2">
      <div className="flex items-center gap-2">
        <input type="number" step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs" />
        <span className="text-gray-300">—</span>
        <input type="number" step={0.5} value={end} onChange={(e) => setEnd(Number(e.target.value))} className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs" />
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-[#3860FF] text-white disabled:opacity-50">{busy ? "…" : "Re-render (1 credit)"}</button>
        <button onClick={() => setOpen(false)} className="text-xs font-semibold py-1.5 px-2 rounded-lg border border-gray-200 text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function EditInEditorButton({ projectId, clip }: { projectId: string; clip: ClipItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { editorProjectId, asset } = await apiFetch<{ editorProjectId: string; asset: AssetRow }>(`/api/projects/${projectId}/clips/${clip.id}/edit-in-editor`, { method: "POST" });
      // The editor's MediaPanel asset cache doesn't know about an asset
      // created server-side here until it refetches — register it up front
      // so PreviewStage's <video> doesn't briefly render with an empty src
      // (see registerAsset's doc comment in MediaPanel.tsx).
      registerAsset(asset);
      router.push(`/dashboard/editor?projectId=${editorProjectId}`);
    } catch {
      setBusy(false);
    }
  }
  return <button onClick={go} disabled={busy} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">{busy ? "Opening…" : "Edit"}</button>;
}

interface DubItem { id: string; targetLang: string; status: string; videoUrl: string | null }
interface DubLang { code: string; label: string }

function DubPanel({ projectId, clip }: { projectId: string; clip: ClipItem }) {
  const [open, setOpen] = useState(false);
  const [langs, setLangs] = useState<DubLang[]>([]);
  const [dubs, setDubs] = useState<DubItem[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ dubs: DubItem[]; languages: DubLang[] }>(`/api/projects/${projectId}/clips/${clip.id}/dub`);
      setDubs(d.dubs); setLangs(d.languages);
      if (!selected && d.languages[0]) setSelected(d.languages[0].code);
    } catch { /* ignore */ }
  }, [projectId, clip.id, selected]);

  useEffect(() => {
    if (!open) return;
    load();
    const hasPending = dubs.some((d) => d.status === "dubbing");
    if (!hasPending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load, dubs.length]);

  async function startDub() {
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/dub`, { method: "POST", body: JSON.stringify({ targetLang: selected }) });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Dub</button>;
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-gray-200 p-2">
      <div className="flex items-center gap-2">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs">
          {langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button onClick={startDub} disabled={busy} className="text-xs font-semibold py-1.5 px-2 rounded-lg bg-[#3860FF] text-white disabled:opacity-50">{busy ? "…" : "Dub (1 credit)"}</button>
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      {dubs.length > 0 && (
        <ul className="space-y-1">
          {dubs.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-[11px] text-gray-600">
              <span>{langs.find((l) => l.code === d.targetLang)?.label ?? d.targetLang}</span>
              {d.status === "ready" && d.videoUrl ? <a href={d.videoUrl} download className="text-[#3860FF] font-semibold">Download</a> : <span className="capitalize text-gray-400">{d.status}</span>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-500">Close</button>
    </div>
  );
}

interface PublishAccount { id: string; provider: string; username: string | null; displayName: string | null }
interface PublishItem { id: string; permalink: string | null; status: string; socialAccount: { provider: string; username: string | null } }

function PublishPanel({ projectId, clip }: { projectId: string; clip: ClipItem }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<PublishAccount[]>([]);
  const [publishes, setPublishes] = useState<PublishItem[]>([]);
  const [accountId, setAccountId] = useState("");
  const [permalink, setPermalink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ accounts: PublishAccount[]; publishes: PublishItem[] }>(`/api/projects/${projectId}/clips/${clip.id}/publish`)
      .then((d) => { setAccounts(d.accounts); setPublishes(d.publishes); if (!accountId && d.accounts[0]) setAccountId(d.accounts[0].id); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isYoutube = selectedAccount?.provider === "youtube";

  async function submit(body: { permalink?: string }) {
    if (!accountId) return;
    setBusy(true); setErr(null); setNeedsReauth(false);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ socialAccountId: accountId, ...body }),
      });
      setPermalink("");
      const d = await apiFetch<{ accounts: PublishAccount[]; publishes: PublishItem[] }>(`/api/projects/${projectId}/clips/${clip.id}/publish`);
      setPublishes(d.publishes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      if (e instanceof Error && /reconnect/i.test(e.message)) setNeedsReauth(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Publish</button>;
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-gray-200 p-2">
      {accounts.length === 0 ? (
        <p className="text-[11px] text-gray-500">Connect a social account in Social Tracker first.</p>
      ) : (
        <>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.displayName ?? a.username ?? a.id.slice(0, 6)}</option>)}
          </select>
          {isYoutube ? (
            <>
              <p className="text-[10px] text-gray-400">Uploads this clip directly to YouTube as Unlisted — change visibility on YouTube afterward if you want it Public.</p>
              {err && <p className="text-[11px] text-red-600">{err} {needsReauth && <a href="/dashboard/social-tracker" className="underline font-semibold">Reconnect →</a>}</p>}
              <button onClick={() => submit({})} disabled={busy} className="w-full text-xs font-semibold py-1.5 rounded-lg bg-[#3860FF] text-white disabled:opacity-50">{busy ? "Uploading…" : "Publish to YouTube"}</button>
            </>
          ) : (
            <>
              <input
                value={permalink} onChange={(e) => setPermalink(e.target.value)}
                placeholder="Paste the live post URL after posting manually"
                className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
              />
              <p className="text-[10px] text-gray-400">Instagram/Facebook auto-publish needs a Meta app review this app hasn&apos;t completed — post it yourself, then paste the link here to track its performance.</p>
              {err && <p className="text-[11px] text-red-600">{err}</p>}
              <button onClick={() => submit({ permalink: permalink || undefined })} disabled={busy} className="w-full text-xs font-semibold py-1.5 rounded-lg bg-[#3860FF] text-white disabled:opacity-50">{busy ? "…" : "Save link"}</button>
            </>
          )}
        </>
      )}
      {publishes.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-gray-100">
          {publishes.map((p) => (
            <li key={p.id} className="text-[11px] text-gray-600 flex items-center justify-between gap-2">
              <span className="truncate">{p.socialAccount.provider} — {p.socialAccount.username ?? "linked"}</span>
              {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="text-[#3860FF] font-semibold shrink-0">View</a> : <span className="capitalize text-gray-400 shrink-0">{p.status}</span>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-500">Close</button>
    </div>
  );
}

// ── Clip results (Opus-style grid) ──────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gray-100 animate-pulse" style={{ aspectRatio: "9/16" }} />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-100 rounded animate-pulse" />
        <div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

function ClipCard({ projectId, clip, onChanged }: { projectId: string; clip: ClipItem; onChanged: () => void }) {
  const [playing, setPlaying] = useState(false);
  const sc = scoreColor(clip.score);
  const ready = clip.status === "ready";
  const failed = clip.status === "failed";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col shadow-sm">
      <div className="relative bg-gray-900" style={{ aspectRatio: arCss(clip.aspectRatio) }}>
        {ready && playing && clip.videoUrl ? (
          <video src={clip.videoUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
        ) : (
          <>
            {clip.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-100 animate-pulse" />
            )}
            {ready ? (
              <button onClick={() => setPlaying(true)} className="absolute inset-0 flex items-center justify-center bg-black/15 hover:bg-black/25 transition-colors group">
                <span className="w-12 h-12 rounded-full bg-white/90 text-gray-900 flex items-center justify-center group-hover:scale-105 transition-transform"><IcPlay /></span>
              </button>
            ) : failed ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-medium">Failed to render</div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white">
                <div className="w-9 h-9 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
                <span className="text-xs font-semibold">{clip.status === "queued" ? "Queued" : `${clip.progress}%`}</span>
              </div>
            )}
            {clip.score != null && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm" style={{ background: sc.bg, color: sc.text }}>
                {clip.score}
              </span>
            )}
          </>
        )}
        {!ready && !failed && clip.status === "rendering" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
            <div className="h-full bg-[#3860FF] transition-all duration-500" style={{ width: `${clip.progress}%` }} />
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{clip.title || `Clip ${clip.index + 1}`}</p>
        <p className="text-xs text-gray-400">{fmtTime(clip.durationSec)} • {fmtTime(clip.startSec)}–{fmtTime(clip.endSec)}{clip.mood ? ` • ${clip.mood}` : ""}{clip.brollQuery ? " • B-roll" : ""}</p>
        {ready && clip.videoUrl && (
          <div className="flex flex-col gap-2 mt-auto pt-1">
            <div className="flex gap-2">
              <a href={clip.videoUrl} download className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Download</a>
              <EditInEditorButton projectId={projectId} clip={clip} />
            </div>
            <div className="flex gap-2">
              <RerenderPanel projectId={projectId} clip={clip} onQueued={onChanged} />
              <DubPanel projectId={projectId} clip={clip} />
            </div>
            <PublishPanel projectId={projectId} clip={clip} />
          </div>
        )}
      </div>
    </div>
  );
}

function ClipsResults({ projectId, status, error, expectedCount, onReset }: {
  projectId: string | null;
  status: GenerateStatus;
  error: string | null;
  expectedCount: number;
  onReset: () => void;
}) {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [project, setProject] = useState<ProjectMeta>({ status: "rendering", warnings: null, captionStyleIndex: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(async () => {
    if (!projectId) return;
    try {
      const d = await apiFetch<{ project: ProjectMeta; clips: ClipItem[] }>(`/api/projects/${projectId}/clips`);
      setClips(d.clips ?? []);
      setProject(d.project ?? { status: "rendering", warnings: null, captionStyleIndex: null });
      if ((d.project.status === "completed" || d.project.status === "failed") && pollRef.current) {
        clearInterval(pollRef.current);
      }
    } catch { /* keep polling */ }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [projectId, tick]);

  const projectStatus = project.status;
  const ready = clips.filter((c) => c.status === "ready").length;
  const total = clips.length || expectedCount;
  const failedHard = status === "failed" || (projectStatus === "failed" && clips.length > 0 && clips.every((c) => c.status === "failed")) || (projectStatus === "failed" && clips.length === 0);
  const analyzing = clips.length === 0 && !failedHard;
  const pendingReview = projectStatus === "pending_review";
  const allDone = projectStatus === "completed";

  let heading: string;
  if (failedHard) heading = "Something went wrong";
  else if (status === "uploading") heading = "Uploading your video…";
  else if (analyzing) heading = "Analyzing your video for the best moments…";
  else if (pendingReview) heading = "Review your clips";
  else if (allDone) heading = "Your clips are ready 🎉";
  else heading = "Generating your clips";

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl w-full mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {!failedHard && !allDone && !pendingReview && <div className="w-6 h-6 border-[3px] border-blue-200 border-t-[#3860FF] rounded-full animate-spin" />}
            <h2 className="text-xl font-bold text-gray-900">{heading}</h2>
          </div>
          {!analyzing && !failedHard && !pendingReview && (
            <span className="text-sm font-semibold text-gray-500">{ready} / {total} ready</span>
          )}
          {(allDone || failedHard) && (
            <button onClick={onReset} className="text-sm font-semibold text-[#3860FF] hover:underline">Create another</button>
          )}
        </div>
        {!analyzing && !failedHard && !pendingReview && (
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#3860FF] transition-all duration-500" style={{ width: `${total ? (ready / total) * 100 : 0}%` }} />
          </div>
        )}
        {failedHard && (
          <p className="text-sm text-gray-500 mt-2">{error ?? "We couldn't generate clips from this video. Please try again."}</p>
        )}
        <div className="mt-3"><WarningsBanner warnings={project.warnings} /></div>
      </div>

      {pendingReview && projectId ? (
        <ReviewPanel projectId={projectId} clips={clips} onConfirmed={tick} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {clips.length > 0
            ? clips.map((c) => <ClipCard key={c.id} projectId={projectId!} clip={c} onChanged={tick} />)
            : !failedHard && Array.from({ length: Math.max(1, expectedCount) }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
    </div>
  );
}

// ── Stepper Bar ──────────────────────────────────────────────────────────────
function StepperBar({
  stepIndex, onBack, onNext, onGenerate, canNext, isLastStep,
}: {
  stepIndex: number; onBack: () => void; onNext: () => void; onGenerate: () => void; canNext: boolean; isLastStep: boolean;
}) {
  return (
    <div className="mx-4 mt-4 rounded-xl bg-[#F7F7F7] px-3 py-3 md:rounded-2xl md:px-5 md:py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-1 sm:gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={`flex min-h-[44px] min-w-0 items-center gap-1.5 px-2 py-2 text-left text-sm font-medium sm:px-3 sm:gap-2 ${
                i <= stepIndex ? "text-gray-900" : "text-gray-400 cursor-not-allowed"
              }`}
              disabled={i > stepIndex}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  i === stepIndex ? "bg-[#3860FF] text-white" : i < stepIndex ? "bg-green-500 text-white" : "text-gray-400"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {stepIndex > 0 && (
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <IcChevronLeft /> Back
            </button>
          )}
          {isLastStep ? (
            <button onClick={onGenerate} disabled={!canNext} className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed bg-[#3860FF] hover:bg-[#2d50e0]">
              <IcSparkle /> Analyze
            </button>
          ) : (
            <button onClick={onNext} disabled={!canNext} className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed bg-[#3860FF] hover:bg-[#2d50e0]">
              Next <IcChevronRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Upload Video ────────────────────────────────────────────────────
function Step1Upload({ file, videoPreviewUrl, onFile, onClearFile }: {
  file: File | null; videoPreviewUrl: string | null; onFile: (f: File) => void; onClearFile: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-3 sm:p-5 md:min-h-[440px] md:p-10">
          {videoPreviewUrl ? (
            <div className="w-full flex flex-col items-center gap-4">
              <video src={videoPreviewUrl} controls className="w-full max-h-[360px] rounded-lg object-contain" />
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <IcFile />
                <span className="truncate max-w-[200px]">{file?.name}</span>
                <button onClick={onClearFile} className="text-gray-400 hover:text-gray-600 transition-colors ml-1">
                  <IcX />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <IcFilm />
              <p className="text-sm font-medium">No video selected</p>
            </div>
          )}
        </div>

        <div className="w-full md:w-[340px] flex flex-col gap-4">
          <input
            ref={inputRef} type="file" accept="video/mp4,video/mov,video/quicktime,video/webm" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
          />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/30"
            style={{ borderColor: dragging ? "#3860FF" : undefined, background: dragging ? "#eff6ff" : undefined }}
          >
            <div className="text-blue-500"><IcCloud /></div>
            <p className="text-sm font-medium text-gray-700 text-center">Choose a video or drag & drop</p>
            <p className="text-xs text-gray-400">MP4, MOV, WebM — up to 500 MB</p>
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-[#3860FF] hover:bg-[#2d50e0] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Upload Video
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Tips for best results:</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />Include speech to determine the viral moments</li>
              <li className="flex items-start gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />Video should be at least 1 minute long</li>
              <li className="flex items-start gap-2"><span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />Video should be under 1 hour 30 minutes long</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Instructions (+ captions, P0.3) ─────────────────────────────────
function Step2Instructions({
  minDuration, setMinDuration, maxDuration, setMaxDuration, clipCount, setClipCount,
  aspectRatio, setAspectRatio, instructions, setInstructions, captionsOn, setCaptionsOn,
  captionStyleIndex, setCaptionStyleIndex, fileName,
}: {
  minDuration: number; setMinDuration: (v: number) => void;
  maxDuration: number; setMaxDuration: (v: number) => void;
  clipCount: number; setClipCount: (v: number) => void;
  aspectRatio: "9:16" | "16:9" | "1:1"; setAspectRatio: (v: "9:16" | "16:9" | "1:1") => void;
  instructions: string; setInstructions: (v: string) => void;
  captionsOn: boolean; setCaptionsOn: (v: boolean) => void;
  captionStyleIndex: number; setCaptionStyleIndex: (v: number) => void;
  fileName: string | null;
}) {
  return (
    <div className="flex-1 flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl flex flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Clip Settings</h2>
            <p className="text-sm text-gray-500">Configure how your video will be split into clips.</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700">Clip Duration (seconds)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Min</label>
                <input type="number" min={5} max={300} value={minDuration}
                  onChange={(e) => setMinDuration(Math.max(5, Math.min(Number(e.target.value), maxDuration - 1)))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400" />
              </div>
              <span className="text-gray-300 mt-5">—</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input type="number" min={5} max={300} value={maxDuration}
                  onChange={(e) => setMaxDuration(Math.max(minDuration + 1, Math.min(Number(e.target.value), 300)))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Number of Clips</label>
            <input type="number" min={1} max={20} value={clipCount}
              onChange={(e) => setClipCount(Math.max(1, Math.min(Number(e.target.value), 20)))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400" />
            <p className="text-xs text-gray-400">Generate between 1 and 20 clips</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Default Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((r) => (
                <button key={r.value} onClick={() => setAspectRatio(r.value)}
                  className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                    aspectRatio === r.value ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}>
                  <p className="text-sm font-semibold">{r.label}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">You can override this per clip in the review step</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">Captions</label>
              <button
                type="button" onClick={() => setCaptionsOn(!captionsOn)}
                className={`relative w-10 h-6 rounded-full transition-colors ${captionsOn ? "bg-[#3860FF]" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${captionsOn ? "translate-x-4" : ""}`} />
              </button>
            </div>
            {captionsOn && (
              <SubtitleStylePicker value={captionStyleIndex} onChange={setCaptionStyleIndex} />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Instructions (optional)</label>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Focus on funny moments, avoid silent parts, prioritize high-energy sections..."
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 resize-none"
              rows={4} />
          </div>
        </div>

        <div className="w-full md:w-[300px] flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Settings Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">File</span><span className="text-gray-900 font-medium truncate max-w-[160px]">{fileName ?? "—"}</span></div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between"><span className="text-gray-500">Duration range</span><span className="text-gray-900 font-medium">{minDuration}s – {maxDuration}s</span></div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between"><span className="text-gray-500">Clips</span><span className="text-gray-900 font-medium">{clipCount}</span></div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between"><span className="text-gray-500">Aspect ratio</span><span className="text-gray-900 font-medium">{aspectRatio}</span></div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between"><span className="text-gray-500">Captions</span><span className="text-gray-900 font-medium">{captionsOn ? "On" : "Off"}</span></div>
              {instructions.trim() && (
                <>
                  <div className="h-px bg-gray-100" />
                  <div><span className="text-gray-500">Instructions</span><p className="text-gray-700 mt-1 text-xs leading-relaxed">{instructions}</p></div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Review & Analyze ─────────────────────────────────────────────────
function Step3Review({ fileName, minDuration, maxDuration, clipCount, aspectRatio, captionsOn, instructions, onGenerate }: {
  fileName: string | null; minDuration: number; maxDuration: number; clipCount: number;
  aspectRatio: string; captionsOn: boolean; instructions: string; onGenerate: () => void;
}) {
  const rows = [
    { label: "Source video", value: fileName ?? "—" },
    { label: "Clip duration", value: `${minDuration}s – ${maxDuration}s` },
    { label: "Number of clips", value: String(clipCount) },
    { label: "Aspect ratio", value: aspectRatio },
    { label: "Captions", value: captionsOn ? "On" : "Off" },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <div className="text-gray-400"><IcScissors /></div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Ready to analyze</h2>
          <p className="text-sm text-gray-500">We&apos;ll pick the best moments — you&apos;ll review and adjust them before anything renders, and credits are only charged once you confirm.</p>
        </div>

        <div className="w-full rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className="text-gray-900 font-medium truncate max-w-[200px]">{r.value}</span>
              </div>
              {i < rows.length - 1 && <div className="h-px bg-gray-100 mt-3" />}
            </div>
          ))}
          {instructions.trim() && (
            <>
              <div className="h-px bg-gray-100" />
              <div className="text-sm"><span className="text-gray-500">Instructions</span><p className="text-gray-700 mt-1 text-xs leading-relaxed">{instructions}</p></div>
            </>
          )}
        </div>

        <button onClick={onGenerate} className="inline-flex items-center gap-2 bg-[#3860FF] hover:bg-[#2d50e0] text-white text-sm font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm">
          <IcSparkle /> Analyze Video
        </button>
      </div>
    </div>
  );
}

// ── Main Flow ────────────────────────────────────────────────────────────────
function AutoClipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const stepParam = params.get("step") || "upload-video";
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === stepParam));
  const resumeProjectId = params.get("project");

  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  const [minDuration, setMinDuration] = useState(15);
  const [maxDuration, setMaxDuration] = useState(60);
  const [clipCount, setClipCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [instructions, setInstructions] = useState("");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyleIndex, setCaptionStyleIndex] = useState(0);

  const { status: genStatus, error: genError, projectId: genProjectId, generateAutoClip, reset } = useVideoGenerate();

  useEffect(() => {
    return () => { if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); };
  }, [videoPreviewUrl]);

  useEffect(() => {
    if (!resumeProjectId && stepIndex > 0 && !file) {
      router.replace("/dashboard/create/auto-clip?step=upload-video");
    }
  }, [stepIndex, file, router, resumeProjectId]);

  function goTo(i: number) {
    router.push(`/dashboard/create/auto-clip?step=${STEPS[i].id}`);
  }

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

  const handleGenerate = useCallback(async () => {
    if (!file) return;
    const token = getStoredToken();
    if (!token) return;
    await generateAutoClip({
      file, minDuration, maxDuration, clipCount, aspectRatio, instructions,
      captionStyleIndex: captionsOn ? captionStyleIndex : -1,
      token,
    });
  }, [file, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionsOn, captionStyleIndex, generateAutoClip]);

  const handleReset = useCallback(() => {
    reset();
    handleClearFile();
    setMinDuration(15); setMaxDuration(60); setClipCount(5); setAspectRatio("9:16");
    setInstructions(""); setCaptionsOn(true); setCaptionStyleIndex(0);
    router.push("/dashboard/create/auto-clip?step=upload-video");
  }, [reset, handleClearFile, router]);

  const canNext = stepIndex === 0 ? !!file : true;
  const showOverlay = !!resumeProjectId || genStatus !== "idle";
  const activeProjectId = resumeProjectId ?? genProjectId;

  return (
      <div className="h-full overflow-y-auto bg-white flex flex-col">
        {showOverlay ? (
          <ClipsResults projectId={activeProjectId} status={resumeProjectId ? "rendering" : genStatus} error={genError} expectedCount={clipCount} onReset={handleReset} />
        ) : (
          <>
            <StepperBar stepIndex={stepIndex} onBack={() => goTo(stepIndex - 1)} onNext={() => goTo(stepIndex + 1)} onGenerate={handleGenerate} canNext={canNext} isLastStep={stepIndex === STEPS.length - 1} />

            {stepIndex === 0 && <Step1Upload file={file} videoPreviewUrl={videoPreviewUrl} onFile={handleFile} onClearFile={handleClearFile} />}

            {stepIndex === 1 && (
              <Step2Instructions
                minDuration={minDuration} setMinDuration={setMinDuration}
                maxDuration={maxDuration} setMaxDuration={setMaxDuration}
                clipCount={clipCount} setClipCount={setClipCount}
                aspectRatio={aspectRatio} setAspectRatio={setAspectRatio}
                instructions={instructions} setInstructions={setInstructions}
                captionsOn={captionsOn} setCaptionsOn={setCaptionsOn}
                captionStyleIndex={captionStyleIndex} setCaptionStyleIndex={setCaptionStyleIndex}
                fileName={file?.name ?? null}
              />
            )}

            {stepIndex === 2 && (
              <Step3Review
                fileName={file?.name ?? null} minDuration={minDuration} maxDuration={maxDuration}
                clipCount={clipCount} aspectRatio={aspectRatio} captionsOn={captionsOn}
                instructions={instructions} onGenerate={handleGenerate}
              />
            )}
          </>
        )}
      </div>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────
export default function AutoClipPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>}>
      <AutoClipFlow />
    </Suspense>
  );
}
