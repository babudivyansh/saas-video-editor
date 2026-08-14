"use client";

// Headless open/close + promise-based pick() for call sites that want to
// trigger the picker imperatively (e.g. from inside an existing "Add media"
// menu) rather than rendering AssetField's own trigger button.

import { useCallback, useRef, useState } from "react";
import type { PickerAsset, PickerKind } from "./assetPickerData";

interface PickerState {
  open: boolean;
  accept: PickerKind[];
}

export function useAssetPicker() {
  const [state, setState] = useState<PickerState>({ open: false, accept: ["all"] });
  const resolveRef = useRef<((asset: PickerAsset | null) => void) | null>(null);

  const pick = useCallback((accept: PickerKind[] = ["all"]): Promise<PickerAsset | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, accept });
    });
  }, []);

  const handleSelect = useCallback((asset: PickerAsset) => {
    resolveRef.current?.(asset);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const handleClose = useCallback(() => {
    resolveRef.current?.(null);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  return {
    pickerProps: { open: state.open, accept: state.accept, onSelect: handleSelect, onClose: handleClose },
    pick,
  };
}
