"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import { useEditorStore } from "../store/editorStore";
import {
  ASPECT_DIMENSIONS,
  activeClipsAt,
  type VideoClipData,
  type TextClipData,
  type EffectId,
} from "@/lib/track-editor-types";
import { sampleAnimatable } from "@/lib/keyframes";

function buildClipFilter(d: VideoClipData): string {
  const parts: string[] = [];

  if (d.brightness !== 1) parts.push(`brightness(${d.brightness})`);
  if (d.contrast !== 1)   parts.push(`contrast(${d.contrast})`);
  if (d.saturation !== 1) parts.push(`saturate(${d.saturation})`);
  if (d.blur > 0)         parts.push(`blur(${d.blur}px)`);

  for (const eff of d.effects) {
    const f = effectToCssFilter(eff);
    if (f) parts.push(f);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

function effectToCssFilter(eff: EffectId): string | null {
  switch (eff) {
    case "cinematic":   return "contrast(1.1) saturate(0.85)";
    case "vhs":         return "contrast(1.05) saturate(0.7) hue-rotate(5deg)";
    case "glitch":      return "hue-rotate(10deg) saturate(1.5)";
    case "film-grain":  return null; // applied via noise overlay below
    case "retro":       return "saturate(0.6) sepia(0.3) contrast(1.1)";
    case "neon":        return "saturate(2.5) contrast(1.4) brightness(1.1)";
    case "blur":        return "blur(5px)";
    case "rgb-split":   return "hue-rotate(5deg) saturate(1.3)";
    default:            return null;
  }
}

// Pixel-per-second → not needed here; canvas uses natural dimensions

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoEls = useRef<Map<string, HTMLVideoElement>>(new Map());
  const rafRef = useRef<number>(0);

  const doc = useEditorStore(s => s.present);
  const currentTime = useEditorStore(s => s.currentTime);
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playbackSpeed = useEditorStore(s => s.playbackSpeed);
  const volume = useEditorStore(s => s.volume);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const setIsPlaying = useEditorStore(s => s.setIsPlaying);
  const duration = useEditorStore(s => s.duration);

  const { w: NW, h: NH } = ASPECT_DIMENSIONS[doc.aspect];
  const aspectRatio = NW / NH;

  // Keep a stable render fn reference
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = useEditorStore.getState().currentTime;

    // Background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    const active = activeClipsAt(useEditorStore.getState().present, t);

    // Draw video clips (bottom to top track order)
    const videoClips = active.filter(c => c.data.kind === "video");
    for (const clip of videoClips) {
      const el = videoEls.current.get(clip.id);
      if (!el || el.readyState < 2) continue;
      const d = clip.data as VideoClipData;
      // Sample keyframed transform params at this clip's local time.
      const localT = t - clip.start;
      const a = sampleAnimatable(d.keyframes, localT, {
        posX: d.posX, posY: d.posY, scaleX: d.scaleX, scaleY: d.scaleY, rotation: d.rotation, opacity: d.opacity,
      });
      ctx.save();
      // Rectangular mask: clip the drawing region before transform.
      if (d.mask?.enabled) {
        const m = d.mask;
        ctx.beginPath();
        ctx.rect(m.x * W, m.y * H, m.w * W, m.h * H);
        if (m.invert) { ctx.rect(0, 0, W, H); ctx.clip("evenodd"); } else ctx.clip();
      }
      ctx.globalAlpha = a.opacity;
      const cssFilter = buildClipFilter(d);
      if (cssFilter !== "none") ctx.filter = cssFilter;
      // Center-based transform (keyframe-animated)
      const cx = a.posX * W;
      const cy = a.posY * H;
      ctx.translate(cx, cy);
      ctx.rotate((a.rotation * Math.PI) / 180);
      ctx.scale(a.scaleX, a.scaleY);
      // Zoom effects — scale up draw area
      const zoomScale = d.effects.includes("viral-zoom") || d.effects.includes("punch-in") ? 1.18
                      : d.effects.includes("zoom") ? 1.08 : 1;
      // Fill frame maintaining source AR
      const srcAR = el.videoWidth / (el.videoHeight || 1);
      let dw = W * zoomScale, dh = H * zoomScale;
      if (srcAR > W / H) { dh = H * zoomScale; dw = H * zoomScale * srcAR; }
      else { dw = W * zoomScale; dh = W * zoomScale / srcAR; }
      ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.filter = "none";

      // Film grain overlay (random noise dots)
      if (d.effects.includes("film-grain") || d.effects.includes("vhs")) {
        ctx.save();
        ctx.globalAlpha = 0.04;
        for (let i = 0; i < 800; i++) {
          const gx = Math.random() * W;
          const gy = Math.random() * H;
          const gs = Math.random() * 2 + 0.5;
          ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
          ctx.fillRect(gx, gy, gs, gs);
        }
        ctx.restore();
      }
    }

    // Draw text clips
    const textClips = active.filter(c => c.data.kind === "text");
    for (const clip of textClips) {
      const d = clip.data as TextClipData;
      const localT = t - clip.start;
      const a = sampleAnimatable(d.keyframes, localT, {
        posX: d.posX, posY: d.posY, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
      });
      ctx.save();
      ctx.globalAlpha = a.opacity;
      const txt = d.uppercase ? d.text.toUpperCase() : d.text;
      const scale = W / 1080; // scale relative to 1080 baseline
      const fs = d.fontSize * scale;
      const weight = d.bold ? "bold" : "normal";
      const style = d.italic ? "italic" : "normal";
      ctx.font = `${style} ${weight} ${fs}px ${d.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const x = a.posX * W;
      const y = a.posY * H;
      if (d.stroke) {
        ctx.lineWidth = d.strokeWidth * scale;
        ctx.strokeStyle = d.strokeColor;
        ctx.strokeText(txt, x, y);
      }
      ctx.fillStyle = d.color;
      ctx.fillText(txt, x, y);
      ctx.restore();
    }
  }, []);

  // RAF loop when playing
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastTs = performance.now();
    const tick = (ts: number) => {
      const delta = (ts - lastTs) / 1000;
      lastTs = ts;
      const store = useEditorStore.getState();
      const newTime = Math.min(store.currentTime + delta * store.playbackSpeed, store.duration);
      useEditorStore.setState({ currentTime: newTime });

      // Sync all video elements
      const doc = store.present;
      const active = activeClipsAt(doc, newTime);
      for (const clip of active) {
        if (clip.data.kind !== "video") continue;
        const el = videoEls.current.get(clip.id);
        if (!el) continue;
        const srcTime = clip.srcIn + (newTime - clip.start) * ((clip.data as VideoClipData).speed ?? 1);
        if (Math.abs(el.currentTime - srcTime) > 0.1) el.currentTime = srcTime;
        if (el.paused) {
          el.playbackRate = (clip.data as VideoClipData).speed ?? 1;
          el.volume = store.volume;
          el.play().catch(() => {});
        }
      }

      drawFrame();

      if (newTime >= store.duration) {
        useEditorStore.getState().setIsPlaying(false);
        useEditorStore.getState().setCurrentTime(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, playbackSpeed, drawFrame]);

  // Redraw on pause/seek
  useEffect(() => {
    if (isPlaying) return;
    // Pause all videos and seek them
    videoEls.current.forEach(el => {
      if (!el.paused) el.pause();
    });
    const active = activeClipsAt(doc, currentTime);
    for (const clip of active) {
      if (clip.data.kind !== "video") continue;
      const el = videoEls.current.get(clip.id);
      if (!el) continue;
      const srcTime = clip.srcIn + (currentTime - clip.start) * ((clip.data as VideoClipData).speed ?? 1);
      el.currentTime = srcTime;
    }
    // Redraw after a short settle
    const id = setTimeout(() => drawFrame(), 50);
    return () => clearTimeout(id);
  }, [isPlaying, currentTime, doc, drawFrame]);

  // Volume sync
  useEffect(() => {
    videoEls.current.forEach(el => { el.volume = volume; });
  }, [volume]);

  // Manage video elements for all video clips
  useEffect(() => {
    const allVideoClips = doc.tracks.flatMap(t =>
      t.clips.filter(c => c.data.kind === "video"),
    );
    const existingIds = new Set(videoEls.current.keys());
    const currentIds = new Set(allVideoClips.map(c => c.id));

    // Remove stale elements
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const el = videoEls.current.get(id);
        if (el) { el.src = ""; el.load(); }
        videoEls.current.delete(id);
      }
    }

    // Create new elements
    for (const clip of allVideoClips) {
      if (!videoEls.current.has(clip.id)) {
        const url = (clip.data as VideoClipData).url;
        const el = document.createElement("video");
        el.src = url;
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        el.muted = false;
        el.volume = volume;
        el.load();
        videoEls.current.set(clip.id, el);
      }
    }

    drawFrame();
  }, [doc.tracks, volume, drawFrame]);

  // Fit canvas inside container
  const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width: cw, height: ch } = entry.contentRect;
      const containerAR = cw / ch;
      let w, h;
      if (containerAR > aspectRatio) {
        h = ch; w = ch * aspectRatio;
      } else {
        w = cw; h = cw / aspectRatio;
      }
      setCanvasStyle({ width: Math.floor(w), height: Math.floor(h) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [aspectRatio]);

  return (
    <div ref={containerRef} className="flex items-center justify-center w-full h-full">
      <div className="relative" style={canvasStyle}>
        <canvas
          ref={canvasRef}
          width={NW}
          height={NH}
          className="rounded-lg"
          style={{
            width: "100%",
            height: "100%",
            boxShadow: "0 0 0 1px #27272a, 0 20px 60px rgba(0,0,0,0.6)",
          }}
        />
        {/* Empty state */}
        {doc.tracks.every(t => t.clips.length === 0) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg" style={{ background: "#111113" }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#1e1e22" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth={1.5} className="w-8 h-8">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <polygon points="10 8 16 12 10 16 10 8" fill="#52525b" stroke="none" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "#52525b" }}>Add media to begin</p>
            <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>Upload a video or drag it to the timeline</p>
          </div>
        )}
      </div>
    </div>
  );
}
