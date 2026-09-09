"use client";

import { useEffect, useMemo, useState } from "react";
import { assToHex } from "@/lib/ass-color";
import CaptionTemplatePreview, { alignToClass } from "./CaptionTemplatePreview";
import {
  CAPTION_TEMPLATES,
  CAPTION_CATEGORIES,
  isProviderTemplate,
  type CaptionCategory,
} from "@/lib/caption-templates";
import type { SubtitleStyle } from "@/utils/ffmpeg-render";

// The AutoClip create page's caption picker.
//
// Replaces SubtitleStylePicker, which rendered 16 font/colour permutations
// selected by ARRAY INDEX (lib/caption-styles.ts). Those were exactly the "pile
// of colour pickers" that lib/caption-templates.ts's header comment was written
// to replace, and they meant the premium templates were unreachable from the
// main entry point to the feature.
//
// Three layers of information, because a caption style is a visual choice that
// still needs a name to be discussed, remembered or supported:
//
//   swatch  — the sample word in the template's own font and highlight colour,
//             so what you see is what gets burned in.
//   name    — always visible under the swatch. The premium ones carry the
//             render partner's own template names, so a style the user already
//             knows from elsewhere is recognisable here.
//   hover   — CaptionTemplatePreview: a 9:16 frame with the word-by-word
//             animation and the line's real placement, plus the description
//             the name alone doesn't carry.
//
// The list is FETCHED (admin overrides + provider-mapping validation are
// server-side facts) with the compiled-in table as the offline fallback, same
// contract as CaptionTemplatePicker.

interface ApiTemplate {
  id: string;
  label: string;
  hint: string;
  category: CaptionCategory | null;
  premium: boolean;
  /** Auto-places emoji on recognised words. */
  emoji: boolean;
  /** False when the swatch is a stand-in rather than an authored look. */
  lookVerified: boolean;
  /** True when picking this spends credits on an external render. */
  requiresRender: boolean;
  previewImageUrl?: string | null;
  previewVideoUrl?: string | null;
  style: SubtitleStyle;
}

const FALLBACK: ApiTemplate[] = CAPTION_TEMPLATES.map((t) => ({
  id: t.id,
  label: t.label,
  hint: t.hint,
  category: t.category ?? null,
  premium: t.premium ?? false,
  emoji: t.emoji ?? false,
  lookVerified: t.lookVerified !== false,
  requiresRender: isProviderTemplate(t),
  previewImageUrl: t.previewImageUrl ?? null,
  previewVideoUrl: t.previewVideoUrl ?? null,
  style: t.style,
}));

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CaptionStyleGridProps {
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
  sample?: string;
  /** Called when the loaded list changes, so the parent can price the run. */
  onTemplatesLoaded?: (templates: { id: string; requiresRender: boolean }[]) => void;
}

