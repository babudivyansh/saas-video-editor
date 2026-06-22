"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSimpleEditorStore } from "./store/simpleEditorStore";
import AnalyzingScreen from "./AnalyzingScreen";
import VideoPreviewPanel from "./panels/VideoPreviewPanel";
import ReelScoreCard from "./panels/ReelScoreCard";
import AISuggestionsPanel from "./panels/AISuggestionsPanel";
import QuickActionsPanel from "./panels/QuickActionsPanel";
import CaptionStylePicker from "./panels/CaptionStylePicker";
import AIChatPanel from "./panels/AIChatPanel";
import SimpleTimeline from "./panels/SimpleTimeline";
import ExportModal from "./ExportModal";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

interface Props {
  projectId: string;
}

export default function SimpleEditorWorkspace({ projectId }: Props) {
  const [showExport, setShowExport] = useState(false);
  const [rightTab, setRightTab]     = useState<"score" | "actions" | "captions">("score");
  const [leftTab,  setLeftTab]      = useState<"suggestions" | "chat">("suggestions");

  const analysisStep       = useSimpleEditorStore(s => s.analysisStep);
  const videoUrl           = useSimpleEditorStore(s => s.videoUrl);
  const projectTitle       = useSimpleEditorStore(s => s.projectTitle);
  const reelScore          = useSimpleEditorStore(s => s.reelScore);
  const setProject         = useSimpleEditorStore(s => s.setProject);
  const setAnalysisStep    = useSimpleEditorStore(s => s.setAnalysisStep);
  const setAnalysisResults = useSimpleEditorStore(s => s.setAnalysisResults);
  const setVideo           = useSimpleEditorStore(s => s.setVideo);
  const setTrim            = useSimpleEditorStore(s => s.setTrim);

  // On mount: load project from API then trigger analysis
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function bootstrap() {
      // Fetch project
      const pRes = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const { project } = await pRes.json();
      if (!project || cancelled) return;

      const url: string = project.uploadedVideoUrl ?? project.videoUrl ?? "";
      const duration = 30; // will be refined by video element
      setProject(project.id, project.title ?? "Untitled Reel");
      if (url) {
        setVideo(url, "", duration);
        setTrim(0, duration);
      }

      // If we already have a videoUrl in the store (set during upload step), use that
      const storeUrl = useSimpleEditorStore.getState().videoUrl || url;
      if (!storeUrl) return;

      // Trigger AI analysis
      setAnalysisStep("transcribing");
      try {
        const aRes = await fetch("/api/simple-editor/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ videoUrl: storeUrl, projectId }),
        });
        if (cancelled) return;
        setAnalysisStep("analyzing");
        const data = await aRes.json();
        if (!cancelled) {
          setAnalysisResults({
            captions:        data.captions        ?? [],
            reelScore:       data.reelScore        ?? 62,
            hookScore:       data.hookScore        ?? 58,
            captionScore:    data.captionScore     ?? 0,
            audioScore:      data.audioScore       ?? 70,
            engagementScore: data.engagementScore  ?? 55,
            visualScore:     data.visualScore      ?? 65,
            suggestions:     data.suggestions      ?? [],
          });
        }
      } catch {
        if (!cancelled) setAnalysisStep("done");
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Show analyzing screen until done
  if (analysisStep !== "done") return <AnalyzingScreen />;

  const scoreColor = reelScore >= 75 ? "#22c55e" : reelScore >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0A0A0F" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: 52, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0d0d10" }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: "#6b7280" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </Link>
          <span style={{ color: "#27272a" }}>|</span>
          <span className="text-sm font-medium text-white truncate max-w-48">{projectTitle}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Reel score badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}44` }}
          >
            ⚡ {reelScore} Reel Score
          </div>

          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "#7C3AED" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#6d28d9"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#7C3AED"; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
              <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Suggestions + Chat */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{ width: 290, borderRight: "1px solid rgba(255,255,255,0.05)", background: "#0d0d10" }}
        >
          {/* Tab switcher */}
          <div className="flex flex-shrink-0 px-3 pt-3 gap-1">
            {(["suggestions", "chat"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  background: leftTab === tab ? "rgba(124,58,237,0.15)" : "transparent",
                  color: leftTab === tab ? "#c4b5fd" : "#4b5563",
                  border: leftTab === tab ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent",
                }}
              >
                {tab === "suggestions" ? "AI Suggestions" : "AI Chat"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {leftTab === "suggestions" ? <AISuggestionsPanel /> : <AIChatPanel />}
          </div>
        </div>

        {/* CENTER: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
            <VideoPreviewPanel />
            <SimpleTimeline />
          </div>
        </div>

        {/* RIGHT: Score / Actions / Captions */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{ width: 320, borderLeft: "1px solid rgba(255,255,255,0.05)", background: "#0d0d10" }}
        >
          {/* Tab switcher */}
          <div className="flex flex-shrink-0 px-3 pt-3 gap-1">
            {(["score", "actions", "captions"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  background: rightTab === tab ? "rgba(124,58,237,0.15)" : "transparent",
                  color: rightTab === tab ? "#c4b5fd" : "#4b5563",
                  border: rightTab === tab ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent",
                }}
              >
                {tab === "score" ? "Score" : tab === "actions" ? "Actions" : "Captions"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {rightTab === "score"   && <ReelScoreCard />}
            {rightTab === "actions" && <QuickActionsPanel onExport={() => setShowExport(true)} />}
            {rightTab === "captions" && <CaptionStylePicker />}
          </div>
        </div>
      </div>

      {/* Export modal */}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}
