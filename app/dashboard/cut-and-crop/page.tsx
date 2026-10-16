"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "@/app/components/useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { computeMask, type Aspect } from "@/lib/crop";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, OptionCards, StageEmpty, RecentResults } from "@/app/components/tools/ToolWorkspace";

// Must match MAX_CLIPS in app/api/tools/cut-and-crop/route.ts.
const MAX_CLIPS = 5;

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
  // Up to 5 clips re-encoded one after another — longer than the 10-minute default.
  const job = useJobPolling({ toolSlug: "cut-and-crop", token, maxDurationMs: 30 * 60 * 1000 });
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
    const videos = Array.from(list).filter((file) => file.type.startsWith("video/"));
    // The export route takes MAX_CLIPS files at most; refuse the rest here
    // rather than letting the user build a timeline that can't be exported.
    const room = Math.max(0, MAX_CLIPS - clips.length);
    if (videos.length > room) {
      setPreflightError(`You can add up to ${MAX_CLIPS} clips per export.`);
    }
    const accepted = videos.slice(0, room);
    if (accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    pushHistory();
    const added: Clip[] = [];
    for (const file of accepted) {
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
  const busy = job.status === "processing";
  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 disabled:opacity-30 transition-colors";

  return (
    <ToolWorkspace
      title="Cut & Crop"
      icon="crop"
      badges={<ToolBadge>1 credit</ToolBadge>}
      description="Trim, reframe and stitch clips into one export."
      controls={
        <>
          <ToolField label={`Clips · ${clips.length} of ${MAX_CLIPS}`}>
            {clips.length === 0 ? (
              <button
                type="button"
                onClick={onAddVideo}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-1 px-4 py-8 text-center transition-colors hover:bg-surface-3"
              >
                <span className="text-primary"><IconCloud /></span>
                <span className="text-[13px] font-medium text-fg">Click or drag videos here</span>
                <span className="text-[11.5px] text-fg-subtle">Up to {MAX_CLIPS} clips · 10 minutes total</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {clips.map(clip => (
                  <div key={clip.id} className={`flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${activeId === clip.id ? "border-primary/50 bg-primary/5" : "border-line bg-surface-1"}`}>
                    <button type="button" onClick={() => setActiveId(clip.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] font-medium text-fg">{clip.name}</span>
                      <span className="block text-[11.5px] text-fg-subtle tabular-nums">Keep {fmt(clip.trimStart)} – {fmt(clip.trimEnd)} · {fmt(clip.trimEnd - clip.trimStart)}</span>
                    </button>
                    <button type="button" onClick={() => removeClip(clip.id)} aria-label={`Remove ${clip.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-error/10 hover:text-error">
                      <IconTrash />
                    </button>
                  </div>
                ))}
                {clips.length < MAX_CLIPS && (
                  <button type="button" onClick={onAddVideo} className="inline-flex items-center gap-1 self-start rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-3">
                    <IconPlus /> Add clip
                  </button>
                )}
              </div>
            )}
          </ToolField>

          <ToolField label="Frame">
            <OptionCards
              name="crop-aspect"
              value={crop}
              onChange={setCrop}
              options={[
                ["original", "Original", "No crop"],
                ["9:16", "9:16", "Shorts, Reels"],
                ["1:1", "1:1", "Feed"],
                ["16:9", "16:9", "YouTube"],
              ] as const}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRotation(r => (r === 270 ? 0 : (r + 90) as 0 | 90 | 180 | 270))}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${rotation !== 0 ? "border-primary/50 bg-primary/10 text-fg" : "border-line text-fg-muted hover:bg-surface-3"}`}>
                <IconRotate /> Rotate{rotation !== 0 ? ` ${rotation}°` : ""}
              </button>
              <button type="button" onClick={() => setFlipH(v => !v)} aria-pressed={flipH}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${flipH ? "border-primary/50 bg-primary/10 text-fg" : "border-line text-fg-muted hover:bg-surface-3"}`}>
                <IconFlip /> Flip
              </button>
            </div>
          </ToolField>
        </>
      }
      footer={
        <>
          {(preflightError || (job.status === "error" && job.error)) && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
              <span>{preflightError ?? job.error}</span>
              {job.status === "error" && <button type="button" onClick={() => void handleExport()} className="flex-shrink-0 font-semibold underline underline-offset-2">Retry</button>}
            </div>
          )}
          {job.status === "cancelled" && <p className="text-xs text-fg-muted">Cancelled — credit refunded.</p>}
          <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
            Output <span className="font-semibold text-fg">{fmt(totalDuration)}</span>{crop !== "original" ? ` · ${crop}` : ""} · <span className="font-semibold text-fg">1 credit</span>
          </CostRow>
          <Button type="button" className="w-full" onClick={() => void handleExport()} disabled={clips.length === 0 || busy} loading={busy}>
            {busy ? `Exporting… ${Math.round(job.progress)}%` : <span className="inline-flex items-center gap-2"><IconUpload /> Export video</span>}
          </Button>
          {busy && <button type="button" onClick={() => void job.cancel()} className="text-center text-xs font-medium text-fg-subtle hover:text-error">Cancel</button>}
          {job.status === "done" && outputUrl && (
            <a href={outputUrl} download={outputFilename} className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success hover:bg-success/15">Download again</a>
          )}
          <p className="text-center text-[11.5px] text-fg-subtle">Up to {MAX_CLIPS} clips, 10 minutes total. Saved to your Assets.</p>
        </>
      }
      stageTitle="Preview"
      stageActions={<span className="text-xs font-mono tabular-nums text-fg-subtle">{fmt(currentTime)} / {fmt(totalDuration)}</span>}
      stage={
        <div className="flex flex-1 flex-col gap-3">
          {/* Preview canvas */}
          <div
            className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-[#050908]"
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
              <StageEmpty icon="crop" title={draggingOver ? "Drop to add your clips" : "Your video appears here"}>
                Add clips on the left or drop them here, then trim them on the timeline below.
              </StageEmpty>
            ) : (
              <div style={{ display: "inline-block", position: "relative" }}>
                <video
                  ref={videoRef}
                  style={{
                    display: "block",
                    maxHeight: "calc(100vh - 430px)",
                    minHeight: 220,
                    maxWidth: "100%",
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
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: `${m.top}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${m.bottom}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", top: `${m.top}%`, bottom: `${m.bottom}%`, left: 0, width: `${m.left}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", top: `${m.top}%`, bottom: `${m.bottom}%`, right: 0, width: `${m.right}%`, background: "rgba(0,0,0,0.65)" }} />
                      <div style={{ position: "absolute", top: `${m.top}%`, left: `${m.left}%`, right: `${m.right}%`, bottom: `${m.bottom}%`, border: "2px solid var(--emerald-bright)" }} />
                      <div style={{ position: "absolute", bottom: `calc(${m.bottom}% + 8px)`, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em" }}>
                        {crop}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {draggingOver && clips.length > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5">
                <p className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white">Drop to add another clip</p>
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-1 px-2 py-1.5 [&>*]:flex-shrink-0">
            <button type="button" onClick={() => seekRel(-10)} disabled={!activeClip} title="Back 10s" aria-label="Back 10 seconds" className={iconBtn}><IconBack10 /></button>
            <button type="button" onClick={togglePlay} disabled={!activeClip} aria-label={isPlaying ? "Pause" : "Play"} className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-surface-1 transition-opacity disabled:opacity-30">{isPlaying ? <IconPause /> : <IconPlay />}</button>
            <button type="button" onClick={() => seekRel(10)} disabled={!activeClip} title="Forward 10s" aria-label="Forward 10 seconds" className={iconBtn}><IconFwd10 /></button>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} className={iconBtn}>{muted ? <IconMute /> : <IconVolume />}</button>
            <div className="mx-2 h-5 w-px bg-line" />
            <button type="button" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo" className={iconBtn}><IconUndo /></button>
            <button type="button" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className={iconBtn}><IconRedo /></button>
            <div className="mx-2 h-5 w-px bg-line" />
            <button type="button" onClick={splitAtPlayhead} disabled={!activeClip} title="Split at playhead" aria-label="Split at playhead" className={iconBtn}><IconScissors /></button>
            <button type="button" onClick={() => activeClip && removeClip(activeClip.id)} disabled={!activeClip} title="Delete clip" aria-label="Delete clip" className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"><IconTrash /></button>
            <div className="ml-auto hidden items-center gap-1.5 pl-2 text-fg-subtle sm:flex">
              <button type="button" onClick={() => setZoom(z => Math.max(20, z - 10))} aria-label="Zoom out timeline" className="transition-colors hover:text-fg-muted"><IconZoomOut /></button>
              <input type="range" min={20} max={100} value={zoom} onChange={e => setZoom(parseInt(e.target.value, 10))} aria-label="Timeline zoom" className="h-1 w-20 accent-[var(--primary)]" />
              <button type="button" onClick={() => setZoom(z => Math.min(100, z + 10))} aria-label="Zoom in timeline" className="transition-colors hover:text-fg-muted"><IconZoomIn /></button>
            </div>
          </div>

          {/* Tracks */}
          <div className="max-h-[180px] min-h-[64px] overflow-y-auto">
            <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            {clips.length === 0 ? (
              <div className="flex h-14 select-none items-center justify-center rounded-xl border-2 border-dashed border-line text-xs text-fg-subtle">Your clips will line up here — drag the green handles to trim</div>
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
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Clip ${clip.name}`}
                        onClick={e => seekToTrackPos(clip, e.currentTarget as HTMLElement, e)}
                        onKeyDown={e => { if (e.key === "Enter") setActiveId(clip.id); }}
                        className={`relative h-10 cursor-pointer select-none rounded-xl transition-all ${isActive ? "bg-primary/15 ring-1 ring-primary/50" : "bg-surface-3 ring-1 ring-line hover:bg-surface-2"}`}
                        style={{ width: `${widthPct}%`, minWidth: 180 }}
                      >
                        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-xl bg-black/40" style={{ width: `${trimLPct}%` }} />
                        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-xl bg-black/40" style={{ width: `${trimRPct}%` }} />
                        <div onPointerDown={e => startTrimDrag(clip.id, "start", e.currentTarget.parentElement as HTMLElement, e)} title="Trim start"
                             className="absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize items-center justify-center rounded-l-xl bg-[var(--emerald-bright)]" style={{ left: `${trimLPct}%` }}>
                          <div className="h-3 w-px rounded-full bg-black/60" />
                        </div>
                        <div onPointerDown={e => startTrimDrag(clip.id, "end", e.currentTarget.parentElement as HTMLElement, e)} title="Trim end"
                             className="absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize items-center justify-center rounded-r-xl bg-[var(--emerald-bright)]" style={{ right: `${trimRPct}%` }}>
                          <div className="h-3 w-px rounded-full bg-black/60" />
                        </div>
                        {playheadPct !== null && (
                          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-primary" style={{ left: `${playheadPct}%` }}>
                            <div className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
                          </div>
                        )}
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-5 text-[11px] font-medium text-fg">{clip.name.replace(/\.[^.]+$/, "")}</span>
                      </div>
                      <span className="w-10 flex-shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-fg-subtle">{fmt(clip.trimEnd - clip.trimStart)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      }
      below={user ? <RecentResults source="cut-and-crop" label="Recent exports" refreshKey={outputUrl} /> : undefined}
    />
  );
}
