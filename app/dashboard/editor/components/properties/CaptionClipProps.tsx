"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type {
  CaptionClip,
  CaptionHighlightMode,
  CaptionPositionPreset,
  FontFamily,
  TextEntrancePreset,
  TextExitPreset,
  TextLoopPreset,
} from "@/lib/editor/types";
import {
  CAPTION_HIGHLIGHT_MODES,
  CAPTION_POSITION_PRESETS,
  FONT_WHITELIST,
  TEXT_ENTRANCE_PRESETS,
  TEXT_EXIT_PRESETS,
  TEXT_LOOP_PRESETS,
} from "@/lib/editor/types";
import { ColorField, FieldRow, NumberField, PillGroup, PreviewOnlyBadge, PropertyCard, SelectField, Slider, Switch } from "../ui";

const SAFE_MARGIN_DEFAULT = 0.1;

function positionForPreset(preset: CaptionPositionPreset, safeMarginPct: number): { x: number; y: number } | null {
  switch (preset) {
    case "top":
      return { x: 0.5, y: safeMarginPct };
    case "center":
      return { x: 0.5, y: 0.5 };
    case "bottom":
      return { x: 0.5, y: 1 - safeMarginPct };
    case "custom":
      return null; // leave x/y untouched
  }
}

export default function CaptionClipProps({ clip, activeTab }: { clip: CaptionClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<CaptionClip>, undoable = true) => updateClip("caption", clip.id, p, undoable);

  if (activeTab === "highlight") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Highlight mode" trailing={<PreviewOnlyBadge />} collapsible={false}>
          <PillGroup
            layoutId="caption-highlight-pills"
            value={clip.highlightMode}
            onChange={(v: CaptionHighlightMode) => patch({ highlightMode: v })}
            options={Object.entries(CAPTION_HIGHLIGHT_MODES).map(([key, v]) => ({ key: key as CaptionHighlightMode, label: v.label }))}
          />
        </PropertyCard>
        {clip.highlightMode !== "none" && (
          <>
            {/* Real export effects — color and speed both drive the exported ASS \k/\kf tags. */}
            <PropertyCard title="Highlight style">
              <ColorField label="Highlight color" value={clip.highlightColor ?? clip.color} onChange={(v) => v && patch({ highlightColor: v })} />
              <NumberField
                label="Highlight speed"
                value={clip.highlightSpeed ?? 1}
                min={0.25}
                max={3}
                step={0.05}
                onChange={(v) => patch({ highlightSpeed: v })}
              />
            </PropertyCard>
            <PropertyCard title="Active word emphasis" trailing={<PreviewOnlyBadge />}>
              <Slider label="Scale" value={clip.activeWordScale ?? 1} min={1} max={2} step={0.05} onChange={(v) => patch({ activeWordScale: v })} />
              <Slider label="Opacity" value={clip.activeWordOpacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => patch({ activeWordOpacity: v })} />
            </PropertyCard>
          </>
        )}
      </div>
    );
  }

  if (activeTab === "transform") {
    const safeMargin = clip.safeMarginPct ?? SAFE_MARGIN_DEFAULT;
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Position" collapsible={false}>
          <PillGroup
            layoutId="caption-position-pills"
            value={clip.positionPreset ?? "custom"}
            onChange={(v: CaptionPositionPreset) => {
              const derived = positionForPreset(v, safeMargin);
              patch(derived ? { positionPreset: v, ...derived } : { positionPreset: v });
            }}
            options={Object.entries(CAPTION_POSITION_PRESETS).map(([key, v]) => ({ key: key as CaptionPositionPreset, label: v.label }))}
          />
          <NumberField
            label="X (%)"
            value={clip.x * 100}
            min={0}
            max={100}
            step={1}
            onChange={(v) => patch({ x: v / 100, positionPreset: "custom" })}
          />
          <NumberField
            label="Y (%)"
            value={clip.y * 100}
            min={0}
            max={100}
            step={1}
            onChange={(v) => patch({ y: v / 100, positionPreset: "custom" })}
          />
          <p className="text-[10px] leading-snug text-editor-text-faint">Tip: drag the caption directly on the preview.</p>
        </PropertyCard>
        <PropertyCard title="Safe margin">
          <Slider
            label="Margin"
            value={safeMargin}
            min={0}
            max={0.2}
            step={0.01}
            onChange={(v) => {
              const preset = clip.positionPreset ?? "custom";
              const derived = preset === "top" || preset === "bottom" ? positionForPreset(preset, v) : null;
              patch({ safeMarginPct: v, ...(derived ?? {}) });
            }}
          />
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "adjust") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Stroke" defaultOpen={false}>
          <FieldRow label="Enabled">
            <Switch
              checked={!!clip.strokeColor}
              onChange={(v) => patch({ strokeColor: v ? "#000000" : null, strokeWidthPct: clip.strokeWidthPct ?? 0.01 })}
            />
          </FieldRow>
          {clip.strokeColor && (
            <>
              <ColorField label="Color" value={clip.strokeColor} onChange={(v) => v && patch({ strokeColor: v })} />
              <Slider label="Width" value={clip.strokeWidthPct ?? 0.01} min={0} max={0.05} step={0.002} onChange={(v) => patch({ strokeWidthPct: v })} />
            </>
          )}
        </PropertyCard>

        <PropertyCard title="Shadow" defaultOpen={false}>
          <FieldRow label="Enabled">
            <Switch
              checked={!!clip.shadow}
              onChange={(v) =>
                patch({ shadow: v ? { color: "#000000", offsetXPct: 0.01, offsetYPct: 0.01, opacity: 0.6, blurPx: 4 } : null })
              }
            />
          </FieldRow>
          {clip.shadow && (
            <>
              <ColorField label="Color" value={clip.shadow.color} onChange={(v) => v && patch({ shadow: { ...clip.shadow!, color: v } })} />
              <NumberField
                label="Offset X (%)"
                value={clip.shadow.offsetXPct * 100}
                min={-10}
                max={10}
                step={0.5}
                onChange={(v) => patch({ shadow: { ...clip.shadow!, offsetXPct: v / 100 } })}
              />
              <NumberField
                label="Offset Y (%)"
                value={clip.shadow.offsetYPct * 100}
                min={-10}
                max={10}
                step={0.5}
                onChange={(v) => patch({ shadow: { ...clip.shadow!, offsetYPct: v / 100 } })}
              />
              <Slider label="Opacity" value={clip.shadow.opacity} min={0} max={1} step={0.05} onChange={(v) => patch({ shadow: { ...clip.shadow!, opacity: v } })} />
              <NumberField
                label="Blur (px)"
                value={clip.shadow.blurPx ?? 0}
                min={0}
                max={40}
                step={1}
                onChange={(v) => patch({ shadow: { ...clip.shadow!, blurPx: v } })}
              />
              <p className="text-[10px] leading-snug text-editor-text-faint">Blur is preview-only — export uses a sharp offset shadow.</p>
            </>
          )}
        </PropertyCard>

        <PropertyCard title="Opacity & line height">
          <Slider label="Opacity" value={clip.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => patch({ opacity: v })} />
          <NumberField label="Line height" value={clip.lineHeight ?? 1.2} min={0.8} max={3} step={0.1} onChange={(v) => patch({ lineHeight: v })} />
        </PropertyCard>

        <PropertyCard title="Letter spacing" trailing={<PreviewOnlyBadge />}>
          <NumberField label="Spacing (px)" value={clip.letterSpacingPx ?? 0} min={-5} max={30} step={0.5} onChange={(v) => patch({ letterSpacingPx: v })} />
        </PropertyCard>

        <PropertyCard title="Text case">
          <PillGroup
            layoutId="caption-case-pills"
            value={clip.textTransform ?? "none"}
            onChange={(v) => patch({ textTransform: v })}
            options={[
              { key: "none", label: "Aa" },
              { key: "uppercase", label: "AA" },
              { key: "lowercase", label: "aa" },
              { key: "capitalize", label: "Aa Bb" },
            ]}
          />
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "animation") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Entrance" trailing={<PreviewOnlyBadge />}>
          <PillGroup
            layoutId="caption-entrance-pills"
            value={clip.entrance?.type ?? "none"}
            onChange={(type: TextEntrancePreset) =>
              patch({ entrance: type === "none" ? null : { type, duration: clip.entrance?.duration ?? 0.5, delay: clip.entrance?.delay ?? 0 } })
            }
            options={Object.entries(TEXT_ENTRANCE_PRESETS).map(([key, v]) => ({ key: key as TextEntrancePreset, label: v.label }))}
          />
          {clip.entrance && clip.entrance.type !== "none" && (
            <>
              <NumberField
                label="Duration (s)"
                value={clip.entrance.duration}
                min={0.1}
                max={5}
                step={0.1}
                onChange={(v) => patch({ entrance: { ...clip.entrance!, duration: v } })}
              />
              <NumberField
                label="Delay (s)"
                value={clip.entrance.delay}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => patch({ entrance: { ...clip.entrance!, delay: v } })}
              />
            </>
          )}
        </PropertyCard>

        <PropertyCard title="Loop" trailing={<PreviewOnlyBadge />}>
          <PillGroup
            layoutId="caption-loop-pills"
            value={clip.loop?.type ?? "none"}
            onChange={(type: TextLoopPreset) => patch({ loop: type === "none" ? null : { type, speed: clip.loop?.speed ?? 1 } })}
            options={Object.entries(TEXT_LOOP_PRESETS).map(([key, v]) => ({ key: key as TextLoopPreset, label: v.label }))}
          />
          {clip.loop && clip.loop.type !== "none" && (
            <NumberField label="Speed" value={clip.loop.speed} min={0.1} max={5} step={0.1} onChange={(v) => patch({ loop: { ...clip.loop!, speed: v } })} />
          )}
        </PropertyCard>

        <PropertyCard title="Exit" trailing={<PreviewOnlyBadge />}>
          <PillGroup
            layoutId="caption-exit-pills"
            value={clip.exit?.type ?? "none"}
            onChange={(type: TextExitPreset) =>
              patch({ exit: type === "none" ? null : { type, duration: clip.exit?.duration ?? 0.5, delay: clip.exit?.delay ?? 0 } })
            }
            options={Object.entries(TEXT_EXIT_PRESETS).map(([key, v]) => ({ key: key as TextExitPreset, label: v.label }))}
          />
          {clip.exit && clip.exit.type !== "none" && (
            <>
              <NumberField
                label="Duration (s)"
                value={clip.exit.duration}
                min={0.1}
                max={5}
                step={0.1}
                onChange={(v) => patch({ exit: { ...clip.exit!, duration: v } })}
              />
              <NumberField
                label="Delay (s)"
                value={clip.exit.delay}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => patch({ exit: { ...clip.exit!, delay: v } })}
              />
            </>
          )}
        </PropertyCard>
      </div>
    );
  }

  // activeTab === "basic"
  const handleTextChange = (newText: string) => {
    if (clip.words) {
      const newWords = newText.trim().split(/\s+/).filter(Boolean);
      if (newWords.length === clip.words.length) {
        // Word count unchanged (e.g. fixing a typo) — remap word strings
        // positionally so karaoke timing survives the edit.
        patch({ text: newText, words: clip.words.map((w, i) => ({ ...w, word: newWords[i] })) }, false);
        return;
      }
      // Word count changed — the stored timing no longer corresponds to the
      // content, so drop it and fall back to a flat (non-karaoke) cue.
      patch({ text: newText, words: undefined, highlightMode: "none" }, false);
      return;
    }
    patch({ text: newText }, false);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Text" collapsible={false}>
        <textarea
          value={clip.text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => patch({}, true)}
          rows={3}
          className="w-full resize-none rounded-editor-sm border border-editor-border bg-editor-elevated px-2 py-1.5 text-xs text-editor-text outline-none transition-colors focus:border-editor-accent"
        />
        <SelectField label="Font" value={clip.fontFamily} options={FONT_WHITELIST} onChange={(v) => patch({ fontFamily: v as FontFamily })} />
        <NumberField
          label="Size (% height)"
          value={clip.fontSizePct * 100}
          min={1}
          max={50}
          step={0.5}
          onChange={(v) => patch({ fontSizePct: v / 100 })}
        />
        <FieldRow label="Bold">
          <Switch checked={clip.bold} onChange={(v) => patch({ bold: v })} />
        </FieldRow>
        <ColorField label="Color" value={clip.color} onChange={(v) => v && patch({ color: v })} />
        <ColorField label="Background" value={clip.bgColor} allowNone onChange={(v) => patch({ bgColor: v })} />
        {clip.bgColor && <p className="text-[10px] leading-snug text-editor-text-faint">Background is preview-only — export has no per-line box behind captions.</p>}
      </PropertyCard>
      <PropertyCard title="Timing">
        <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
        <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
      </PropertyCard>
    </div>
  );
}
