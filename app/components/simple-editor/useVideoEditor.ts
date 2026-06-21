"use client";

import { useState, useCallback, useEffect } from "react";
import type { EditorState, VideoFile, TrimRange, CropSettings, TextOverlay, Caption } from "./types";

const MAX_HISTORY = 50;

const DEFAULT_STATE: EditorState = {
  video: null,
  trim: { start: 0, end: 0 },
  crop: null,
  textOverlays: [],
  captions: [],
  volume: 1,
  speed: 1,
  rotation: 0,
  activeToolPanel: null,
  projectName: "Untitled project",
};

export function useVideoEditor() {
  const [history, setHistory] = useState<{ state: EditorState; label: string }[]>([
    { state: DEFAULT_STATE, label: "Initial" },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const state = history[historyIndex].state;

  const pushState = useCallback((newState: EditorState, label: string) => {
    setHistory(prev => {
      // Truncate forward history, cap total
      const base = prev.slice(0, prev.length > MAX_HISTORY ? prev.length - MAX_HISTORY : undefined);
      // Remove everything after current index
      const truncated = base.slice(0, historyIndex + 1);
      return [...truncated, { state: newState, label }];
    });
    setHistoryIndex(i => Math.min(i + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback(() => {
    setHistoryIndex(i => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      setHistoryIndex(i => Math.min(h.length - 1, i + 1));
      return h;
    });
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Global Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Typed updaters — each pushes a named history entry
  const setVideo = useCallback((video: VideoFile) => {
    pushState({ ...DEFAULT_STATE, video, trim: { start: 0, end: video.duration }, projectName: state.projectName }, "Video loaded");
  }, [pushState, state.projectName]);

  const setTrim = useCallback((trim: TrimRange) => {
    pushState({ ...state, trim }, "Trim adjusted");
  }, [pushState, state]);

  const setCrop = useCallback((crop: CropSettings | null) => {
    pushState({ ...state, crop }, crop ? "Crop applied" : "Crop removed");
  }, [pushState, state]);

  const setVolume = useCallback((volume: number) => {
    pushState({ ...state, volume }, "Volume adjusted");
  }, [pushState, state]);

  const setSpeed = useCallback((speed: number) => {
    pushState({ ...state, speed }, "Speed changed");
  }, [pushState, state]);

  const setRotation = useCallback((rotation: 0 | 90 | 180 | 270) => {
    pushState({ ...state, rotation }, "Rotated");
  }, [pushState, state]);

  const addTextOverlay = useCallback((overlay: TextOverlay) => {
    pushState({ ...state, textOverlays: [...state.textOverlays, overlay] }, "Text added");
  }, [pushState, state]);

  const updateTextOverlay = useCallback((overlay: TextOverlay) => {
    pushState({ ...state, textOverlays: state.textOverlays.map(o => o.id === overlay.id ? overlay : o) }, "Text edited");
  }, [pushState, state]);

  const removeTextOverlay = useCallback((id: string) => {
    pushState({ ...state, textOverlays: state.textOverlays.filter(o => o.id !== id) }, "Text removed");
  }, [pushState, state]);

  const setCaptions = useCallback((captions: Caption[]) => {
    pushState({ ...state, captions }, "Captions updated");
  }, [pushState, state]);

  const addCaption = useCallback((caption: Caption) => {
    const sorted = [...state.captions, caption].sort((a, b) => a.startTime - b.startTime);
    pushState({ ...state, captions: sorted }, "Caption added");
  }, [pushState, state]);

  const updateCaption = useCallback((caption: Caption) => {
    pushState({ ...state, captions: state.captions.map(c => c.id === caption.id ? caption : c) }, "Caption edited");
  }, [pushState, state]);

  const removeCaption = useCallback((id: string) => {
    pushState({ ...state, captions: state.captions.filter(c => c.id !== id) }, "Caption removed");
  }, [pushState, state]);

  const setActiveToolPanel = useCallback((panel: string | null) => {
    // Panel toggling doesn't go into history
    setHistory(h => {
      const copy = [...h];
      copy[historyIndex] = { ...copy[historyIndex], state: { ...copy[historyIndex].state, activeToolPanel: panel } };
      return copy;
    });
  }, [historyIndex]);

  const setProjectName = useCallback((name: string) => {
    // Name change doesn't go into undo history
    setHistory(h => {
      const copy = [...h];
      copy[historyIndex] = { ...copy[historyIndex], state: { ...copy[historyIndex].state, projectName: name } };
      return copy;
    });
  }, [historyIndex]);

  return {
    state,
    canUndo, canRedo, undo, redo,
    setVideo,
    setTrim,
    setCrop,
    setVolume,
    setSpeed,
    setRotation,
    addTextOverlay, updateTextOverlay, removeTextOverlay,
    setCaptions, addCaption, updateCaption, removeCaption,
    setActiveToolPanel,
    setProjectName,
  };
}
