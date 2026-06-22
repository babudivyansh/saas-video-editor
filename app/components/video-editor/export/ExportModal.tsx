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
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [progress, setProgress] = useState(0);

  const startExport = useCallback(async () => {
    setStatus("rendering");
    setProgress(10);

    try {
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          projectId: projectId || undefined,
          doc: present,
          tool: "advanced-editor",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("failed");
        return;
      }

      const pid = data.projectId;
      setProgress(30);

      // Poll for completion
      const poll = setInterval(async () => {
        setProgress(p => Math.min(p + 10, 90));
        try {
          const r = await fetch(`/api/projects/${pid}`, {
            headers: { Authorization: `Bearer ${token()}` },
          });
          const d = await r.json();
          const proj = d.project;
          if (proj?.status === "completed" && proj?.videoUrl) {
            clearInterval(poll);
            setResultUrl(proj.videoUrl);
            setStatus("done");
            setProgress(100);
          } else if (proj?.status === "failed") {
            clearInterval(poll);
            setStatus("failed");
          }
        } catch {
          clearInterval(poll);
          setStatus("failed");
        }
      }, 3000);
    } catch {
      setStatus("failed");
    }
  }, [present, projectId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="flex flex-col rounded-2xl shadow-2xl overflow-hidden" style={{ width: 500, maxHeight: "85vh", background: "#18181b", border: "1px solid #27272a" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #27272a" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#e4e4e7" }}>Export Video</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Choose your platform and quality</p>
          </div>
          <button onClick={() => setExportModalOpen(false)} style={{ color: "#71717a" }} className="hover:text-white transition-colors">
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
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#52525b" }}>Platform</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORM_PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPreset(p.id)}
                      className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all"
                      style={{
                        background: selectedPreset === p.id ? "#1e3a5f" : "#111113",
                        border: `1px solid ${selectedPreset === p.id ? "#2563eb" : "#27272a"}`,
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{p.icon}</span>
                      <span className="text-xs font-medium" style={{ color: selectedPreset === p.id ? "#93c5fd" : "#a1a1aa" }}>{p.label}</span>
                      {p.aspect && <span className="text-xs" style={{ color: "#52525b", fontSize: 9 }}>{p.aspect} · {p.resolution}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#52525b" }}>Resolution</p>
                <div className="flex gap-2">
                  {RESOLUTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: resolution === r ? "#1e3a5f" : "#111113",
                        border: `1px solid ${resolution === r ? "#2563eb" : "#27272a"}`,
                        color: resolution === r ? "#93c5fd" : "#71717a",
                      }}
                    >
                      {r}
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
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#27272a" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none" stroke="#2563eb" strokeWidth="3"
                    strokeDasharray={`${progress * 0.942} 94.2`}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: "#e4e4e7" }}>{progress}%</div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "#e4e4e7" }}>Rendering your video…</p>
                <p className="text-xs mt-1" style={{ color: "#52525b" }}>This may take a few minutes. You can close this window.</p>
              </div>
            </div>
          )}

          {/* Done state */}
          {status === "done" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#14532d" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} className="w-8 h-8">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#e4e4e7" }}>Export complete!</p>
                <p className="text-xs mt-1" style={{ color: "#52525b" }}>Your video is ready to download.</p>
              </div>
              <a
                href={resultUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#2563eb", color: "white" }}
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
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#450a0a" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2.5} className="w-8 h-8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "#f87171" }}>Export failed</p>
              <button onClick={() => setStatus("idle")} className="text-xs" style={{ color: "#52525b" }}>Try again</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === "idle" && (
          <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid #27272a" }}>
            <button onClick={() => setExportModalOpen(false)} className="px-4 py-1.5 rounded-lg text-sm transition-colors" style={{ color: "#71717a" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#e4e4e7")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#71717a")}
            >
              Cancel
            </button>
            <button
              onClick={startExport}
              className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#2563eb", color: "white" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#1d4ed8")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#2563eb")}
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
