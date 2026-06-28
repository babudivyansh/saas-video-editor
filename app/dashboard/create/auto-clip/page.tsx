"use client";
import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { useVideoGenerate, getStoredToken, type GenerateStatus } from "@/app/hooks/useVideoGenerate";

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

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "upload-video", label: "Upload" },
  { id: "instructions", label: "Instructions" },
  { id: "review", label: "Review" },
];

// ── Clip results (Opus-style grid) ──────────────────────────────────────────
interface ClipItem {
  id: string;
  index: number;
  title: string | null;
  startSec: number;
  endSec: number;
  durationSec: number;
  aspectRatio: string;
  score: number | null;
  status: string; // queued | rendering | ready | failed
  progress: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

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

function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z" /></svg>;
}

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

function ClipCard({ clip, onEdit, editing }: { clip: ClipItem; onEdit: (id: string) => void; editing: boolean }) {
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
        <p className="text-xs text-gray-400">{fmtTime(clip.durationSec)} • {fmtTime(clip.startSec)}–{fmtTime(clip.endSec)}</p>
        {ready && clip.videoUrl && (
          <div className="flex gap-2 mt-auto pt-1">
            <a href={clip.videoUrl} download className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Download</a>
            <button onClick={() => onEdit(clip.id)} disabled={editing} className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-[#3860FF] text-white hover:bg-[#2d50e0] transition-colors disabled:opacity-50">
              {editing ? "Opening…" : "Edit"}
            </button>
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
  const router = useRouter();
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>("rendering");
  const [editingId, setEditingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const token = getStoredToken();
    if (!token) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/clips`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const d = await res.json() as { clips?: ClipItem[]; project?: { status?: string } };
        setClips(d.clips ?? []);
        const st = d.project?.status ?? "rendering";
        setProjectStatus(st);
        if ((st === "completed" || st === "failed") && pollRef.current) clearInterval(pollRef.current);
      } catch { /* keep polling */ }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [projectId]);

  async function openInEditor(clipId: string) {
    const token = getStoredToken();
    if (!token) return;
    setEditingId(clipId);
    try {
      const res = await fetch(`/api/clips/${clipId}/edit`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json() as { projectId?: string; error?: string };
      if (d.projectId) router.push(`/dashboard/editor/${d.projectId}`);
    } finally {
      setEditingId(null);
    }
  }

  const ready = clips.filter(c => c.status === "ready").length;
  const total = clips.length || expectedCount;
  const failedHard = status === "failed" || (projectStatus === "failed" && clips.every(c => c.status === "failed"));
  const analyzing = clips.length === 0 && !failedHard;
  const allDone = projectStatus === "completed";

  let heading: string;
  if (failedHard) heading = "Something went wrong";
  else if (status === "uploading") heading = "Uploading your video…";
  else if (analyzing) heading = "Analyzing your video for the best moments…";
  else if (allDone) heading = `Your clips are ready 🎉`;
  else heading = "Generating your clips";

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {!failedHard && !allDone && <div className="w-6 h-6 border-[3px] border-blue-200 border-t-[#3860FF] rounded-full animate-spin" />}
            <h2 className="text-xl font-bold text-gray-900">{heading}</h2>
          </div>
          {!analyzing && !failedHard && (
            <span className="text-sm font-semibold text-gray-500">{ready} / {total} ready</span>
          )}
          {(allDone || failedHard) && (
            <button onClick={onReset} className="text-sm font-semibold text-[#3860FF] hover:underline">Create another</button>
          )}
        </div>
        {/* Overall progress bar */}
        {!analyzing && !failedHard && (
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#3860FF] transition-all duration-500" style={{ width: `${total ? (ready / total) * 100 : 0}%` }} />
          </div>
        )}
        {failedHard && (
          <p className="text-sm text-gray-500 mt-2">{error ?? "We couldn't generate clips from this video. Please try again."}</p>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {clips.length > 0
          ? clips.map(c => <ClipCard key={c.id} clip={c} onEdit={openInEditor} editing={editingId === c.id} />)
          : !failedHard && Array.from({ length: Math.max(1, expectedCount) }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

// ── Stepper Bar (crayo.ai design) ───────────────────────────────────────────
function StepperBar({
  stepIndex,
  onBack,
  onNext,
  onGenerate,
  canNext,
  isLastStep,
}: {
  stepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
  canNext: boolean;
  isLastStep: boolean;
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
                  i === stepIndex
                    ? "bg-[#3860FF] text-white"
                    : i < stepIndex
                    ? "bg-green-500 text-white"
                    : "text-gray-400"
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
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <IcChevronLeft /> Back
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={onGenerate}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed bg-[#3860FF] hover:bg-[#2d50e0]"
            >
              <IcSparkle /> Generate
            </button>
          ) : (
            <button
              onClick={onNext}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed bg-[#3860FF] hover:bg-[#2d50e0]"
            >
              Next <IcChevronRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Upload Video ────────────────────────────────────────────────────
function Step1Upload({
  file,
  videoPreviewUrl,
  onFile,
  onClearFile,
}: {
  file: File | null;
  videoPreviewUrl: string | null;
  onFile: (f: File) => void;
  onClearFile: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl flex flex-col gap-4 md:flex-row md:gap-6">
        {/* Left panel — video preview */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-3 sm:p-5 md:min-h-[440px] md:p-10">
          {videoPreviewUrl ? (
            <div className="w-full flex flex-col items-center gap-4">
              <video
                src={videoPreviewUrl}
                controls
                className="w-full max-h-[360px] rounded-lg object-contain"
              />
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

        {/* Right panel — upload + tips */}
        <div className="w-full md:w-[340px] flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/mov,video/quicktime,video/webm"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
          />

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/30"
            style={{ borderColor: dragging ? "#3860FF" : undefined, background: dragging ? "#eff6ff" : undefined }}
          >
            <div className="text-blue-500"><IcCloud /></div>
            <p className="text-sm font-medium text-gray-700 text-center">Choose a video or drag & drop</p>
            <p className="text-xs text-gray-400">MP4, MOV, WebM — up to 500 MB</p>
            <button
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-[#3860FF] hover:bg-[#2d50e0] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Upload Video
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Tips for best results:</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                Include speech to determine the viral moments
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                Video should be at least 1 minute long
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                Video should be under 1 hour 30 minutes long
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Instructions ────────────────────────────────────────────────────
function Step2Instructions({
  minDuration,
  setMinDuration,
  maxDuration,
  setMaxDuration,
  clipCount,
  setClipCount,
  aspectRatio,
  setAspectRatio,
  instructions,
  setInstructions,
  fileName,
}: {
  minDuration: number;
  setMinDuration: (v: number) => void;
  maxDuration: number;
  setMaxDuration: (v: number) => void;
  clipCount: number;
  setClipCount: (v: number) => void;
  aspectRatio: "9:16" | "16:9" | "1:1";
  setAspectRatio: (v: "9:16" | "16:9" | "1:1") => void;
  instructions: string;
  setInstructions: (v: string) => void;
  fileName: string | null;
}) {
  const ratios: { value: "9:16" | "16:9" | "1:1"; label: string; desc: string }[] = [
    { value: "9:16", label: "9:16", desc: "Vertical" },
    { value: "16:9", label: "16:9", desc: "Horizontal" },
    { value: "1:1", label: "1:1", desc: "Square" },
  ];

  return (
    <div className="flex-1 flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl flex flex-col gap-4 md:flex-row md:gap-6">
        {/* Left panel — configuration */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Clip Settings</h2>
            <p className="text-sm text-gray-500">Configure how your video will be split into clips.</p>
          </div>

          {/* Duration range */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700">Clip Duration (seconds)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Min</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={minDuration}
                  onChange={e => setMinDuration(Math.max(5, Math.min(Number(e.target.value), maxDuration - 1)))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
                />
              </div>
              <span className="text-gray-300 mt-5">—</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={maxDuration}
                  onChange={e => setMaxDuration(Math.max(minDuration + 1, Math.min(Number(e.target.value), 300)))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Number of clips */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Number of Clips</label>
            <input
              type="number"
              min={1}
              max={20}
              value={clipCount}
              onChange={e => setClipCount(Math.max(1, Math.min(Number(e.target.value), 20)))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
            />
            <p className="text-xs text-gray-400">Generate between 1 and 20 clips</p>
          </div>

          {/* Aspect ratio */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-2">
              {ratios.map(r => (
                <button
                  key={r.value}
                  onClick={() => setAspectRatio(r.value)}
                  className={`rounded-xl border px-3 py-3 text-center transition-colors ${
                    aspectRatio === r.value
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Instructions (optional)</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. Focus on funny moments, avoid silent parts, prioritize high-energy sections..."
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 resize-none"
              rows={4}
            />
          </div>
        </div>

        {/* Right panel — summary */}
        <div className="w-full md:w-[300px] flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Settings Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">File</span>
                <span className="text-gray-900 font-medium truncate max-w-[160px]">{fileName ?? "—"}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">Duration range</span>
                <span className="text-gray-900 font-medium">{minDuration}s – {maxDuration}s</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">Clips</span>
                <span className="text-gray-900 font-medium">{clipCount}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">Aspect ratio</span>
                <span className="text-gray-900 font-medium">{aspectRatio}</span>
              </div>
              {instructions.trim() && (
                <>
                  <div className="h-px bg-gray-100" />
                  <div>
                    <span className="text-gray-500">Instructions</span>
                    <p className="text-gray-700 mt-1 text-xs leading-relaxed">{instructions}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Review & Generate ───────────────────────────────────────────────
function Step3Review({
  fileName,
  minDuration,
  maxDuration,
  clipCount,
  aspectRatio,
  instructions,
  onGenerate,
}: {
  fileName: string | null;
  minDuration: number;
  maxDuration: number;
  clipCount: number;
  aspectRatio: string;
  instructions: string;
  onGenerate: () => void;
}) {
  const rows = [
    { label: "Source video", value: fileName ?? "—" },
    { label: "Clip duration", value: `${minDuration}s – ${maxDuration}s` },
    { label: "Number of clips", value: String(clipCount) },
    { label: "Aspect ratio", value: aspectRatio },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <div className="text-gray-400">
          <IcScissors />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Ready to generate clips</h2>
          <p className="text-sm text-gray-500">Review your settings and click Generate to start.</p>
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
              <div className="text-sm">
                <span className="text-gray-500">Instructions</span>
                <p className="text-gray-700 mt-1 text-xs leading-relaxed">{instructions}</p>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onGenerate}
          className="inline-flex items-center gap-2 bg-[#3860FF] hover:bg-[#2d50e0] text-white text-sm font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm"
        >
          <IcSparkle /> Generate Clips
        </button>
      </div>
    </div>
  );
}

// ── Main Flow ───────────────────────────────────────────────────────────────
function AutoClipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const stepParam = params.get("step") || "upload-video";
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Step 2 state
  const [minDuration, setMinDuration] = useState(15);
  const [maxDuration, setMaxDuration] = useState(60);
  const [clipCount, setClipCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [instructions, setInstructions] = useState("");

  // Generation
  const { status: genStatus, error: genError, projectId: genProjectId, generateAutoClip, reset } = useVideoGenerate();

  // Object URL cleanup
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  // Step guard: redirect to step 0 if no file and trying to access step 2+
  useEffect(() => {
    if (stepIndex > 0 && !file) {
      router.replace("/dashboard/create/auto-clip?step=upload-video");
    }
  }, [stepIndex, file, router]);

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
      file,
      minDuration,
      maxDuration,
      clipCount,
      aspectRatio,
      instructions,
      token,
    });
  }, [file, minDuration, maxDuration, clipCount, aspectRatio, instructions, generateAutoClip]);

  const handleReset = useCallback(() => {
    reset();
    handleClearFile();
    setMinDuration(15);
    setMaxDuration(60);
    setClipCount(5);
    setAspectRatio("9:16");
    setInstructions("");
    goTo(0);
  }, [reset, handleClearFile]);

  const canNext = stepIndex === 0 ? !!file : true;
  const showOverlay = genStatus !== "idle";

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white flex flex-col">
        {showOverlay ? (
          <ClipsResults projectId={genProjectId} status={genStatus} error={genError} expectedCount={clipCount} onReset={handleReset} />
        ) : (
          <>
            <StepperBar
              stepIndex={stepIndex}
              onBack={() => goTo(stepIndex - 1)}
              onNext={() => goTo(stepIndex + 1)}
              onGenerate={handleGenerate}
              canNext={canNext}
              isLastStep={stepIndex === STEPS.length - 1}
            />

            {stepIndex === 0 && (
              <Step1Upload
                file={file}
                videoPreviewUrl={videoPreviewUrl}
                onFile={handleFile}
                onClearFile={handleClearFile}
              />
            )}

            {stepIndex === 1 && (
              <Step2Instructions
                minDuration={minDuration}
                setMinDuration={setMinDuration}
                maxDuration={maxDuration}
                setMaxDuration={setMaxDuration}
                clipCount={clipCount}
                setClipCount={setClipCount}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                instructions={instructions}
                setInstructions={setInstructions}
                fileName={file?.name ?? null}
              />
            )}

            {stepIndex === 2 && (
              <Step3Review
                fileName={file?.name ?? null}
                minDuration={minDuration}
                maxDuration={maxDuration}
                clipCount={clipCount}
                aspectRatio={aspectRatio}
                instructions={instructions}
                onGenerate={handleGenerate}
              />
            )}
          </>
        )}
      </main>
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
