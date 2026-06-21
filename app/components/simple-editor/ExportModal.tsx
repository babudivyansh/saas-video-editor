"use client";

import { useRef, useState } from "react";
import type { EditorState, ExportFormat, ExportQuality } from "./types";
import { exportClientSide, exportHD } from "./exportVideo";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  state: EditorState;
  videoEl: HTMLVideoElement | null;
  token: string;
  onClose: () => void;
}

export default function ExportModal({ state, videoEl, token, onClose }: Props) {
  const { video, trim } = state;
  const [filename, setFilename] = useState(() => (video?.name.replace(/\.[^.]+$/, "") ?? "video") + "_edited");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [quality, setQuality] = useState<ExportQuality>("720p");

  const [phase, setPhase] = useState<"idle" | "exporting" | "polling" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [projectId, setProjectId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!video) return null;

  const trimDuration = trim.end - trim.start;
  const estMb = Math.round((video.width * video.height * trimDuration * 0.15) / 1_000_000);

  async function doClientExport() {
    if (!videoEl) return;
    setPhase("exporting"); setProgress(0); setProgressLabel("Exporting…");
    try {
      await exportClientSide(videoEl, state, format, pct => { setProgress(pct); setProgressLabel(`Exporting… ${Math.round(pct)}%`); });
      setPhase("done"); setProgressLabel("Download started!");
    } catch (e) {
      setPhase("error"); setErrorMsg(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function doHDExport() {
    setPhase("exporting"); setProgress(10); setProgressLabel("Uploading…");
    try {
      const { projectId: pid } = await exportHD(state, token, (label, pct) => {
        setProgressLabel(label); setProgress(pct);
      });
      setProjectId(pid); setPhase("polling"); setProgressLabel("Rendering on server…"); setProgress(60);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${pid}`, { headers: { Authorization: `Bearer ${token}` } });
          const d = await res.json();
          const p = d.project;
          if (p?.status === "completed" && p.videoUrl) {
            clearInterval(pollRef.current!);
            setDownloadUrl(p.videoUrl); setPhase("done"); setProgressLabel("Render complete!");
          } else if (p?.status === "failed") {
            clearInterval(pollRef.current!);
            setPhase("error"); setErrorMsg("Server render failed — credits refunded.");
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) {
      setPhase("error"); setErrorMsg(e instanceof Error ? e.message : "HD export failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Export Video</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        {phase === "idle" && (
          <div className="space-y-4">
            {/* Filename */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Filename</label>
              <div className="flex gap-1.5 items-center bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <input
                  value={filename}
                  onChange={e => setFilename(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                />
                <span className="text-gray-500 text-xs">.webm</span>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white/[0.03] rounded-xl p-3 text-xs text-gray-400 space-y-1">
              <div className="flex justify-between"><span>Trim</span><span className="text-white">{fmt(trim.start)} → {fmt(trim.end)} ({fmt(trimDuration)})</span></div>
              <div className="flex justify-between"><span>Resolution</span><span className="text-white">{video.width} × {video.height}</span></div>
              <div className="flex justify-between"><span>Estimated size</span><span className="text-white">~{estMb} MB</span></div>
              <div className="flex justify-between"><span>Text overlays</span><span className="text-white">{state.textOverlays.length}</span></div>
              <div className="flex justify-between"><span>Captions</span><span className="text-white">{state.captions.length}</span></div>
            </div>

            {/* Two export options */}
            <div className="space-y-2">
              <button
                onClick={doClientExport}
                className="w-full py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6d28d9] text-white text-sm font-bold transition-colors"
              >
                Download (Free) — browser export
              </button>
              <p className="text-center text-xs text-gray-500">Client-side WebM · instant · no credits</p>

              <div className="flex items-center gap-3 py-1 text-xs text-gray-500">
                <div className="flex-1 h-px bg-white/10" /> OR <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                onClick={doHDExport}
                className="w-full py-3 rounded-xl border border-[#7C3AED] hover:bg-[#7C3AED]/10 text-[#7C3AED] text-sm font-bold transition-colors"
              >
                Generate HD — server render
              </button>
              <p className="text-center text-xs text-gray-500">Server ffmpeg · best quality · costs 1 credit</p>
            </div>
          </div>
        )}

        {(phase === "exporting" || phase === "polling") && (
          <div className="space-y-5 py-4 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-[#7C3AED]/30 border-t-[#7C3AED] animate-spin mx-auto" />
            <p className="text-sm text-white">{progressLabel}</p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#7C3AED] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto text-green-400 text-xl">✓</div>
            <p className="text-sm font-semibold text-white">{progressLabel}</p>
            {downloadUrl && (
              <a href={downloadUrl} download={`${filename}.mp4`}
                className="block py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6d28d9] text-white text-sm font-bold transition-colors">
                Download HD video
              </a>
            )}
            <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Close</button>
          </div>
        )}

        {phase === "error" && (
          <div className="text-center space-y-4 py-4">
            <p className="text-sm text-red-400">{errorMsg}</p>
            <button onClick={() => { setPhase("idle"); setErrorMsg(""); }}
              className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
