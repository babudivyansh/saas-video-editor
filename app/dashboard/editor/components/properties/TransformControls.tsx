"use client";

// Shared Transform controls (editor Phase 1). `PlacementCard` is the main
// lane's scale + offset; `OrientationCard` is rotation, flip and opacity,
// used by video, overlay and image clips alike. Values left at their default
// are stored as undefined so untouched clips stay byte-identical.

import React from "react";
import { FlipHorizontal2, FlipVertical2, RotateCcw } from "lucide-react";
import type { ClipTransform } from "@/lib/editor/types";
import { TRANSFORM_LIMITS } from "@/lib/editor/types";
import { Button, PropertyCard, Slider } from "../ui";

type Orientation = Pick<ClipTransform, "rotationDeg" | "flipH" | "flipV" | "opacity">;

const orUndef = (v: number, neutral: number) => (Math.abs(v - neutral) < 1e-6 ? undefined : v);

export function PlacementCard({
  value,
  onChange,
}: {
  value: Pick<ClipTransform, "scale" | "offsetX" | "offsetY">;
  onChange: (p: Pick<ClipTransform, "scale" | "offsetX" | "offsetY">) => void;
}) {
  const changed = value.scale !== undefined || !!value.offsetX || !!value.offsetY;
  return (
    <PropertyCard
      title="Position & size"
      collapsible={false}
      trailing={
        changed ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ scale: undefined, offsetX: undefined, offsetY: undefined })}>
            Reset
          </Button>
        ) : undefined
      }
    >
      <Slider
        label="Scale"
        value={value.scale ?? 1}
        min={TRANSFORM_LIMITS.scale[0]}
        max={TRANSFORM_LIMITS.scale[1]}
        step={0.01}
        onChange={(v) => onChange({ ...value, scale: orUndef(v, 1) })}
      />
      <Slider label="Left ↔ right" value={value.offsetX ?? 0} min={-1} max={1} step={0.01} onChange={(v) => onChange({ ...value, offsetX: orUndef(v, 0) })} />
      <Slider label="Up ↕ down" value={value.offsetY ?? 0} min={-1} max={1} step={0.01} onChange={(v) => onChange({ ...value, offsetY: orUndef(v, 0) })} />
    </PropertyCard>
  );
}

export function OrientationCard({
  value,
  onChange,
  showOpacity = true,
}: {
  value: Orientation;
  onChange: (p: Orientation) => void;
  showOpacity?: boolean;
}) {
  return (
    <PropertyCard title="Rotate & flip" collapsible={false}>
      <Slider
        label="Rotation (°)"
        value={value.rotationDeg ?? 0}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => onChange({ ...value, rotationDeg: orUndef(Math.round(v), 0) })}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button variant={value.flipH ? "primary" : "subtle"} size="sm" onClick={() => onChange({ ...value, flipH: value.flipH ? undefined : true })}>
          <FlipHorizontal2 className="h-3.5 w-3.5" /> Flip horizontal
        </Button>
        <Button variant={value.flipV ? "primary" : "subtle"} size="sm" onClick={() => onChange({ ...value, flipV: value.flipV ? undefined : true })}>
          <FlipVertical2 className="h-3.5 w-3.5" /> Flip vertical
        </Button>
        {(value.rotationDeg || value.flipH || value.flipV) && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, rotationDeg: undefined, flipH: undefined, flipV: undefined })}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>
      {showOpacity && (
        <Slider label="Opacity" value={value.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => onChange({ ...value, opacity: orUndef(v, 1) })} />
      )}
    </PropertyCard>
  );
}
