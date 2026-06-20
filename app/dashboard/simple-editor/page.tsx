"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import SubtitleStylePicker from "@/app/components/SubtitleStylePicker";
import CaptionOverlay from "@/app/components/CaptionOverlay";
import { useAuth } from "@/app/components/AuthContext";
import { computeMask, type Aspect } from "@/lib/crop";
import type { EditorDoc, WordTiming, CaptionMode } from "@/lib/editor-types";

function token() { return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""; }

const ASPECTS: { id: Aspect; label: string }[] = [
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
];

function probeDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration || 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

// ── Live cropped preview with synced captions ─────────────────────────────────
function Preview({
  videoUrl, aspect, segments, mode, styleIndex,
}: {
  videoUrl: string; aspect: Aspect; segments: WordTiming[]; mode: CaptionMode; styleIndex: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) setTimeMs(ref.current.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const mask = computeMask(dims.w, dims.h, aspect);
  const ar = aspect === "1:1" ? "1 / 1" : aspect === "16:9" ? "16 / 9" : "9 / 16";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative bg-black rounded-xl overflow-hidden shadow-lg"
        style={{ aspectRatio: ar, maxHeight: "62vh", height: "62vh", containerType: "size" }}
      >
        <video
          ref={ref}
          src={videoUrl}
          controls
          onLoadedMetadata={e => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          className="w-full h-full"
          style={{
            objectFit: "cover",
            clipPath: `inset(${mask.top}% ${mask.right}% ${mask.bottom}% ${mask.left}%)`,
          }}
        />
        <CaptionOverlay segments={segments} mode={mode} styleIndex={styleIndex} timeMs={timeMs} />
      </div>
    </div>
  );
}

export default function SimpleEditorPage() {
  const { user, openAuthModal } = useAuth();

  const [step, setStep] = useState(1);
  const [videoUrl, setVideoUrl] = useState("");
  const [durationSec, setDurationSec] = useState(0);

  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState("");

  const [segments, setSegments] = useState<WordTiming[]>([]);
  const [styleIndex, setStyleIndex] = useState(0);
  const [mode, setMode] = useState<CaptionMode>("oneword");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [captionsOn, setCaptionsOn] = useState(true);

  const [notice, setNotice] = useState("");
  const [projectId, setProjectId] = useState("");
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "completed" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const requireAuth = useCallback(() => {
    if (!user) { openAuthModal("login", "Simple Editor"); return false; }
    return true;
  }, [user, openAuthModal]);

  async function transcribe(url: string) {
    setBusy("Transcribing audio…"); setNotice("");
    try {
      const res = await fetch("/api/editor/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ videoUrl: url }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Transcription failed");
      const segs = d.segments || [];
      setSegments(segs);
      // Captions are optional — if none came back (e.g. STT unavailable), turn the
      // subtitle layer off and show a non-blocking note rather than an error.
      if (d.warning || segs.length === 0) {
        setCaptionsOn(false);
        setNotice(d.warning || "No speech detected — captions are off. You can still format and export.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally { setBusy(null); }
  }

  async function handleFile(file: File) {
    if (!requireAuth()) return;
    setError(""); setBusy("Uploading video…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      const dur = await probeDuration(d.url);
      setVideoUrl(d.url); setDurationSec(dur);
      setStep(2);
      await transcribe(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  }

  async function handleImport() {
    if (!requireAuth()) return;
    if (!linkUrl.trim()) return;
    setError(""); setBusy("Importing link…");
    try {
      const res = await fetch("/api/editor/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      setVideoUrl(d.videoUrl); setDurationSec(d.durationSec || 0);
      setStep(2);
      await transcribe(d.videoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally { setBusy(null); }
  }

  function buildDoc(): EditorDoc {
    return {
      videoUrl, durationSec, aspect, trimStart: 0, trimEnd: durationSec,
      captions: { enabled: captionsOn, styleIndex, mode, segments },
      textOverlays: [], imageOverlays: [],
    };
  }

  async function handleGenerate() {
    if (!requireAuth()) return;
    setError(""); setStep(3); setRenderStatus("rendering");
    try {
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ doc: buildDoc(), tool: "simple-editor" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Render failed");
      setProjectId(d.projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
      setRenderStatus("failed");
    }
  }

  // Poll project status while rendering.
  useEffect(() => {
    if (renderStatus !== "rendering" || !projectId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = await res.json();
        const p = d.project;
        if (p?.status === "completed" && p.videoUrl) { setResultUrl(p.videoUrl); setRenderStatus("completed"); }
        else if (p?.status === "failed") { setRenderStatus("failed"); setError("Render failed — your credits were refunded."); }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [renderStatus, projectId]);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <div className="mx-auto w-full max-w-[1100px] px-8 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Simple Editor</h1>
              <p className="text-sm text-gray-500 mt-0.5">Quick formatting &amp; subtitles in 3 steps.</p>
            </div>
            <div className="flex gap-2">
              {["Add video", "Style & format", "Generate"].map((l, i) => (
                <span key={l} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${step === i + 1 ? "bg-blue-600 text-white" : step > i + 1 ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                  {i + 1}. {l}
                </span>
              ))}
            </div>
          </div>

          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</div>}
          {notice && <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">{notice}</div>}

          {/* Step 1 — Add video */}
          {step === 1 && (
            <div className="max-w-xl mx-auto space-y-4 py-6">
              <button
                onClick={() => { if (requireAuth()) fileRef.current?.click(); }}
                disabled={!!busy}
                className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-12 flex flex-col items-center gap-3 hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:opacity-60"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900">{busy || "Upload a video"}</p>
                  <p className="text-xs text-gray-400 mt-0.5">MP4, MOV — up to 500 MB</p>
                </div>
              </button>
              <input ref={fileRef} type="file" accept="video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

              <div className="flex items-center gap-3 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" /> OR <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div className="flex gap-2">
                <input
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleImport()}
                  placeholder="Paste a YouTube or Instagram link"
                  className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
                <button onClick={handleImport} disabled={!!busy || !linkUrl.trim()}
                  className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold px-5 rounded-xl transition-colors">
                  Import
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Style & format */}
          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
              <Preview videoUrl={videoUrl} aspect={aspect} segments={captionsOn ? segments : []} mode={mode} styleIndex={styleIndex} />

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Format</label>
                  <div className="flex gap-2 mt-2">
                    {ASPECTS.map(a => (
                      <button key={a.id} onClick={() => setAspect(a.id)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${aspect === a.id ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Subtitles</label>
                    <button onClick={() => setCaptionsOn(v => !v)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${captionsOn ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                      {captionsOn ? "On" : "Off"}
                    </button>
                  </div>
                  {busy === "Transcribing audio…" && <p className="text-xs text-gray-400 mt-2 animate-pulse">Transcribing audio…</p>}
                  {captionsOn && (
                    <>
                      <div className="flex gap-2 mt-2 mb-3">
                        {(["oneword", "lines"] as CaptionMode[]).map(m => (
                          <button key={m} onClick={() => setMode(m)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${mode === m ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            {m === "oneword" ? "One word" : "Lines"}
                          </button>
                        ))}
                      </div>
                      <SubtitleStylePicker value={styleIndex} onChange={setStyleIndex} />
                    </>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={handleGenerate} disabled={!!busy}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">
                    Generate video
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Generate / result */}
          {step === 3 && (
            <div className="max-w-md mx-auto py-12 text-center">
              {renderStatus === "rendering" && (
                <>
                  <div className="w-12 h-12 rounded-full border-3 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-5" style={{ borderWidth: 3 }} />
                  <h2 className="text-lg font-bold text-gray-900">Rendering your video…</h2>
                  <p className="text-sm text-gray-500 mt-1">Burning captions and formatting. This takes 1–3 minutes.</p>
                </>
              )}
              {renderStatus === "completed" && (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Your video is ready! 🎉</h2>
                  <video src={resultUrl} controls className="w-full max-h-[60vh] rounded-xl bg-black mb-4" />
                  <div className="flex gap-2 justify-center">
                    <a href={resultUrl} download className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Download</a>
                    <Link href={`/dashboard/advanced-editor?project=${projectId}`} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-xl">Open in Advanced Editor</Link>
                  </div>
                </>
              )}
              {renderStatus === "failed" && (
                <>
                  <h2 className="text-lg font-bold text-gray-900">Render failed</h2>
                  <p className="text-sm text-gray-500 mt-1">{error || "Something went wrong. Your credits were refunded."}</p>
                  <button onClick={() => { setStep(2); setRenderStatus("idle"); }} className="mt-5 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Try again</button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
