"use client";

// Elements › Shapes: pick a fill colour, click a shape, and it lands at the
// playhead as an image overlay (drawn + uploaded by shapes.ts). Each
// shape+colour pair is uploaded once per session and reused after that, so
// adding the same arrow five times doesn't fill the library with copies.

import React, { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { registerAsset, type AssetRow } from "./shared/assetData";
import { clientAuthToken } from "@/lib/client-session";
import { SHAPES, SHAPE_COLORS, renderShapePng, type ShapeDef } from "./shapes";
import { showPanelToast } from "../ui";
import { playUiSound } from "../../hooks/useUiSound";

const uploaded = new Map<string, AssetRow>();

async function uploadShape(shape: ShapeDef, color: string): Promise<AssetRow> {
  const key = `${shape.id}:${color}`;
  const hit = uploaded.get(key);
  if (hit) return hit;
  const form = new FormData();
  form.append("file", await renderShapePng(shape, color));
  const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${clientAuthToken()}` }, body: form });
  const data = (await res.json().catch(() => ({}))) as { asset?: AssetRow; error?: string };
  if (!res.ok || !data.asset) throw new Error(data.error ?? "Upload failed");
  registerAsset(data.asset);
  uploaded.set(key, data.asset);
  return data.asset;
}

/** Inline preview of a shape, drawn with the same canvas routine as the export PNG. */
function ShapePreview({ shape, color }: { shape: ShapeDef; color: string }) {
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      shape.draw(ctx, canvas.width, canvas.height, color);
    },
    [shape, color],
  );
  return <canvas ref={draw} width={shape.w} height={shape.h} aria-hidden="true" className="max-h-[62%] max-w-[72%] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />;
}

export default function ShapesPanel() {
  const addImageClip = useEditorStore((s) => s.addImageClip);
  const [color, setColor] = useState(SHAPE_COLORS[0].hex);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (shape: ShapeDef) => {
    setBusy(shape.id);
    setError(null);
    try {
      const asset = await uploadShape(shape, color);
      addImageClip({
        type: "image",
        id: crypto.randomUUID(),
        assetId: asset.id,
        timelineStart: useEditorStore.getState().currentTime,
        duration: 4,
        x: 0.5,
        y: 0.5,
        scalePct: shape.scalePct,
        opacity: 1,
      });
      playUiSound("pop");
      showPanelToast(`${shape.label} added at the playhead`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that shape");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="editor-stagger flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <p className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-editor-text-muted">Fill</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shape colour">
          {SHAPE_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={color === c.hex}
              aria-label={c.label}
              onClick={() => {
                setColor(c.hex);
                playUiSound("chip");
              }}
              className={`h-7 w-7 rounded-full border-2 border-editor-bg transition-transform ${color === c.hex ? "scale-110 ring-2 ring-editor-accent" : "ring-1 ring-editor-border-strong hover:scale-110"}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>
      <div className="editor-stagger-grid grid grid-cols-3 gap-2">
        {SHAPES.map((shape) => (
          <button
            key={shape.id}
            type="button"
            onClick={() => void add(shape)}
            disabled={busy !== null}
            aria-label={`Add ${shape.label.toLowerCase()}`}
            className="editor-tile group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-editor-md border border-editor-border bg-editor-card hover:border-editor-accent/50 disabled:cursor-wait"
          >
            {busy === shape.id ? <Loader2 className="h-5 w-5 animate-spin text-editor-accent" /> : <ShapePreview shape={shape} color={color} />}
            <span className="absolute inset-x-1 bottom-1 truncate text-center text-[10px] font-medium text-editor-text-muted">{shape.label}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <p className="px-0.5 text-[10.5px] leading-snug text-editor-text-faint">Shapes go on the image track. Drag, resize and fade them like any overlay.</p>
    </div>
  );
}
