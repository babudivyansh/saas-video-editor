"use client";

import { useState } from "react";
import { useSimpleEditorStore } from "./store/simpleEditorStore";

function token() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "";
}

interface Platform {
  id: string;
  name: string;
  res: string;
  icon: string;
  color: string;
}

const PLATFORMS: Platform[] = [
  { id: "tiktok",     name: "TikTok",           res: "1080×1920", icon: "🎵", color: "#ff0050" },
  { id: "reels",      name: "Instagram Reels",  res: "1080×1920", icon: "📸", color: "#e1306c" },
  { id: "shorts",     name: "YouTube Shorts",   res: "1080×1920", icon: "▶",  color: "#ff0000" },
  { id: "facebook",   name: "Facebook Reels",   res: "1080×1920", icon: "👍", color: "#1877f2" },
];

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState("tiktok");
  const [phase, setPhase] = useState<"pick" | "exporting" | "done">("pick");

  const videoUrl          = useSimpleEditorStore(s => s.videoUrl);
  const projectId         = useSimpleEditorStore(s => s.projectId);
  const trimStart         = useSimpleEditorStore(s => s.trimStart);
  const trimEnd           = useSimpleEditorStore(s => s.trimEnd);
  const captions          = useSimpleEditorStore(s => s.captions);
  const captionStyleIndex = useSimpleEditorStore(s => s.captionStyleIndex);
  const captionsEnabled   = useSimpleEditorStore(s => s.captionsEnabled);
  const exportUrl         = useSimpleEditorStore(s => s.exportUrl);
  const setExporting      = useSimpleEditorStore(s => s.setExporting);
  const setExportResult   = useSimpleEditorStore(s => s.setExportResult);

  async function startExport() {
    setPhase("exporting");
    setExporting(true);

    const doc = {
      _v: 1,
      videoUrl,
      durationSec: trimEnd,
      aspect: "9:16",
      trimStart,
      trimEnd,
      captions: {
        enabled: captionsEnabled,
        styleIndex: captionStyleIndex,
        mode: "oneword",
        segments: captions,
      },
      textOverlays: [],
      imageOverlays: [],
    };

    try {
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ projectId, doc, tool: "simple-editor" }),
      });
      const data = await res.json();
      if (data.projectId) {
        pollForCompletion(data.projectId);
      } else {
        setPhase("pick");
        setExporting(false);
      }
    } catch {
      setPhase("pick");
      setExporting(false);
    }
  }

  function pollForCompletion(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${jobId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        const { project } = await res.json();
        if (project?.status === "completed") {
          clearInterval(interval);
          setExportResult(jobId, project.videoUrl ?? null);
          setPhase("done");
        } else if (project?.status === "failed") {
          clearInterval(interval);
          setExporting(false);
          setPhase("pick");
        }
      } catch { clearInterval(interval); }
    }, 3000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-base font-bold text-white">Export Reel</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: "#6b7280" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e5e7eb"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {phase === "pick" && (
            <>
              <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>Choose your platform:</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className="rounded-xl p-4 text-left transition-all"
                    style={{
                      background: selected === p.id ? `${p.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${selected === p.id ? p.color + "66" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <div className="text-2xl mb-2">{p.icon}</div>
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{p.res} · 9:16</p>
                  </button>
                ))}
              </div>
              <button
                onClick={startExport}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: "#7C3AED" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#6d28d9"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#7C3AED"; }}
              >
                Export for {PLATFORMS.find(p => p.id === selected)?.name}
              </button>
            </>
          )}

          {phase === "exporting" && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div
                className="w-16 h-16 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "#7C3AED", borderTopColor: "transparent" }}
              />
              <div className="text-center">
                <p className="text-base font-semibold text-white mb-1">Rendering your reel…</p>
                <p className="text-sm" style={{ color: "#6b7280" }}>This usually takes 1–3 minutes</p>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center gap-5 py-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                style={{ background: "rgba(34,197,94,0.15)" }}
              >
                ✓
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-white mb-1">Export complete!</p>
                <p className="text-sm mb-4" style={{ color: "#6b7280" }}>Your reel is ready to download.</p>
              </div>
              {exportUrl && (
                <a
                  href={exportUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl text-sm font-bold text-center text-white transition-all block"
                  style={{ background: "#22c55e" }}
                >
                  Download Reel
                </a>
              )}
              <button
                onClick={onClose}
                className="text-sm"
                style={{ color: "#6b7280" }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
