"use client";

import { create } from "zustand";
import type { WordTiming } from "@/lib/editor-types";

export interface AISuggestion {
  id: string;
  icon: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export type AnalysisStep = "idle" | "uploading" | "transcribing" | "analyzing" | "done";

interface SimpleEditorState {
  // Video
  videoUrl: string;
  videoS3Key: string;
  videoDuration: number;

  // Project
  projectId: string;
  projectTitle: string;

  // Analysis
  analysisStep: AnalysisStep;

  // Reel scores (0–100)
  reelScore: number;
  hookScore: number;
  captionScore: number;
  audioScore: number;
  engagementScore: number;
  visualScore: number;

  // AI content
  suggestions: AISuggestion[];
  appliedSuggestions: string[];
  captions: WordTiming[];

  // Editor state
  captionStyleIndex: number;
  captionsEnabled: boolean;
  trimStart: number;
  trimEnd: number;

  // Export
  exporting: boolean;
  exportUrl: string | null;
  exportJobId: string | null;

  // Actions
  setVideo: (url: string, key: string, duration: number) => void;
  setProject: (id: string, title: string) => void;
  setAnalysisStep: (step: AnalysisStep) => void;
  setAnalysisResults: (data: {
    captions: WordTiming[];
    reelScore: number;
    hookScore: number;
    captionScore: number;
    audioScore: number;
    engagementScore: number;
    visualScore: number;
    suggestions: AISuggestion[];
  }) => void;
  setCaptionStyle: (index: number) => void;
  setCaptionsEnabled: (v: boolean) => void;
  setTrim: (start: number, end: number) => void;
  applySuggestion: (id: string) => void;
  setExporting: (v: boolean) => void;
  setExportResult: (jobId: string | null, url: string | null) => void;
  reset: () => void;
}

const DEFAULT_SUGGESTIONS: AISuggestion[] = [
  { id: "captions",   icon: "✦", title: "Add captions",          description: "Captions can increase engagement by 40%",     impact: "high" },
  { id: "silence",    icon: "✂", title: "Remove silence",         description: "14 seconds of dead air detected",              impact: "high" },
  { id: "hook",       icon: "⚡", title: "Improve hook",           description: "First 3 seconds need more energy",             impact: "high" },
  { id: "zoom",       icon: "🔍", title: "Add auto-zoom effects",  description: "Zoom cuts increase watch time",                impact: "medium" },
  { id: "thumbnail",  icon: "🖼", title: "Generate thumbnail",     description: "Eye-catching thumbnail boosts click-through",  impact: "medium" },
];

export const useSimpleEditorStore = create<SimpleEditorState>((set) => ({
  videoUrl: "",
  videoS3Key: "",
  videoDuration: 0,

  projectId: "",
  projectTitle: "Untitled Reel",

  analysisStep: "idle",

  reelScore: 0,
  hookScore: 0,
  captionScore: 0,
  audioScore: 0,
  engagementScore: 0,
  visualScore: 0,

  suggestions: DEFAULT_SUGGESTIONS,
  appliedSuggestions: [],
  captions: [],

  captionStyleIndex: 0,
  captionsEnabled: false,
  trimStart: 0,
  trimEnd: 0,

  exporting: false,
  exportUrl: null,
  exportJobId: null,

  setVideo: (url, key, duration) => set({ videoUrl: url, videoS3Key: key, videoDuration: duration, trimStart: 0, trimEnd: duration }),
  setProject: (id, title) => set({ projectId: id, projectTitle: title }),
  setAnalysisStep: (step) => set({ analysisStep: step }),
  setAnalysisResults: (data) => set({ ...data, analysisStep: "done" }),
  setCaptionStyle: (index) => set({ captionStyleIndex: index, captionsEnabled: true }),
  setCaptionsEnabled: (v) => set({ captionsEnabled: v }),
  setTrim: (start, end) => set({ trimStart: start, trimEnd: end }),
  applySuggestion: (id) => set((s) => ({ appliedSuggestions: [...s.appliedSuggestions, id] })),
  setExporting: (v) => set({ exporting: v }),
  setExportResult: (jobId, url) => set({ exportJobId: jobId, exportUrl: url, exporting: false }),
  reset: () => set({
    videoUrl: "", videoS3Key: "", videoDuration: 0,
    projectId: "", projectTitle: "Untitled Reel",
    analysisStep: "idle",
    reelScore: 0, hookScore: 0, captionScore: 0, audioScore: 0, engagementScore: 0, visualScore: 0,
    suggestions: DEFAULT_SUGGESTIONS, appliedSuggestions: [], captions: [],
    captionStyleIndex: 0, captionsEnabled: false, trimStart: 0, trimEnd: 0,
    exporting: false, exportUrl: null, exportJobId: null,
  }),
}));
