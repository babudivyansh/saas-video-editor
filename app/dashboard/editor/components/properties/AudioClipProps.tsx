"use client";

import React, { useMemo } from "react";
import { useEditorStore } from "../../store/editorStore";
import { MAX_FADE_SEC, type AudioClip } from "@/lib/editor/types";
import { docDuration } from "@/lib/editor/doc-utils";
import { clipDuckSegments, DEFAULT_DUCK_LEVEL, musicGainAt, speechRangesFromCaptions } from "@/lib/editor/music-envelope";
import { Button, NumberField, PropertyCard, Slider, Switch } from "../ui";

/** Small picture of the clip's level over time: fades and the dips under speech. */
function LevelGraph({ clip }: { clip: AudioClip }) {
  const doc = useEditorStore((s) => s.doc);
  const points = useMemo(() => {
    const segs = clip.duck ? clipDuckSegments(clip, speechRangesFromCaptions(doc)) : [];
    const n = 80;
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = clip.timelineStart + (clip.duration * i) / n;
      const g = clip.volume > 0 ? musicGainAt(clip, t, segs) / clip.volume : 0;
      return `${(i / n) * 260},${38 - g * 32}`;
    }).join(" ");
  }, [clip, doc]);
  return (
    <svg viewBox="0 0 260 40" className="h-10 w-full" role="img" aria-label="Music level over time">
      <polyline points={points} fill="none" stroke="var(--editor-accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function AudioClipProps({ clip }: { clip: AudioClip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const doc = useEditorStore((s) => s.doc);
  const patch = (p: Partial<AudioClip>) => updateClip("audio", clip.id, p);
  const hasSpeech = useMemo(() => speechRangesFromCaptions(doc).length > 0, [doc]);
  const videoEnd = doc.tracks.video.reduce((m, v) => Math.max(m, v.timelineStart + v.duration), 0) || docDuration(doc);
  const fitLength = Math.max(0.5, videoEnd - clip.timelineStart);

  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Volume" collapsible={false}>
        <Slider label="Volume" value={clip.volume} min={0} max={1} step={0.05} onChange={(v) => patch({ volume: v })} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-editor-text">Lower music when someone talks</span>
          <Switch checked={!!clip.duck} label="Lower music when someone talks" onChange={(on) => patch({ duck: on })} />
        </div>
        {clip.duck && (
          <>
            <Slider label="Level while talking" value={clip.duckLevel ?? DEFAULT_DUCK_LEVEL} min={0.05} max={1} step={0.05} onChange={(v) => patch({ duckLevel: v })} />
            {!hasSpeech && (
              <p className="text-[11px] leading-snug text-warning">
                Speech is found from your captions — generate captions and the music will dip wherever someone talks.
              </p>
            )}
          </>
        )}
        <div className="rounded-editor-md border border-editor-border bg-editor-card px-2 py-1.5">
          <p className="mb-0.5 text-[10.5px] text-editor-text-faint">Level over time</p>
          <LevelGraph clip={clip} />
        </div>
      </PropertyCard>

      <PropertyCard title="Fade" collapsible={false}>
        <Slider label="Fade in (s)" value={clip.fadeIn ?? 0} min={0} max={MAX_FADE_SEC} step={0.1} onChange={(v) => patch({ fadeIn: v })} />
        <Slider label="Fade out (s)" value={clip.fadeOut ?? 0} min={0} max={MAX_FADE_SEC} step={0.1} onChange={(v) => patch({ fadeOut: v })} />
      </PropertyCard>

      <PropertyCard title="Timing" collapsible={false}>
        <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
        <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
        <NumberField label="Trim in (s)" value={clip.srcIn} min={0} step={0.1} onChange={(v) => patch({ srcIn: v })} />
        <Button variant="subtle" size="sm" className="w-full" onClick={() => patch({ duration: fitLength })} disabled={Math.abs(fitLength - clip.duration) < 0.05}>
          Match the video&apos;s length ({fitLength.toFixed(1)} s)
        </Button>
        <p className="text-[10.5px] leading-snug text-editor-text-faint">If the song is shorter than that, it ends early — it doesn&apos;t loop.</p>
      </PropertyCard>
    </div>
  );
}
