import { create } from "zustand";

// Lightweight store for transient editor UI overlays (command palette, shortcut
// legend). Kept separate from the document store so opening an overlay never
// touches undo/redo history.
interface UIState {
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  toggleCommandPalette: () => void;
  toggleShortcuts: () => void;
}

export const useEditorUIStore = create<UIState>((set) => ({
  commandPaletteOpen: false,
  shortcutsOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
}));
