"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { computeMask, type Aspect } from "@/lib/crop";

// ── Types ────────────────────────────────────────────────────────────────────
interface Clip {
  id: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
}
type CropAspect = Aspect;

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// computeMask is shared with the editors — see lib/crop.ts

// ── SVG Icons ────────────────────────────────────────────────────────────────
function IconPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>;
}
function IconPause() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>;
}
function IconBack10() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}
function IconFwd10() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
    </svg>
  );
}
function IconVolume() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}
function IconMute() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}
function IconCrop() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M6.13 1L6 16a2 2 0 002 2h15" /><path d="M1 6.13L16 6a2 2 0 012 2v15" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
    </svg>
  );
}
function IconRotate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 12a9 9 0 11-3.05-6.75" /><path d="M21 3v5h-5" />
    </svg>
  );
}
function IconFlip() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 3v18" /><path d="M16 7l4 5-4 5" /><path d="M8 7l-4 5 4 5" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IconZoomOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
function IconZoomIn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CutAndCropPage() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "cut-and-crop", token });
  const fireReviewPrompt = useReviewPromptTrigger();

  const [clips, setClips] = useState<Clip[]>([]);
  // Undo/redo history — snapshots of the whole `clips` array taken before
  // each discrete action (add/remove/split/trim-gesture). Continuous
  // pointermove updates during a single trim drag do NOT each push a new
  // snapshot (see startTrimDrag) — one drag gesture is one undo step, not
  // one step per pixel of movement.
  const [past, setPast] = useState<Clip[][]>([]);
  const [future, setFuture] = useState<Clip[][]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropAspect>("original");
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [zoom, setZoom] = useState(55);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [draggingOver, setDraggingOver] = useState(false);
  const [videoNatSize, setVideoNatSize] = useState<{ w: number; h: number } | null>(null);
  // Pre-flight validation error (e.g. "still reading metadata") — kept
  // separate from job.error since it happens before a job even starts.
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  // Set alongside outputUrl in the response handler below rather than
  // computed inline in JSX — Date.now() is an impure call and isn't allowed
  // during render (including inside useMemo, which is still render).
  const [outputFilename, setOutputFilename] = useState("cut-and-crop.mp4");
  const downloadedForJobId = useRef<string | null>(null);
  const submittingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeClip = useMemo(() => clips.find(c => c.id === activeId) ?? null, [clips, activeId]);
  const totalDuration = useMemo(
    () => clips.reduce((sum, c) => sum + Math.max(0, c.trimEnd - c.trimStart), 0),
    [clips]
  );

  // Call before any discrete clip-mutating action to make it undoable.
  const pushHistory = useCallback(() => {
    setPast(prev => [...prev, clips]);
    setFuture([]);
  }, [clips]);

  const undo = useCallback(() => {
    setPast(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture(f => [clips, ...f]);
      setClips(last);
      return prev.slice(0, -1);
    });
  }, [clips]);

  const redo = useCallback(() => {
    setFuture(prev => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setPast(p => [...p, clips]);
      setClips(next);
      return rest;
    });
  }, [clips]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clips.forEach(c => URL.revokeObjectURL(c.url));
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch video source when active clip changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    if (v.src !== activeClip.url) {
      setVideoNatSize(null);
      v.src = activeClip.url;
      v.load();
      v.currentTime = activeClip.trimStart;
    }
  }, [activeClip]);

  // Auto-advance
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    setCurrentTime(v.currentTime);
    if (v.currentTime >= activeClip.trimEnd - 0.05) {
      const idx = clips.findIndex(c => c.id === activeClip.id);
      const next = clips[idx + 1];
      if (next && isPlaying) {
        setActiveId(next.id);
        setTimeout(() => { videoRef.current?.play().catch(() => undefined); }, 80);
      } else {
        v.pause();
        setIsPlaying(false);
      }
    }
  }

  // File ingestion
  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    pushHistory();
    const added: Clip[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("video/")) continue;
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      added.push({ id, file, url, name: file.name, duration: 0, trimStart: 0, trimEnd: 0 });
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const dur = Number.isFinite(probe.duration) ? probe.duration : 0;
        setClips(prev => prev.map(c => c.id === id ? { ...c, duration: dur, trimEnd: dur } : c));
      };
    }
    if (added.length > 0) {
      setClips(prev => {
        const next = [...prev, ...added];
        if (!activeId) setActiveId(added[0].id);
        return next;
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onAddVideo() {
    if (!user) { openAuthModal("login", "Cut & Crop Editor"); return; }
    fileInputRef.current?.click();
  }

  function removeClip(id: string) {
    pushHistory();
    setClips(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      const gone = prev.find(c => c.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
  }

  // Transport
  function togglePlay() {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    if (v.paused) {
      if (v.currentTime < activeClip.trimStart || v.currentTime >= activeClip.trimEnd) {
        v.currentTime = activeClip.trimStart;
      }
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }
  function seekRel(delta: number) {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    v.currentTime = Math.max(activeClip.trimStart, Math.min(activeClip.trimEnd, v.currentTime + delta));
  }
  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  // Trim drag — pauses playback and seeks video to trim position while dragging
  function startTrimDrag(clipId: string, side: "start" | "end", trackEl: HTMLElement, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackEl.getBoundingClientRect();
    const clip = clips.find(c => c.id === clipId);
    if (!clip || clip.duration <= 0) return;

    // One snapshot per whole drag gesture, not per pointermove tick.
    pushHistory();

    // Switch active clip and pause
    if (activeId !== clipId) setActiveId(clipId);
    const v = videoRef.current;
    if (v && !v.paused) { v.pause(); setIsPlaying(false); }

    function onMove(ev: PointerEvent) {
      const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
      const rawT = (x / rect.width) * clip!.duration;

      let seekTo = rawT;
      setClips(prev => prev.map(c => {
        if (c.id !== clipId) return c;
        if (side === "start") {
          const trimStart = Math.max(0, Math.min(rawT, c.trimEnd - 0.1));
          seekTo = trimStart;
          return { ...c, trimStart };
        }
        const trimEnd = Math.min(c.duration, Math.max(rawT, c.trimStart + 0.1));
        seekTo = trimEnd;
        return { ...c, trimEnd };
      }));

      // Seek so the user sees the exact frame at the trim point
      if (videoRef.current) videoRef.current.currentTime = seekTo;
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Click track to seek
  function seekToTrackPos(clip: Clip, trackEl: HTMLElement, e: React.MouseEvent) {
    const rect = trackEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const t = (x / rect.width) * clip.duration;
    setActiveId(clip.id);
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(clip.trimStart, Math.min(clip.trimEnd, t));
  }

  // Split at playhead
  function splitAtPlayhead() {
    if (!activeClip) return;
    const t = currentTime;
    if (t <= activeClip.trimStart + 0.1 || t >= activeClip.trimEnd - 0.1) return;
    pushHistory();
    const newId = crypto.randomUUID();
    const head = { ...activeClip, trimEnd: t };
    const tail: Clip = { ...activeClip, id: newId, trimStart: t };
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === activeClip.id);
      return [...prev.slice(0, idx), head, tail, ...prev.slice(idx + 1)];
    });
  }

  // Space / undo / redo shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space" && activeClip) { e.preventDefault(); togglePlay(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip, isPlaying, undo, redo]);

  // Export
  const handleExport = useCallback(async () => {
    if (!user) { openAuthModal("login", "Cut & Crop Editor"); return; }
    if (clips.length === 0) return;
    if (clips.some(c => c.duration === 0)) {
      setPreflightError("Still reading file metadata — try again in a moment.");
      return;
    }
    if (!token) { openAuthModal("login", "Cut & Crop Editor"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setPreflightError(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    const idempotencyKey = crypto.randomUUID();

    try {
      await job.start(async () => {
        const form = new FormData();
        clips.forEach((c, i) => form.append(`file_${i}`, c.file));
        form.append("trims", JSON.stringify(clips.map(c => ({ start: c.trimStart, end: c.trimEnd }))));
        form.append("crop", crop);
        form.append("rotation", String(rotation));
        form.append("flipH", String(flipH));
        form.append("idempotencyKey", idempotencyKey);

        const startRes = await fetch("/api/tools/cut-and-crop", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!startRes.ok) {
          const j = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? `Server error (${startRes.status})`);
        }
        return (await startRes.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [user, clips, crop, rotation, flipH, outputUrl, token, openAuthModal, job]);

  // Once the job is done, fetch the result and trigger a download.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/cut-and-crop?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fileRes.ok) throw new Error("Failed to download result");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        const filename = `cut-and-crop-${Date.now()}.mp4`;
        setOutputUrl(url);
        setOutputFilename(filename);

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        void refreshUser();
      } catch {
        // The export itself succeeded; a failed download fetch just means
        // the user needs "Download again" rather than a hard error state.
      }
    })();
  }, [job.status, job.jobId, token, refreshUser, fireReviewPrompt]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-w-0 h-full overflow-hidden bg-panel">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 px-6 h-12 flex-shrink-0 border-b border-line bg-panel">
          {/* Title */}
          <span className="text-[15px] font-semibold text-fg">Cut &amp; Crop</span>

          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {/* Exporting indicator */}
            {job.status === "processing" && (
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <div className="w-3.5 h-3.5 border-2 border-line border-t-blue-600 rounded-full animate-spin" />
                <span className="font-medium text-xs">{job.progress}%</span>
                <button
                  onClick={() => void job.cancel()}
                  className="text-xs font-medium text-fg-subtle hover:text-error transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Error toast */}
            {(preflightError || (job.status === "error" && job.error)) && (
              <span
                className="text-xs text-error bg-error/10 border border-red-100 rounded-xl px-3 py-1.5 max-w-[280px] truncate"
                title={preflightError ?? job.error ?? undefined}
              >
                {preflightError ?? job.error}
                {job.status === "error" && (
                  <button onClick={() => void handleExport()} className="ml-1.5 font-semibold underline underline-offset-2 hover:text-red-800">
                    Retry
                  </button>
                )}
              </span>
            )}

            {job.status === "cancelled" && (
              <span className="text-xs text-fg-muted bg-surface-2 border border-line rounded-xl px-3 py-1.5">
                Cancelled — credit refunded
              </span>
            )}

            {/* Download again */}
            {job.status === "done" && outputUrl && (
              <a
                href={outputUrl}
                download={outputFilename}
                className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 hover:bg-emerald-100 transition-colors"
              >
                Download again
              </a>
            )}

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={clips.length === 0 || job.status === "processing"}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconUpload />
              Export
              {clips.length > 0 && (
                <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-medium">1 credit</span>
              )}
            </button>
          </div>
        </header>

        {/* ── Editor body ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Preview canvas */}
          <div
            className="flex-1 min-h-0 flex items-center justify-center bg-[#111318] relative overflow-hidden"
            onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDraggingOver(false);
              if (!user) { openAuthModal("login", "Cut & Crop Editor"); return; }
              handleFiles(e.dataTransfer.files);
            }}
          >
            {clips.length === 0 ? (
              /* Empty state */
              <div
                onClick={onAddVideo}
                className={`flex flex-col items-center gap-4 cursor-pointer rounded-2xl border-2 border-dashed px-14 py-12 transition-colors ${
                  draggingOver
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white/50">
                  <IconCloud />
                </div>
                <div className="text-center">
                  <p className="text-white/80 text-sm font-medium mb-1">Upload a video to get started</p>
                  <p className="text-white/40 text-xs">or drag &amp; drop a file here</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onAddVideo(); }}
                  className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  Add Video
                </button>
              </div>
            ) : (
              /* Video preview with crop overlay */
              <div style={{ display: "inline-block", position: "relative" }}>
                <video
                  ref={videoRef}
                  style={{
                    display: "block",
                    maxHeight: "calc(100vh - 256px)",
                    maxWidth: "calc(100vw - 90px)",
                    borderRadius: "0.5rem",
                    transform: `rotate(${rotation}deg)${flipH ? " scaleX(-1)" : ""}`,
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onClick={togglePlay}
                  onLoadedMetadata={() => {
                    const v = videoRef.current;
                    if (v) setVideoNatSize({ w: v.videoWidth, h: v.videoHeight });
                  }}
                />
                {/* Crop mask overlay */}
                {crop !== "original" && videoNatSize && (() => {
                  const m = computeMask(videoNatSize.w, videoNatSize.h, crop);
                  return (
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "0.5rem", overflow: "hidden" }}>
                      {/* Dark regions */}
                      <div style={{ position: "absolute", inset: 0, top: 0, left: 0, right: 0, height: `${m.top}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${m.bottom}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", top: `${m.top}%`, bottom: `${m.bottom}%`, left: 0, width: `${m.left}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", top: `${m.top}%`, bottom: `${m.bottom}%`, right: 0, width: `${m.right}%`, background: "rgba(0,0,0,0.65)" }} />
                      {/* Bright border around kept region */}
                      <div style={{
                        position: "absolute",
                        top: `${m.top}%`, left: `${m.left}%`,
                        right: `${m.right}%`, bottom: `${m.bottom}%`,
                        border: "1.5px solid rgba(255,255,255,0.85)",
                      }} />
                      {/* Ratio label */}
                      <div style={{
                        position: "absolute",
                        bottom: `calc(${m.bottom}% + 8px)`,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        letterSpacing: "0.04em",
                      }}>
                        {crop}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Drag-over indicator when clips already exist — dropping here adds
                another clip, but the empty-state's own indicator only renders
                before the first clip is added, so this covers the rest. */}
            {draggingOver && clips.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-2xl pointer-events-none">
                <p className="text-white text-sm font-medium bg-black/60 px-4 py-2 rounded-full">Drop to add another clip</p>
              </div>
            )}

          </div>

          {/* ── Timeline panel ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-panel border-t border-line">

            {/* Controls bar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-line">
              {/* Transport */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => seekRel(-10)}
                  disabled={!activeClip}
                  title="Back 10s"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors"
                >
                  <IconBack10 />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!activeClip}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-fg hover:bg-surface-3 disabled:opacity-30 transition-colors"
                >
                  {isPlaying ? <IconPause /> : <IconPlay />}
                </button>
                <button
                  onClick={() => seekRel(10)}
                  disabled={!activeClip}
                  title="Forward 10s"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors"
                >
                  <IconFwd10 />
                </button>
                <button
                  onClick={toggleMute}
                  title={muted ? "Unmute" : "Mute"}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 transition-colors"
                >
                  {muted ? <IconMute /> : <IconVolume />}
                </button>
              </div>

              {/* Time */}
              <span className="text-xs font-mono text-fg-subtle ml-1 select-none tabular-nums">
                {fmt(currentTime)} / {fmt(totalDuration)}
              </span>

              {/* Divider */}
              <div className="w-px h-5 bg-surface-3 mx-2" />

              {/* Undo / redo */}
              <button
                onClick={undo}
                disabled={past.length === 0}
                title="Undo (Ctrl+Z)"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <IconUndo />
              </button>
              <button
                onClick={redo}
                disabled={future.length === 0}
                title="Redo (Ctrl+Shift+Z)"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <IconRedo />
              </button>

              {/* Divider */}
              <div className="w-px h-5 bg-surface-3 mx-2" />

              {/* Edit tools */}
              <button
                onClick={splitAtPlayhead}
                disabled={!activeClip}
                title="Split at playhead"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <IconScissors />
              </button>
              <div className="flex items-center gap-1 rounded-xl px-2 h-8 text-fg-muted hover:bg-surface-3 cursor-pointer">
                <IconCrop />
                <select
                  value={crop}
                  onChange={e => setCrop(e.target.value as CropAspect)}
                  className="appearance-none bg-transparent text-xs font-medium text-fg-muted outline-none cursor-pointer"
                >
                  <option value="original">Original</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="16:9">16:9</option>
                </select>
              </div>
              <button
                onClick={() => setRotation(r => (r === 270 ? 0 : (r + 90) as 0 | 90 | 180 | 270))}
                title={`Rotate (currently ${rotation}°)`}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${rotation !== 0 ? "bg-blue-50 text-blue-600" : "text-fg-muted hover:bg-surface-3"}`}
              >
                <IconRotate />
              </button>
              <button
                onClick={() => setFlipH(v => !v)}
                title="Flip horizontal"
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${flipH ? "bg-blue-50 text-blue-600" : "text-fg-muted hover:bg-surface-3"}`}
              >
                <IconFlip />
              </button>
              <button
                onClick={() => activeClip && removeClip(activeClip.id)}
                disabled={!activeClip}
                title="Delete clip"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-error/10 hover:text-error disabled:opacity-30 transition-colors"
              >
                <IconTrash />
              </button>

              {/* Right side */}
              <div className="ml-auto flex items-center gap-3">
                {/* Zoom */}
                <div className="flex items-center gap-1.5 text-fg-subtle">
                  <button onClick={() => setZoom(z => Math.max(20, z - 10))} className="hover:text-fg-muted transition-colors"><IconZoomOut /></button>
                  <input
                    type="range" min={20} max={100} value={zoom}
                    onChange={e => setZoom(parseInt(e.target.value, 10))}
                    className="w-20 accent-blue-600 h-1"
                  />
                  <button onClick={() => setZoom(z => Math.min(100, z + 10))} className="hover:text-fg-muted transition-colors"><IconZoomIn /></button>
                </div>
                {/* Add */}
                <button
                  onClick={onAddVideo}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-line text-fg-muted text-xs font-semibold hover:bg-surface-2 transition-colors"
                >
                  <IconPlus /> Add clip
                </button>
              </div>
            </div>

            {/* Tracks area */}
            <div className="px-4 py-3 min-h-[80px] max-h-[160px] overflow-y-auto">
              {/* Hidden input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />

              {clips.length === 0 ? (
                <div className="flex items-center justify-center h-14 rounded-xl border-2 border-dashed border-line text-xs text-fg-subtle select-none">
                  Add a video to get started
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {clips.map(clip => {
                    const maxDur = Math.max(...clips.map(c => c.duration), 1);
                    const widthPct = Math.max(20, Math.min(100, (clip.duration / maxDur) * (zoom + 35)));
                    const trimLPct = clip.duration > 0 ? (clip.trimStart / clip.duration) * 100 : 0;
                    const trimRPct = clip.duration > 0 ? ((clip.duration - clip.trimEnd) / clip.duration) * 100 : 0;
                    const isActive = activeId === clip.id;
                    const playheadPct = isActive && clip.duration > 0 ? (currentTime / clip.duration) * 100 : null;

                    return (
                      <div key={clip.id} className="flex items-center gap-2">
                        {/* Track */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={e => seekToTrackPos(clip, e.currentTarget as HTMLElement, e)}
                          onKeyDown={e => { if (e.key === "Enter") setActiveId(clip.id); }}
                          className={`relative h-9 rounded-xl select-none cursor-pointer transition-all ${
                            isActive
                              ? "bg-blue-50 ring-1 ring-blue-300"
                              : "bg-surface-3 ring-1 ring-line hover:bg-gray-200/70"
                          }`}
                          style={{ width: `${widthPct}%`, minWidth: 180 }}
                        >
                          {/* Trim masks */}
                          <div className="absolute inset-y-0 left-0 bg-black/10 rounded-l-xl pointer-events-none" style={{ width: `${trimLPct}%` }} />
                          <div className="absolute inset-y-0 right-0 bg-black/10 rounded-r-xl pointer-events-none" style={{ width: `${trimRPct}%` }} />

                          {/* Left trim handle */}
                          <div
                            onPointerDown={e => startTrimDrag(clip.id, "start", e.currentTarget.parentElement as HTMLElement, e)}
                            title="Trim start"
                            className="absolute inset-y-0 w-2 cursor-ew-resize bg-blue-600 rounded-l-xl flex items-center justify-center z-10"
                            style={{ left: `${trimLPct}%` }}
                          >
                            <div className="w-px h-3 bg-white/70 rounded-full" />
                          </div>
                          {/* Right trim handle */}
                          <div
                            onPointerDown={e => startTrimDrag(clip.id, "end", e.currentTarget.parentElement as HTMLElement, e)}
                            title="Trim end"
                            className="absolute inset-y-0 w-2 cursor-ew-resize bg-blue-600 rounded-r-xl flex items-center justify-center z-10"
                            style={{ right: `${trimRPct}%` }}
                          >
                            <div className="w-px h-3 bg-white/70 rounded-full" />
                          </div>

                          {/* Playhead */}
                          {playheadPct !== null && (
                            <div className="absolute top-0 bottom-0 w-0.5 bg-blue-600 pointer-events-none z-20" style={{ left: `${playheadPct}%` }}>
                              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-600 rotate-45" />
                            </div>
                          )}

                          {/* Label */}
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-fg truncate px-5 pointer-events-none">
                            {clip.name.replace(/\.[^.]+$/, "")}
                          </span>
                        </div>

                        {/* Duration */}
                        <span className="text-[10px] text-fg-subtle font-mono whitespace-nowrap tabular-nums w-10 flex-shrink-0">
                          {fmt(clip.trimEnd - clip.trimStart)}
                        </span>

                        {/* Delete */}
                        <button
                          onClick={() => removeClip(clip.id)}
                          title="Remove"
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-fg-subtle hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
