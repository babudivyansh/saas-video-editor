"use client";

import { useState, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

const PLATFORM_PRESETS = [
  { id: "tiktok",     label: "TikTok",     icon: "🎵", aspect: "9:16", resolution: "1080p", format: "mp4" },
  { id: "instagram",  label: "Reels",      icon: "📸", aspect: "9:16", resolution: "1080p", format: "mp4" },
  { id: "yt-shorts",  label: "YT Shorts",  icon: "▶",  aspect: "9:16", resolution: "1080p", format: "mp4" },
  { id: "facebook",   label: "Facebook",   icon: "👥", aspect: "9:16", resolution: "1080p", format: "mp4" },
  { id: "youtube",    label: "YouTube",    icon: "🎬", aspect: "16:9", resolution: "1080p", format: "mp4" },
  { id: "custom",     label: "Custom",     icon: "⚙",  aspect: "",     resolution: "1080p", format: "mp4" },
];

const RESOLUTIONS = ["720p", "1080p", "1440p", "4K"];

type ExportStatus = "idle" | "rendering" | "done" | "failed";

export default function ExportModal() {
  const setExportModalOpen = useEditorStore(s => s.setExportModalOpen);
  const present = useEditorStore(s => s.present);
  const projectId = useEditorStore(s => s.projectId);

  const [selectedPreset, setSelectedPreset] = useState("instagram");
  const [resolution, setResolution] = useState("1080p");
  const [quality, setQuality] = useState("standard");
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [stage, setStage] = useState("queued");
  const [resultUrl, setResultUrl] = useState("");
  const [progress, setProgress] = useState(0);

  const startExport = useCallback(async () => {
    setStatus("rendering");
    setProgress(2);
    setStage("queued");

    try {
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          projectId: projectId || undefined,
          doc: present,
          tool: "advanced-editor",
          quality,
          resolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus("failed"); return; }

      const pid = data.projectId;

      // Poll the live render-status endpoint for real stage + percent.
      const poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/editor/render-status?projectId=${pid}`, {
            headers: { Authorization: `Bearer ${token()}` },
          });
          const d = await r.json();
          if (typeof d.percent === "number") setProgress(d.percent);
          if (d.stage) setStage(d.stage);
          if (d.status === "completed" && d.videoUrl) {
            clearInterval(poll);
            setResultUrl(d.videoUrl);
            setStatus("done");
            setProgress(100);
          } else if (d.status === "failed") {
            clearInterval(poll);
            setStatus("failed");
          }
        } catch {
          clearInterval(poll);
          setStatus("failed");
        }
      }, 2000);
    } catch {
      setStatus("failed");
    }
  }, [present, projectId, quality, resolution]);

  const STAGE_LABEL: Record<string, string> = {
    queued: "Queued…", downloading: "Preparing media…", rendering: "Rendering your video…",
    uploading: "Finalizing…", completed: "Done!", failed: "Failed",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="flex flex-col rounded-2xl shadow-2xl overflow-hidden" style={{ width: 500, maxHeight: "85vh", background: "#ffffff", border: "1px solid #e4e7ec" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #e4e7ec" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#15181f" }}>Export Video</h2>
            <p className="text-xs mt-0.5" style={{ color: "#98a0ae" }}>Choose your platform and quality</p>
          </div>
          <button onClick={() => setExportModalOpen(false)} style={{ color: "#5a6170" }} className="hover:text-gray-900 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {status === "idle" && (
            <>
              {/* Platform presets */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#98a0ae" }}>Platform</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORM_PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPreset(p.id)}
                      className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all"
                      style={{
                        background: selectedPreset === p.id ? "#e8edff" : "#f6f7f9",
                        border: `1px solid ${selectedPreset === p.id ? "#335cff" : "#e4e7ec"}`,
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{p.icon}</span>
                      <span className="text-xs font-medium" style={{ color: selectedPreset === p.id ? "#335cff" : "#5a6170" }}>{p.label}</span>
                      {p.aspect && <span className="text-xs" style={{ color: "#98a0ae", fontSize: 9 }}>{p.aspect} · {p.resolution}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#98a0ae" }}>Resolution</p>
                <div className="flex gap-2">
                  {RESOLUTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: resolution === r ? "#e8edff" : "#f6f7f9",
                        border: `1px solid ${resolution === r ? "#335cff" : "#e4e7ec"}`,
                        color: resolution === r ? "#335cff" : "#5a6170",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality tier */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#98a0ae" }}>Quality</p>
                <div className="flex gap-2">
                  {[
                    { id: "draft", label: "Draft", hint: "Fastest" },
                    { id: "standard", label: "Standard", hint: "Balanced" },
                    { id: "high", label: "High", hint: "Best" },
                  ].map(q => (
                    <button
                      key={q.id}
                      onClick={() => setQuality(q.id)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex flex-col items-center"
                      style={{
                        background: quality === q.id ? "#e8edff" : "#f6f7f9",
                        border: `1px solid ${quality === q.id ? "#335cff" : "#e4e7ec"}`,
                        color: quality === q.id ? "#335cff" : "#5a6170",
                      }}
                    >
                      {q.label}
                      <span style={{ fontSize: 9, color: "#98a0ae" }}>{q.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Rendering state */}
          {status === "rendering" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e4e7ec" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none" stroke="#335cff" strokeWidth="3"
                    strokeDasharray={`${progress * 0.942} 94.2`}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: "#15181f" }}>{progress}%</div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "#15181f" }}>{STAGE_LABEL[stage] ?? "Rendering your video…"}</p>
                <p className="text-xs mt-1" style={{ color: "#98a0ae" }}>This may take a few minutes. You can close this window.</p>
              </div>
            </div>
          )}

          {/* Done state */}
          {status === "done" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#d1fae5" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#15a66b" strokeWidth={2.5} className="w-8 h-8">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#15181f" }}>Export complete!</p>
                <p className="text-xs mt-1" style={{ color: "#98a0ae" }}>Your video is ready to download.</p>
              </div>
              <a
                href={resultUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#335cff", color: "white" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
                  <polyline points="7 10 12 15 17 10" strokeLinecap="round" />
                  <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
                </svg>
                Download Video
              </a>
            </div>
          )}

          {/* Failed state */}
          {status === "failed" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#fee2e2" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#e5484d" strokeWidth={2.5} className="w-8 h-8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "#e5484d" }}>Export failed</p>
              <button onClick={() => setStatus("idle")} className="text-xs" style={{ color: "#98a0ae" }}>Try again</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === "idle" && (
          <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid #e4e7ec" }}>
            <button onClick={() => setExportModalOpen(false)} className="px-4 py-1.5 rounded-lg text-sm transition-colors" style={{ color: "#5a6170" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#15181f")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#5a6170")}
            >
              Cancel
            </button>
            <button
              onClick={startExport}
              className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#335cff", color: "white" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#284be0")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#335cff")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
                <polyline points="7 10 12 15 17 10" strokeLinecap="round" />
                <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
              </svg>
              Start Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
