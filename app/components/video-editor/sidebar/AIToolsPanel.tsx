"use client";

import { useEditorStore } from "../store/editorStore";
import DubbingPanel from "../ai/DubbingPanel";

const AI_TOOLS = [
  {
    id: "captions",
    label: "Auto Captions",
    description: "Generate word-level captions with Whisper",
    icon: "💬",
    color: "#335cff",
    action: "captions",
  },
  {
    id: "optimize",
    label: "Reels Optimizer",
    description: "Viral score + suggestions",
    icon: "🚀",
    color: "#f59e0b",
    action: "optimize",
  },
  {
    id: "copilot",
    label: "AI Copilot",
    description: "Type editing commands in plain English",
    icon: "🤖",
    color: "#15a66b",
    action: "copilot",
  },
  {
    id: "auto-edit",
    label: "Auto Edit",
    description: "AI-suggested cuts, pacing, and text improvements",
    icon: "✂️",
    color: "#3b82f6",
    action: "auto-edit",
  },
  {
    id: "reframe",
    label: "Smart Reframe",
    description: "Convert to a different aspect ratio with auto-crop",
    icon: "🔲",
    color: "#ec4899",
    action: "reframe",
  },
];

export default function AIToolsPanel() {
  const setCaptionStudioOpen = useEditorStore(s => s.setCaptionStudioOpen);
  const setReelsOptimizerOpen = useEditorStore(s => s.setReelsOptimizerOpen);
  const setAICopilotOpen = useEditorStore(s => s.setAICopilotOpen);
  const setAutoEditOpen = useEditorStore(s => s.setAutoEditOpen);
  const setSmartReframeOpen = useEditorStore(s => s.setSmartReframeOpen);

  function handleTool(action: string) {
    if (action === "captions") setCaptionStudioOpen(true);
    else if (action === "optimize") setReelsOptimizerOpen(true);
    else if (action === "copilot") setAICopilotOpen(true);
    else if (action === "auto-edit") setAutoEditOpen(true);
    else if (action === "reframe") setSmartReframeOpen(true);
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="rounded-lg px-3 py-2.5" style={{ background: "linear-gradient(135deg,#eef1ff,#e8edff)", border: "1px solid #c7d2fe" }}>
        <p className="text-xs font-semibold" style={{ color: "#335cff" }}>✨ AI-Powered Editing</p>
        <p className="text-xs mt-0.5" style={{ color: "#335cff" }}>All tools are powered by Gemini + Whisper</p>
      </div>
      {AI_TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => handleTool(tool.action)}
          className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all"
          style={{ background: "#e4e7ec", border: "1px solid #e4e7ec" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "#d3d8e0")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "#e4e7ec")}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: `${tool.color}22` }}
          >
            {tool.icon}
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: "#15181f" }}>{tool.label}</p>
            <p className="text-xs mt-0.5" style={{ color: "#98a0ae" }}>{tool.description}</p>
          </div>
        </button>
      ))}

      {/* AI Dubbing & translation */}
      <DubbingPanel />
    </div>
  );
}
