"use client";

// The clip with a caption style drawn on it live, the moment it is picked.
//
// The rendered clip has its captions burned in, so a new template can't be
// shown on top of it without two sets of captions on screen. This plays the
// clip's window of the SOURCE video instead (no captions), framed the way the
// render frames it (the stored crop path), and draws the template with the
// same renderer the editor and Caption Studio use. The real render runs in
// the background; the workspace swaps back to it once it lands.

import { useEffect, useMemo, useRef, useState } from "react";
import CaptionTemplateRender, { type PreviewWord } from "@/app/components/captions/CaptionTemplateRender";
import { planEmoji } from "@clipiro/shared/caption-emoji";
import { parseCaptionSample, type CaptionTemplateSpec } from "@clipiro/shared/caption-templates";
import { coverObjectPosition, cropAt, type CropKeyframe } from "./clipPanelLogic";

export interface ClipCaptionPreviewProps {
  /** Signed URL of the clip's source video; falls back to the rendered clip. */
  sourceUrl: string | null;
  /** Rendered clip, used when the source can't be played. */
  renderedUrl: string | null;
  /** The clip's window in the source, seconds. */
  startSec: number;
  endSec: number;
  /** "16/9" style CSS aspect of the clip. */
  aspectCss: string;
  cropKeyframes: CropKeyframe[] | null;
  /** Clip-relative ms. Empty → the template's own sample line on a loop. */
  words: { word: string; start: number; end: number }[];
  template: CaptionTemplateSpec;
  captionsOn: boolean;
  accent: string | null;
  sizeScale: number;
  positionY: number | null;
  status: string;
}

function parseAspect(css: string): number {
  const [w, h] = css.split("/").map(Number);
  return w > 0 && h > 0 ? w / h : 9 / 16;
}

export function ClipCaptionPreview({
  sourceUrl, renderedUrl, startSec, endSec, aspectCss, cropKeyframes, words,
  template, captionsOn, accent, sizeScale, positionY, status,
}: ClipCaptionPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sourceFailed, setSourceFailed] = useState(false);
  const useSource = !!sourceUrl && !sourceFailed;
  const src = useSource ? sourceUrl : renderedUrl;
  // Clip-relative time the captions are drawn at.
  const [ms, setMs] = useState(0);
  const [muted, setMuted] = useState(true);
  const boxAspect = parseAspect(aspectCss);

  // The source plays only the clip's window, on a loop; the rendered fallback
  // already is the window.
  const offset = useSource ? startSec : 0;
  const length = Math.max(0.5, endSec - startSec);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const t = v.currentTime - offset;
      if (t >= length || t < -0.25) {
        v.currentTime = offset;
      } else if (Math.abs(t * 1000 - last) > 15) {
        last = t * 1000;
        setMs(Math.max(0, last));
        if (useSource && v.videoWidth > 0) {
          const pos = coverObjectPosition(cropAt(cropKeyframes, t), v.videoWidth / v.videoHeight, boxAspect);
          v.style.objectPosition = `${pos.x}% ${pos.y}%`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [offset, length, useSource, cropKeyframes, boxAspect]);

  const sample = !words.length;
  const previewWords = useMemo<PreviewWord[]>(() => {
    if (sample) {
      const tokens = parseCaptionSample(template.sample);
      return tokens.map((tk, i) => ({ text: tk.text, start: 300 + i * 380, end: 640 + i * 380, emoji: tk.emoji ?? null, emphasis: tk.emphasis }));
    }
    const emoji = planEmoji(words, template.emoji !== "none");
    return words.map((w, i) => ({ text: w.word, start: w.start, end: w.end, emoji: emoji[i] ?? null }));
  }, [words, sample, template]);
  const sampleLoop = sample ? 300 + previewWords.length * 380 + 600 : 0;

  return (
    <div className="relative h-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: aspectCss, boxShadow: "0 24px 70px rgba(0,0,0,.5)" }} data-testid="clip-caption-preview">
      {src && (
        <video
          ref={videoRef}
          key={src}
          src={`${src}${useSource ? `#t=${startSec}` : ""}`}
          muted={muted}
          autoPlay
          playsInline
          loop={!useSource}
          preload="auto"
          onError={() => { if (useSource) setSourceFailed(true); }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {captionsOn && (
        <div className="pointer-events-none absolute inset-0">
          <CaptionTemplateRender
            template={template}
            words={previewWords}
            timeMs={sampleLoop ? ms % sampleLoop : ms}
            accent={accent}
            sizeScale={sizeScale}
            positionY={positionY}
            scene={false}
            fill
          />
        </div>
      )}
      <div className="absolute left-3 top-3 right-3 flex items-start justify-between gap-2">
        <span role="status" aria-live="polite" className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {status}
        </span>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/80"
        >
          {muted ? "Sound on" : "Mute"}
        </button>
      </div>
      {sample && captionsOn && (
        <p className="absolute bottom-3 left-3 right-3 text-center text-[10.5px] text-white/70">
          No transcript for this clip, so a sample line shows the style.
        </p>
      )}
    </div>
  );
}