export default function CaptionStyleGrid({
  value,
  onChange,
  disabled,
  sample = "VIRAL",
  onTemplatesLoaded,
}: CaptionStyleGridProps) {
  const [templates, setTemplates] = useState<ApiTemplate[]>(FALLBACK);
  const [category, setCategory] = useState<CaptionCategory | "All">("All");
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/caption-templates", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d?.templates) || d.templates.length === 0) return;
        setTemplates(d.templates);
      })
      .catch(() => { /* keep the built-in list */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    onTemplatesLoaded?.(templates.map((t) => ({ id: t.id, requiresRender: t.requiresRender })));
    // onTemplatesLoaded is a parent callback; depending on it would loop when
    // the parent passes an inline arrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // Only offer a tab that has something in it — an empty "Podcast" tab reads as
  // a broken picker rather than a deliberate catalogue.
  const tabs = useMemo(() => {
    const present = new Set(templates.map((t) => t.category).filter(Boolean));
    return ["All", ...CAPTION_CATEGORIES.filter((c) => present.has(c))] as const;
  }, [templates]);

  const visible = useMemo(
    () => (category === "All" ? templates : templates.filter((t) => t.category === category)),
    [templates, category],
  );

  return (
    <div className="space-y-2.5">
      {tabs.length > 2 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Caption style categories">
          {tabs.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              disabled={disabled}
              onClick={() => setCategory(c as CaptionCategory | "All")}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                category === c
                  ? "bg-tint-emerald text-ink border border-tint-emerald-border"
                  : "text-ink-soft border border-card-border hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {visible.map((t) => {
          const selected = value === t.id;
          const s = t.style ?? {};
          // The template's own colours, converted out of ASS's reversed byte
          // order. Highlight is used for the sample because that is the colour
          // the viewer's eye actually lands on in a word-by-word caption.
          const color = assToHex(s.highlightColor ?? s.baseColor ?? "&H00FFFFFF");
          return (
            <div
              key={t.id}
              className="relative"
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onChange(t.id)}
                // Keyboard users get the same preview the mouse does.
                onFocus={() => setHovered(t.id)}
                onBlur={() => setHovered((h) => (h === t.id ? null : h))}
                title={`${t.label} — ${t.hint}`}
                className={`w-full rounded-xl overflow-hidden transition-all disabled:opacity-40
                  ${selected ? "ring-2 ring-brand ring-offset-1" : "ring-1 ring-card-border hover:ring-brand/50"}`}
              >
                {/* Dashed = the look is a stand-in, not this template's real
                    one. A quiet visual difference rather than a badge: there
                    are 33 of these, and 33 badges would read as a warning
                    state rather than a footnote. The hover card says it in
                    words. */}
                <span
                  className={`relative h-[72px] flex justify-center bg-gradient-to-br from-surface-3 to-bg ${alignToClass(s.alignment)} ${
                    t.lookVerified ? "" : "border border-dashed border-card-border"
                  }`}
                >
                  <span
                    style={{
                      fontFamily: `${s.fontName ?? "Outfit"}, sans-serif`,
                      color,
                      fontWeight: 800,
                      // The real render scales type to a 1080x1920 frame; the
                      // swatch is ~150px wide, so this is a legibility choice,
                      // not a proportional preview of s.fontSize.
                      fontSize: 16,
                      letterSpacing: 0.3,
                      textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
                      ...(s.borderStyle === 3
                        ? { background: "rgba(0,0,0,0.65)", padding: "2px 6px", borderRadius: 4 }
                        : {}),
                    }}
                  >
                    {sample}
                  </span>

                  {t.premium && (
                    <span className="absolute top-1.5 left-1.5 rounded-full border border-tint-amber-border bg-tint-amber px-1.5 text-[8px] font-bold text-ink">
                      PRO
                    </span>
                  )}

                  {selected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </span>

                {/* The name, always visible. A wall of unlabelled swatches asks
                    the user to tell 18 looks apart by a single sample word, and
                    the premium names here are the provider's own — the point of
                    showing them is that they match what the user already knows
                    those styles as. */}
                <span
                  className={`flex items-center gap-1 px-2 py-1 text-left text-[10.5px] font-semibold ${
                    selected ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  <span className="truncate">{t.label}</span>
                  {/* Which templates auto-place emoji was previously invisible
                      until a clip came back rendered. */}
                  {t.emoji && (
                    <span className="shrink-0 text-[9px] leading-none" title="Auto-places emoji" aria-label="Auto-places emoji">
                      😀
                    </span>
                  )}
                </span>
              </button>

              {hovered === t.id && (
                // pointer-events-none: the card must never sit between the
                // cursor and the swatch it describes.
                <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2">
                  <CaptionTemplatePreview template={t} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.find((t) => t.id === value)?.requiresRender && (
        <p className="text-[11px] text-ink-soft">
          Premium styles are rendered by our animation partner and cost credits per minute of clip.
        </p>
      )}
    </div>
  );
}
