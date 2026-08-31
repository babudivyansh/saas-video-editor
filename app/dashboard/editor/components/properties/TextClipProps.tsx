"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useEditorStore } from "../../store/editorStore";
import { useAuth } from "@/app/components/AuthContext";
import type { FontFamily, TextClip, TextEntrancePreset, TextLoopPreset, TextExitPreset } from "@/lib/editor/types";
import { FONT_WHITELIST, TEXT_ENTRANCE_PRESETS, TEXT_LOOP_PRESETS, TEXT_EXIT_PRESETS } from "@/lib/editor/types";
import { addEmojisToText, autoLineBreaks, removeFillerWords, type AiTextLlmOperation } from "@/lib/editor/ai-text";
import { DUB_LANGUAGES } from "@/lib/languages";
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
} from "../ui";
// Pulls in the full Lexical library, which loaded into the editor's initial
// bundle for every selection — text clip or not — since this was a static
// import. Only actually renders when a text clip's properties are shown.
const LexicalTextEditor = dynamic(() => import("./text/LexicalTextEditor"), {
  ssr: false,
  loading: () => <div className="h-24 animate-pulse rounded-editor-md bg-editor-card" />,
});

const AI_LLM_TOOLS: { label: string; operation: AiTextLlmOperation }[] = [
  { label: "Rewrite this text", operation: "rewrite" },
  { label: "Fix grammar", operation: "grammar" },
  { label: "Shorten", operation: "shorten" },
  { label: "Expand", operation: "expand" },
];
const AI_FREE_TOOLS: { label: string; run: (text: string) => string }[] = [
  { label: "Add emojis", run: addEmojisToText },
  { label: "Auto line breaks", run: autoLineBreaks },
  { label: "Remove filler words", run: removeFillerWords },
];

export default function TextClipProps({ clip, activeTab }: { clip: TextClip; activeTab: string }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const patch = (p: Partial<TextClip>, undoable = true) => updateClip("text", clip.id, p, undoable);
  const { user, refreshUser } = useAuth();
  const [aiWorking, setAiWorking] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState(DUB_LANGUAGES[0]?.label ?? "Spanish");

  // Text clips have no richText yet if never opened in the rich editor
  // (`richText` undefined = legacy/plain-text clip, per its own doc comment);
  // once set, `text` is meant to stay auto-synced FROM richText, never
  // hand-edited on its own. An AI edit replaces the wording outright, so it
  // clears richText along with it rather than leaving a stale rich doc the
  // plain `text` no longer matches — this drops any per-run formatting
  // (mixed bold/color within the string) on that clip, which is an honest,
  // acceptable trade for a rewrite the user explicitly asked for.
  async function runLlmOp(operation: AiTextLlmOperation) {
    if (aiWorking) return;
    const CREDIT_COST = 1;
    if ((user?.credits ?? 0) < CREDIT_COST) {
      setAiError(`Not enough credits (${CREDIT_COST} needed).`);
      return;
    }
    setAiWorking(operation);
    setAiError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/editor/ai-text", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ operation, text: clip.text, targetLang: operation === "translate" ? targetLang : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI Tools request failed");
      patch({ text: data.result, richText: undefined });
      refreshUser();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI Tools request failed");
    } finally {
      setAiWorking(null);
    }
  }

  function runFreeOp(label: string, run: (text: string) => string) {
    setAiError(null);
    const result = run(clip.text);
    if (!result.trim()) {
      setAiError(`${label} left nothing behind — not applied.`);
      return;
    }
    patch({ text: result, richText: undefined });
  }

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
            {AI_LLM_TOOLS.map(({ label, operation }) => (
              <Button
                key={operation}
                variant="subtle"
                size="sm"
                disabled={!!aiWorking}
                className="justify-start"
                onClick={() => runLlmOp(operation)}
              >
                {aiWorking === operation ? "Working…" : `${label} (1 credit)`}
              </Button>
            ))}
            <div className="flex gap-1.5 items-center">
              <Button
                variant="subtle"
                size="sm"
                disabled={!!aiWorking}
                className="justify-start flex-1"
                onClick={() => runLlmOp("translate")}
              >
                {aiWorking === "translate" ? "Working…" : "Translate (1 credit)"}
              </Button>
              <SelectField label="" value={targetLang} options={DUB_LANGUAGES.map((l) => l.label)} onChange={setTargetLang} />
            </div>
            {AI_FREE_TOOLS.map(({ label, run }) => (
              <Button key={label} variant="subtle" size="sm" className="justify-start" onClick={() => runFreeOp(label, run)}>
                {label} (free)
              </Button>
            ))}
          </div>
          {aiError && <p className="text-xs text-red-400 mt-1.5">{aiError}</p>}
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
