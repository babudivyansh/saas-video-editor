"use client";

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import type { FontFamily, TextClip, TextEntrancePreset, TextLoopPreset, TextExitPreset } from "@/lib/editor/types";
import { FONT_WHITELIST, TEXT_ENTRANCE_PRESETS, TEXT_LOOP_PRESETS, TEXT_EXIT_PRESETS } from "@/lib/editor/types";
import {
  Button,
  ColorField,
  FieldRow,
  NumberField,
  PillGroup,
  PropertyCard,
  PreviewOnlyBadge,
  SelectField,
  Slider,
  Switch,
  Tooltip,
} from "../ui";
import LexicalTextEditor from "./text/LexicalTextEditor";

const AI_STUBS = ["Rewrite this text", "Fix grammar", "Translate", "Shorten", "Expand"];

export default function TextClipProps({ clip, activeTab }: { clip: TextClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<TextClip>, undoable = true) => updateClip("text", clip.id, p, undoable);

  if (activeTab === "transform") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Position" collapsible={false}>
          <NumberField label="X (%)" value={clip.x * 100} min={0} max={100} step={1} onChange={(v) => patch({ x: v / 100 })} />
          <NumberField label="Y (%)" value={clip.y * 100} min={0} max={100} step={1} onChange={(v) => patch({ y: v / 100 })} />
          <p className="text-[10px] leading-snug text-editor-text-faint">Tip: drag the text directly on the preview.</p>
        </PropertyCard>
        <PropertyCard title="Rotation" trailing={<PreviewOnlyBadge />}>
          <NumberField label="Angle (°)" value={clip.rotationDeg ?? 0} min={-180} max={180} step={1} onChange={(v) => patch({ rotationDeg: v })} />
        </PropertyCard>
      </div>
    );
  }

  if (activeTab === "adjust") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="Gradient" trailing={<PreviewOnlyBadge />} defaultOpen={false}>
          <FieldRow label="Enabled">
            <Switch
              checked={!!clip.gradient}
              onChange={(v) => patch({ gradient: v ? { from: clip.color, to: "#ffffff", angleDeg: 90 } : null })}
            />
          </FieldRow>
          {clip.gradient && (
            <>
              <ColorField label="From" value={clip.gradient.from} onChange={(v) => v && patch({ gradient: { ...clip.gradient!, from: v } })} />
              <ColorField label="To" value={clip.gradient.to} onChange={(v) => v && patch({ gradient: { ...clip.gradient!, to: v } })} />
              <NumberField
                label="Angle (°)"
                value={clip.gradient.angleDeg}
                min={-360}
                max={360}
                step={5}
                onChange={(v) => patch({ gradient: { ...clip.gradient!, angleDeg: v } })}
              />
            </>
          )}
        </PropertyCard>

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
            layoutId="text-case-pills"
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
            layoutId="text-entrance-pills"
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
            layoutId="text-loop-pills"
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
            layoutId="text-exit-pills"
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

  if (activeTab === "ai") {
    return (
      <div className="flex flex-col gap-3 p-3">
        <PropertyCard title="AI Tools" collapsible={false}>
          <div className="flex flex-col gap-1.5">
            {AI_STUBS.map((label) => (
              <Tooltip key={label} content="Coming soon" side="top">
                <Button variant="subtle" size="sm" disabled className="justify-start">
                  {label}
                </Button>
              </Tooltip>
            ))}
          </div>
        </PropertyCard>
      </div>
    );
  }

  // activeTab === "basic"
  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertyCard title="Text" collapsible={false}>
        <LexicalTextEditor clip={clip} />
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
        <PillGroup
          layoutId="text-align-pills"
          value={clip.align}
          onChange={(v) => patch({ align: v })}
          options={[
            { key: "left", label: "Left" },
            { key: "center", label: "Center" },
            { key: "right", label: "Right" },
          ]}
        />
      </PropertyCard>
      <PropertyCard title="Timing">
        <NumberField label="Start (s)" value={clip.timelineStart} min={0} step={0.1} onChange={(v) => patch({ timelineStart: v })} />
        <NumberField label="Duration (s)" value={clip.duration} min={0.05} step={0.1} onChange={(v) => patch({ duration: v })} />
      </PropertyCard>
    </div>
  );
}
