"use client";

// Drop-in "Choose from Assets" trigger — place next to a feature's existing
// upload control (drag-drop zone, file input) to let the user reuse an asset
// instead of uploading it again. Does not replace the existing upload UI;
// each feature keeps its own "Upload new" flow exactly as it works today.

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { AssetPicker } from "./AssetPicker";
import type { PickerAsset, PickerKind } from "./assetPickerData";

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <rect x="3" y="4" width="18" height="16" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 4v16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface AssetFieldProps {
  /** Media kinds this call site can use — e.g. ["video"], ["image"], ["video","audio"]. */
  accept: PickerKind[];
  onSelect: (asset: PickerAsset) => void;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "inverse" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AssetField({ accept, onSelect, label = "Choose from Assets", variant = "secondary", size = "sm", className }: AssetFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={<LibraryIcon />} onClick={() => setOpen(true)} className={className}>
        {label}
      </Button>
      <AssetPicker
        open={open}
        onClose={() => setOpen(false)}
        accept={accept}
        onSelect={(asset) => { onSelect(asset); setOpen(false); }}
      />
    </>
  );
}
