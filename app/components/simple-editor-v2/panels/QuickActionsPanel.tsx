"use client";

import { useState } from "react";
import { useSimpleEditorStore } from "../store/simpleEditorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

interface Action {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const ACTIONS: Action[] = [
  { id: "make-viral",   label: "Make Viral",        icon: "⚡", color: "#7C3AED", description: "Auto-edit for maximum engagement" },
  { id: "captions",     label: "Add Captions",       icon: "✦", color: "#2563eb", description: "AI captions with word highlights" },
  { id: "clean-audio",  label: "Clean Audio",        icon: "🎙", color: "#059669", description: "Normalize & remove background noise" },
  { id: "auto-zoom",    label: "Auto Zoom",          icon: "🔍", color: "#d97706", description: "Dynamic zoom cuts on key moments" },
  { id: "reframe",      label: "Auto Reframe",       icon: "⬛", color: "#db2777", description: "Convert 16:9 → 9:16 smart crop" },
  { id: "thumbnail",    label: "Gen Thumbnail",      icon: "🖼", color: "#7c3aed", description: "AI-generated eye-catching thumbnail" },
  { id: "title",        label: "Gen Title",          icon: "✍", color: "#0891b2", description: "Viral title suggestions" },
  { id: "hashtags",     label: "Gen Hashtags",       icon: "#",  color: "#65a30d", description: "Trending hashtags for your niche" },
];

export default function QuickActionsPanel({ onExport }: { onExport: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; text: string } | null>(null);

  const videoUrl         = useSimpleEditorStore(s => s.videoUrl);
  const projectId        = useSimpleEditorStore(s => s.projectId);
  const setCaptionsEnabled = useSimpleEditorStore(s => s.setCaptionsEnabled);
  const setCaptionStyle  = useSimpleEditorStore(s => s.setCaptionStyle);
  const setExporting     = useSimpleEditorStore(s => s.setExporting);
  const setExportResult  = useSimpleEditorStore(s => s.setExportResult);
  const trimStart        = useSimpleEditorStore(s => s.trimStart);
  const trimEnd          = useSimpleEditorStore(s => s.trimEnd);
  const captions         = useSimpleEditorStore(s => s.captions);
  const captionStyleIndex = useSimpleEditorStore(s => s.captionStyleIndex);

  async function handleAction(action: Action) {
    if (busy) return;
    setBusy(action.id);
    setResult(null);

    try {
      switch (action.id) {
        case "make-viral":
          setCaptionsEnabled(true);
          setCaptionStyle(0);
          await triggerRender();
          break;

        case "captions":
          setCaptionsEnabled(true);
          break;

        case "clean-audio":
        case "auto-zoom":
        case "reframe":
          await triggerRender();
          break;

        case "thumbnail":
        case "title":
        case "hashtags": {
          const res = await fetch("/api/editor/ai-copilot", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
            body: JSON.stringify({
              command: action.id === "thumbnail"
                ? "Suggest a viral thumbnail concept for this video in one sentence."
                : action.id === "title"
                  ? "Write 3 viral title options for this video, separated by newlines."
                  : "List 10 trending hashtags for this video, space-separated.",
              doc: { videoUrl, projectId },
            }),
          });
          const data = await res.json();
          setResult({ id: action.id, text: data.message ?? "Done!" });
          break;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function triggerRender() {
    if (!projectId || !videoUrl) return;
    setExporting(true);
    const doc = {
      _v: 1,
      videoUrl,
      durationSec: trimEnd,
      aspect: "9:16",
      trimStart,
      trimEnd,
      captions: { enabled: true, styleIndex: captionStyleIndex, mode: "oneword", segments: captions },
      textOverlays: [],
      imageOverlays: [],
    };
    const res = await fetch("/api/editor/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ projectId, doc, tool: "simple-editor" }),
    });
    const data = await res.json();
    if (data.projectId) {
      pollExport(data.projectId);
    } else {
      setExportResult(null, null);
    }
  }

  function pollExport(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${jobId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        const { project } = await res.json();
        if (project?.status === "completed") {
          clearInterval(interval);
          setExportResult(jobId, project.videoUrl ?? null);
        } else if (project?.status === "failed") {
          clearInterval(interval);
          setExportResult(null, null);
        }
      } catch { clearInterval(interval); }
    }, 3000);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "#6b7280" }}>
        Quick Actions
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            disabled={!!busy}
            title={action.description}
            className="flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-all group"
            style={{
              background: "#111118",
              border: "1px solid rgba(255,255,255,0.06)",
              opacity: busy && busy !== action.id ? 0.5 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
            onMouseEnter={e => {
              if (!busy) (e.currentTarget as HTMLElement).style.borderColor = action.color + "55";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: action.color + "22", color: action.color }}
              >
                {busy === action.id ? (
                  <div
                    className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: action.color, borderTopColor: "transparent" }}
                  />
                ) : action.icon}
              </div>
            </div>
            <span className="text-xs font-semibold leading-tight" style={{ color: "#e5e7eb" }}>
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Export button */}
      <button
        onClick={onExport}
        className="w-full rounded-xl py-3 text-sm font-bold transition-all mt-1"
        style={{ background: "#7C3AED", color: "white" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#6d28d9"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#7C3AED"; }}
      >
        Export Reel →
      </button>

      {/* Generated result */}
      {result && (
        <div
          className="rounded-xl p-3 text-xs leading-relaxed"
          style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#c4b5fd" }}
        >
          <button
            onClick={() => setResult(null)}
            className="float-right text-xs opacity-50 hover:opacity-100 ml-2"
            style={{ color: "#9ca3af" }}
          >
            ✕
          </button>
          <pre className="whitespace-pre-wrap font-sans">{result.text}</pre>
        </div>
      )}
    </div>
  );
}
