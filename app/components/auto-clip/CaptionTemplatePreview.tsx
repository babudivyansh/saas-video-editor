"use client";

import { useEffect, useMemo, useState } from "react";
import { assToHex } from "@/lib/ass-color";
import { planEmoji } from "@/lib/caption-templates";
import type { SubtitleStyle } from "@/utils/ffmpeg-render";

// Hover preview for a caption template.
//
// The swatch grid can only show one word in one colour, which is enough to tell
// two templates apart and not enough to decide between them: what a caption
// style actually IS is the word-by-word rhythm, where the line sits in frame,
// and how the highlight moves. Those are the three things this draws.
//
// It is a browser approximation, not the provider's render, and it says so for
// premium templates. Faking certainty here would be the worst kind of lie —
// the user pays per minute for the animation they think they're choosing.
//
// Preference order:
//   1. previewVideoUrl / previewImageUrl — Clipiro-owned media, once recorded.
//      The provider hands us no preview assets (see lib/caption-templates.ts),
//      so these arrive through the `caption_templates` Config overlay with no
//      code change, and this component picks them up automatically.
//   2. The template's native ASS style, animated in DOM. Always available,
//      costs nothing, and is exactly what renders if the provider is down.

// Short enough to loop inside a hover, long enough to show the cadence — and
// it deliberately ends on a word planEmoji() recognises, so a template that
// auto-places emoji visibly does so here instead of looking identical to one
// that doesn't.
const SAMPLE_LINE = ["THIS", "IS", "INSANE"];
const WORD_MS = 420;

export interface PreviewTemplate {
  id: string;
  label: string;
  hint: string;
  premium: boolean;
  /** Auto-places emoji on recognised words. */
  emoji?: boolean;
  /** False when `style` is a stand-in nobody has checked against the real look. */
  lookVerified?: boolean;
  /** True when picking this spends credits on an external render. */
  requiresRender: boolean;
  previewImageUrl?: string | null;
  previewVideoUrl?: string | null;
  style: SubtitleStyle;
}

/**
 * Maps an ASS alignment to where the sample sits, so both the swatch and the
 * preview hint at the placement the clip will actually get.
 */
export function alignToClass(alignment: number | undefined): string {
  if (alignment === 2) return "items-end pb-2";   // bottom
  if (alignment === 8) return "items-start pt-2"; // top
  return "items-center";                           // 5 = centre, and the default
}

/**
 * Cycles the highlighted word, or returns -1 to mean "highlight nothing".
 *
 * -1 is returned for templates whose style is not animated and for viewers who
 * asked for reduced motion — in both cases every word renders in the base
 * colour, which is what a still frame of that template looks like.
 */
function useWordCycle(count: number, animated: boolean): number {
  const [index, setIndex] = useState(0);
  // Read once, lazily: the card only ever mounts from a hover, so there is no
  // server render whose markup this could disagree with.
  const [allowed] = useState(
    () => typeof window === "undefined" || !window.matchMedia
      || !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const running = animated && allowed && count > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), WORD_MS);
    return () => clearInterval(id);
  }, [running, count]);

  return running ? index : -1;
}

export default function CaptionTemplatePreview({ template }: { template: PreviewTemplate }) {
  const s = template.style ?? {};
  const animated = s.animated !== false;
  const active = useWordCycle(SAMPLE_LINE.length, animated);

  const base = assToHex(s.baseColor ?? "&H00FFFFFF");
  const highlight = assToHex(s.highlightColor ?? s.baseColor ?? "&H00FFFFFF");
  const boxed = s.borderStyle === 3;
  const media = template.previewVideoUrl || template.previewImageUrl;

  // The SAME placement function the burn-in uses (lib/caption-templates.ts),
  // fed the same shape — so the emoji in this card is the emoji that renders,
  // on the word it renders on, not an illustration of the idea.
  const emoji = useMemo(
    () => planEmoji(SAMPLE_LINE.map((word) => ({ word })), template.emoji ?? false),
    [template.emoji],
  );

  return (
    <div className="w-[184px] rounded-xl border border-card-border bg-panel-raised p-2 shadow-lg">
      <div className={`relative w-[112px] aspect-[9/16] mx-auto overflow-hidden rounded-lg bg-gradient-to-br from-surface-3 to-bg flex justify-center px-2 ${alignToClass(s.alignment)}`}>
        {template.previewVideoUrl ? (
          <video src={template.previewVideoUrl} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : template.previewImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.previewImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span
            className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 leading-tight"
            style={boxed ? { background: "rgba(0,0,0,0.65)", padding: "3px 5px", borderRadius: 4 } : undefined}
          >
            {SAMPLE_LINE.map((w, i) => (
              <span
                key={w}
                style={{
                  fontFamily: `${s.fontName ?? "Outfit"}, sans-serif`,
                  // The real render scales type to a 1080x1920 frame; this box is
                  // ~112px wide, so the size is a legibility choice rather than a
                  // proportional preview of s.fontSize.
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  color: i === active ? highlight : base,
                  transform: i === active ? "scale(1.14)" : "scale(1)",
                  transition: "transform 110ms ease-out, color 110ms ease-out",
                  display: "inline-block",
                  textShadow: boxed ? undefined : "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
                }}
              >
                {/* The emoji rides with its word, exactly as the ASS builder
                    appends it, so it can never wrap onto a line of its own. */}
                {emoji[i] ? `${w} ${emoji[i]}` : w}
              </span>
            ))}
          </span>
        )}

        {/* An unauthored look must not pass for an authored one. The swatch and
            this frame are drawn from a placeholder family assigned by rotation
            — see REST_OF_LIBRARY in lib/caption-templates.ts — so the frame
            says so, in the frame, where the wrong impression is formed. */}
        {template.lookVerified === false && !media && (
          <span className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-white">
            Stand-in look
          </span>
        )}
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-ink">
        <span className="truncate">{template.label}</span>
        {template.premium && (
          <span className="shrink-0 rounded-full border border-tint-amber-border bg-tint-amber px-1 text-[8px] font-bold text-ink">PRO</span>
        )}
      </p>
      <p className="text-[10px] leading-snug text-ink-soft">{template.hint}</p>

      {template.emoji && (
        <p className="mt-1 text-[10px] leading-snug text-ink-soft/80">
          {/* Precise on purpose. Our emoji are placed by planEmoji() and burned
              in by our own renderer; the provider's API has no emoji parameter
              at all (checked against their docs, 2026-09-08), so on a paid
              render the emoji are whatever that template does. Showing ours in
              the card and implying they survive to the paid output would be a
              promise we cannot keep. */}
          {template.requiresRender
            ? "Auto emoji on recognised words — in the fallback render. Paid renders use the partner template's own."
            : "Auto-places emoji on recognised words."}
        </p>
      )}

      {template.requiresRender && (
        <p className="mt-1 text-[10px] leading-snug text-ink-soft/80">
          {media
            ? "Animated by our render partner. Costs credits per minute of clip."
            : "Animated by our render partner — this preview approximates it. Costs credits per minute of clip."}
        </p>
      )}
    </div>
  );
}
