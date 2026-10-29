"use client";

// The project's video in its export frame with its captions drawn on top —
// the same renderer (CaptionTemplateRender), template resolution
// (effectiveCaptionTemplate) and framing rules the export uses, so what the
// Studio shows is what renders.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@clipiro/shared";
import CaptionTemplateRender, { type PreviewWord } from "@/app/components/captions/CaptionTemplateRender";
import { templateCaptionGroups } from "@clipiro/shared/captions";
import { planEmoji } from "@clipiro/shared/caption-emoji";
import { effectiveCaptionTemplate } from "@clipiro/shared/caption-style";
import { parseCaptionSample } from "@clipiro/shared/caption-templates";
import { docDimensions, type TimelineDoc } from "@/lib/editor/types";

export interface StudioPreviewProps {
  doc: TimelineDoc;
  media: Record<string, Asset>;
  /** Draw this template instead of the cues' own (previewing a gallery pick). */
  templateId?: string | null;
  /** Largest box the frame may take; the frame keeps its own shape inside it. */
  maxWidth: number;
  maxHeight: number;
  className?: string;
  /** Pass to control playback from outside (the editor's play button, seeking). */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** Plays muted on a loop by itself unless false. */
  autoPlay?: boolean;
  /** Called as the video's clock moves (ms). */
  onTime?: (ms: number) => void;
  /** Drawn over the frame, above the captions (safe-zone guides). */
  children?: React.ReactNode;
}

/** The video's clock, read every frame while it plays (ms). */
function useVideoTime(ref: React.RefObject<HTMLVideoElement | null>): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = ref.current;
      if (v) setMs((prev) => (Math.abs(prev - v.currentTime * 1000) > 15 ? v.currentTime * 1000 : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
  return ms;
}

export function StudioPreview({ doc, media, templateId, maxWidth, maxHeight, className = "", videoRef: outerRef, autoPlay = true, onTime, children }: StudioPreviewProps) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const videoRef = outerRef ?? ownRef;
  const timeMs = useVideoTime(videoRef);
  useEffect(() => { onTime?.(timeMs); }, [timeMs, onTime]);
  const frame = docDimensions(doc);
  const scale = Math.min(maxWidth / frame.w, maxHeight / frame.h);
  const clip = doc.tracks.video[0];
  const src = clip ? media[clip.assetId]?.url ?? null : null;

  const layers = useMemo(() => {
    const groups = templateCaptionGroups(doc.tracks.caption);
    // No captions yet (still transcribing): show the template's own sample
    // line on a loop so a pick can still be judged.
    if (!groups.length && templateId) {
      const tokens = parseCaptionSample(effectiveCaptionTemplate(templateId, doc.captionStyle, frame).template.sample);
      return [{
        key: "sample",
        templateId,
        accent: null,
        loopMs: 300 + tokens.length * 380,
        words: tokens.map((t, i) => ({ text: t.text, start: 300 + i * 380, end: 640 + i * 380, emoji: t.emoji ?? null, emphasis: t.emphasis })) as PreviewWord[],
      }];
    }
    return groups.map((g) => {
      const tpl = effectiveCaptionTemplate(templateId ?? g.templateId, doc.captionStyle, frame).template;
      const emoji = planEmoji(g.words, tpl.emoji !== "none");
      return {
        key: `${g.templateId}|${g.accent ?? ""}`,
        templateId: templateId ?? g.templateId,
        accent: g.accent ?? null,
        loopMs: 0,
        words: g.words.map((w, i) => ({ text: w.word, start: w.start, end: w.end, emoji: emoji[i] ?? null, style: w.style })) as PreviewWord[],
      };
    });
  }, [doc.tracks.caption, doc.captionStyle, templateId, frame]);

  const fit = clip?.fit === "fit";
  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border border-line-strong bg-black ${className}`}
      style={{ width: Math.round(frame.w * scale), maxWidth: "100%", aspectRatio: `${frame.w} / ${frame.h}` }}
    >
      {src && fit && (
        // The blurred fill behind a "fit" video. Its own copy, looping in
        // step closely enough for a backdrop.
        <video src={src} muted loop autoPlay playsInline aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-[10px]" />
      )}
      {src ? (
        <video
          ref={videoRef}
          src={src}
          muted={autoPlay}
          loop
          autoPlay={autoPlay}
          preload="auto"
          playsInline
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: fit ? "contain" : "cover",
            objectPosition: fit ? "50% 50%" : `${(clip?.focusX ?? 0.5) * 100}% ${(clip?.focusY ?? 0.5) * 100}%`,
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">Loading video…</div>
      )}
      {layers.map((l) => {
        const tpl = effectiveCaptionTemplate(l.templateId, doc.captionStyle, frame);
        return (
          <div key={l.key} className="pointer-events-none absolute inset-0">
            <CaptionTemplateRender
              template={tpl.template}
              positionY={tpl.positionY}
              words={l.words}
              timeMs={l.loopMs ? timeMs % l.loopMs : timeMs}
              accent={l.accent}
              scene={false}
              fill
            />
          </div>
        );
      })}
      {children}
    </div>
  );
}
