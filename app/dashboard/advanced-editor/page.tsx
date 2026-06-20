"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import SubtitleStylePicker from "@/app/components/SubtitleStylePicker";
import CaptionOverlay from "@/app/components/CaptionOverlay";
import { computeMask, type Aspect } from "@/lib/crop";
import { CAPTION_STYLES } from "@/lib/caption-styles";
import { emptyDoc, type EditorDoc, type WordTiming, type CaptionMode, type TextOverlay, type ImageOverlay } from "@/lib/editor-types";

function token() { return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""; }
function uid() { return Math.random().toString(36).slice(2, 9); }
function fmt(s: number) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; }

type Selection =
  | { type: "clip" }
  | { type: "caption" }
  | { type: "music" }
  | { type: "text"; id: string }
  | { type: "image"; id: string }
  | null;

function AdvancedEditorInner() {
  const params = useSearchParams();
  const projectParam = params.get("project");
  const { user, openAuthModal } = useAuth();

  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState("");

  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [projectId, setProjectId] = useState("");
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "completed" | "failed">("idle");
  const [resultUrl, setResultUrl] = useState("");

  const requireAuth = useCallback(() => {
    if (!user) { openAuthModal("login", "Advanced Editor"); return false; }
    return true;
  }, [user, openAuthModal]);

  const patch = useCallback((p: Partial<EditorDoc>) => setDoc(d => d ? { ...d, ...p } : d), []);

  // Load an existing project (e.g. coming from Simple Editor).
  useEffect(() => {
    if (!projectParam) return;
    fetch(`/api/projects/${projectParam}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        const p = d.project;
        if (p?.editorDoc) { setDoc(p.editorDoc as EditorDoc); setProjectId(p.id); }
        else if (p?.uploadedVideoUrl) { setDoc(emptyDoc(p.uploadedVideoUrl, 0)); setProjectId(p.id); }
      })
      .catch(() => {});
  }, [projectParam]);

  // rAF loop to sync the playhead + overlays to the video.
  useEffect(() => {
    let raf = 0;
    const tick = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc?.videoUrl]);

  async function transcribe(url: string) {
    setBusy("Transcribing…");
    try {
      const res = await fetch("/api/editor/transcribe", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ videoUrl: url }),
      });
      const d = await res.json();
      if (res.ok) {
        const segs = d.segments || [];
        // Captions are optional — disable the layer if none came back so it isn't
        // toggled on but empty (e.g. STT unavailable on the server's key).
        setDoc(prev => prev ? { ...prev, captions: { ...prev.captions, segments: segs, enabled: segs.length > 0 } } : prev);
        if (d.warning) setError(d.warning);
      }
    } catch { /* captions optional */ } finally { setBusy(null); }
  }

  async function loadVideo(url: string, dur: number) {
    setDoc(emptyDoc(url, dur));
    await transcribe(url);
  }

  async function handleFile(file: File) {
    if (!requireAuth()) return;
    setError(""); setBusy("Uploading…");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      const dur = await new Promise<number>(resolve => {
        const v = document.createElement("video"); v.preload = "metadata";
        v.onloadedmetadata = () => resolve(v.duration || 0); v.onerror = () => resolve(0); v.src = d.url;
      });
      await loadVideo(d.url, dur);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); }
  }

  async function handleImport() {
    if (!requireAuth() || !linkUrl.trim()) return;
    setError(""); setBusy("Importing…");
    try {
      const res = await fetch("/api/editor/import-link", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      await loadVideo(d.videoUrl, d.durationSec || 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(null); }
  }

  function addText() {
    if (!doc) return;
    const t: TextOverlay = { id: uid(), text: "Your text", x: 0.5, y: 0.15, start: currentTime, end: Math.min(doc.durationSec, currentTime + 3), fontSize: 64, color: "#ffffff" };
    patch({ textOverlays: [...doc.textOverlays, t] });
    setSel({ type: "text", id: t.id });
  }

  async function addImage(file: File) {
    if (!doc) return;
    setBusy("Uploading image…");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      const img: ImageOverlay = { id: uid(), url: d.url, x: 0.3, y: 0.3, w: 0.3, start: currentTime, end: Math.min(doc.durationSec, currentTime + 3) };
      patch({ imageOverlays: [...doc.imageOverlays, img] });
      setSel({ type: "image", id: img.id });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); }
  }

  async function addMusic(file: File) {
    if (!doc) return;
    setBusy("Uploading music…");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      patch({ music: { url: d.url, volume: 0.5 } });
      setSel({ type: "music" });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(null); }
  }

  async function handleExport() {
    if (!requireAuth() || !doc) return;
    setError(""); setRenderStatus("rendering");
    try {
      const res = await fetch("/api/editor/render", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ projectId: projectId || undefined, doc, tool: "advanced-editor" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Render failed");
      setProjectId(d.projectId);
    } catch (e) { setError(e instanceof Error ? e.message : "Render failed"); setRenderStatus("failed"); }
  }

  useEffect(() => {
    if (renderStatus !== "rendering" || !projectId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = await res.json();
        const p = d.project;
        if (p?.status === "completed" && p.videoUrl) { setResultUrl(p.videoUrl); setRenderStatus("completed"); }
        else if (p?.status === "failed") { setRenderStatus("failed"); setError("Render failed — credits refunded."); }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [renderStatus, projectId]);

  // ── Empty state (no video yet) ──────────────────────────────────────────────
  if (!doc) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
        <Link href="/dashboard" className="absolute top-5 left-6 text-sm text-gray-400 hover:text-gray-700">← Dashboard</Link>
        <div className="w-full max-w-md space-y-4">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold text-gray-900">Advanced Editor</h1>
            <p className="text-sm text-gray-500 mt-1">Add a clip to start editing.</p>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</div>}
          <button onClick={() => { if (requireAuth()) fileRef.current?.click(); }} disabled={!!busy}
            className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-10 flex flex-col items-center gap-2 hover:border-blue-400 hover:bg-white transition-colors disabled:opacity-60 bg-white/50">
            <svg className="w-7 h-7 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <p className="text-sm font-bold text-gray-900">{busy || "Upload a video"}</p>
          </button>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          <div className="flex items-center gap-3 text-xs text-gray-400"><div className="flex-1 h-px bg-gray-200" />OR<div className="flex-1 h-px bg-gray-200" /></div>
          <div className="flex gap-2">
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleImport()} placeholder="YouTube or Instagram link" className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-400" />
            <button onClick={handleImport} disabled={!!busy || !linkUrl.trim()} className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-semibold px-5 rounded-xl">Import</button>
          </div>
        </div>
      </div>
    );
  }

  const mask = computeMask(videoRef.current?.videoWidth ?? 0, videoRef.current?.videoHeight ?? 0, doc.aspect);
  const ar = doc.aspect === "1:1" ? "1 / 1" : doc.aspect === "16:9" ? "16 / 9" : "9 / 16";
  const dur = doc.durationSec || videoRef.current?.duration || 1;
  const activeText = doc.textOverlays.filter(t => currentTime >= t.start && currentTime <= t.end);
  const activeImg = doc.imageOverlays.filter(t => currentTime >= t.start && currentTime <= t.end);

  function seek(t: number) { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(dur, t)); }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
        <span className="text-sm font-bold text-gray-900">Advanced Editor</span>
        <button onClick={handleExport} disabled={renderStatus === "rendering"}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-1.5 rounded-lg">
          {renderStatus === "rendering" ? "Exporting…" : "Export"}
        </button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 px-5 py-2 border-b border-red-100">{error}</div>}

      <div className="flex-1 flex min-h-0">
        {/* Left — media panel */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 space-y-2 flex-shrink-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Add</p>
          <button onClick={addText} className="w-full text-left text-sm font-medium text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-200">+ Text</button>
          <button onClick={() => imageRef.current?.click()} className="w-full text-left text-sm font-medium text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-200">+ Image</button>
          <button onClick={() => musicRef.current?.click()} className="w-full text-left text-sm font-medium text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-200">+ Music</button>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
          <input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addMusic(f); e.target.value = ""; }} />
          <button onClick={() => setSel({ type: "clip" })} className={`w-full text-left text-sm font-medium px-3 py-2 rounded-lg border mt-3 ${sel?.type === "clip" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>Clip &amp; format</button>
          <button onClick={() => setSel({ type: "caption" })} className={`w-full text-left text-sm font-medium px-3 py-2 rounded-lg border ${sel?.type === "caption" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>Captions</button>
        </div>

        {/* Center — preview */}
        <div className="flex-1 flex items-center justify-center p-6 min-w-0">
          <div className="relative bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: ar, maxHeight: "100%", height: "min(60vh, 100%)", containerType: "size" }}>
            <video
              ref={videoRef}
              src={doc.videoUrl}
              controls
              className="w-full h-full"
              style={{ objectFit: "cover", clipPath: `inset(${mask.top}% ${mask.right}% ${mask.bottom}% ${mask.left}%)` }}
            />
            {doc.captions.enabled && (
              <CaptionOverlay segments={doc.captions.segments} mode={doc.captions.mode} styleIndex={doc.captions.styleIndex} timeMs={currentTime * 1000} />
            )}
            {activeText.map(t => (
              <div key={t.id} onClick={() => setSel({ type: "text", id: t.id })}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer whitespace-nowrap"
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, color: t.color, fontWeight: 800,
                  fontSize: `${t.fontSize / 12}cqw`, textShadow: "0 2px 6px rgba(0,0,0,0.9)",
                  outline: sel?.type === "text" && sel.id === t.id ? "1px dashed #60a5fa" : "none" }}>
                {t.text}
              </div>
            ))}
            {activeImg.map(t => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t.id} src={t.url} alt="" onClick={() => setSel({ type: "image", id: t.id })}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`,
                  outline: sel?.type === "image" && sel.id === t.id ? "1px dashed #60a5fa" : "none" }} />
            ))}
          </div>
        </div>

        {/* Right — properties */}
        <div className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto flex-shrink-0">
          <Properties doc={doc} sel={sel} patch={patch} setDoc={setDoc} setSel={setSel} />
        </div>
      </div>

      {/* Bottom — timeline */}
      <Timeline doc={doc} dur={dur} currentTime={currentTime} sel={sel} setSel={setSel} seek={seek} patch={patch} />

      {/* Export overlay */}
      {(renderStatus === "rendering" || renderStatus === "completed") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
            {renderStatus === "rendering" ? (
              <>
                <div className="w-10 h-10 rounded-full border-blue-200 border-t-blue-600 animate-spin mx-auto mb-4" style={{ borderWidth: 3 }} />
                <h2 className="text-lg font-bold text-gray-900">Exporting…</h2>
                <p className="text-sm text-gray-500 mt-1">Compositing your edit. 1–3 minutes.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-3">Export complete 🎉</h2>
                <video src={resultUrl} controls className="w-full max-h-[50vh] rounded-lg bg-black mb-3" />
                <div className="flex gap-2 justify-center">
                  <a href={resultUrl} download className="bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Download</a>
                  <button onClick={() => setRenderStatus("idle")} className="border border-gray-200 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-xl">Keep editing</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Properties panel ──────────────────────────────────────────────────────────
function Properties({ doc, sel, patch, setDoc, setSel }: {
  doc: EditorDoc; sel: Selection;
  patch: (p: Partial<EditorDoc>) => void;
  setDoc: React.Dispatch<React.SetStateAction<EditorDoc | null>>;
  setSel: (s: Selection) => void;
}) {
  const updateText = (id: string, p: Partial<TextOverlay>) =>
    patch({ textOverlays: doc.textOverlays.map(t => t.id === id ? { ...t, ...p } : t) });
  const updateImage = (id: string, p: Partial<ImageOverlay>) =>
    patch({ imageOverlays: doc.imageOverlays.map(t => t.id === id ? { ...t, ...p } : t) });

  if (!sel) return <p className="text-xs text-gray-400">Select an element to edit it, or add text/image/music.</p>;

  if (sel.type === "clip") {
    return (
      <div className="space-y-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Clip &amp; format</p>
        <div>
          <label className="text-xs text-gray-500">Aspect ratio</label>
          <div className="flex gap-1.5 mt-1.5">
            {(["9:16", "1:1", "16:9"] as Aspect[]).map(a => (
              <button key={a} onClick={() => patch({ aspect: a })} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${doc.aspect === a ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{a}</button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-500">Trim start: {doc.trimStart.toFixed(1)}s
          <input type="range" min={0} max={doc.durationSec} step={0.1} value={doc.trimStart} onChange={e => patch({ trimStart: Math.min(+e.target.value, doc.trimEnd - 0.5) })} className="w-full mt-1" />
        </label>
        <label className="block text-xs text-gray-500">Trim end: {doc.trimEnd.toFixed(1)}s
          <input type="range" min={0} max={doc.durationSec} step={0.1} value={doc.trimEnd} onChange={e => patch({ trimEnd: Math.max(+e.target.value, doc.trimStart + 0.5) })} className="w-full mt-1" />
        </label>
      </div>
    );
  }

  if (sel.type === "caption") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Captions</p>
          <button onClick={() => patch({ captions: { ...doc.captions, enabled: !doc.captions.enabled } })} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.captions.enabled ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>{doc.captions.enabled ? "On" : "Off"}</button>
        </div>
        {doc.captions.enabled && (
          <>
            <div className="flex gap-1.5">
              {(["oneword", "lines"] as CaptionMode[]).map(m => (
                <button key={m} onClick={() => patch({ captions: { ...doc.captions, mode: m } })} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${doc.captions.mode === m ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}>{m === "oneword" ? "One word" : "Lines"}</button>
              ))}
            </div>
            <SubtitleStylePicker value={doc.captions.styleIndex} onChange={i => patch({ captions: { ...doc.captions, styleIndex: i } })} />
            <p className="text-[11px] text-gray-400">{doc.captions.segments.length} words transcribed.</p>
          </>
        )}
      </div>
    );
  }

  if (sel.type === "music") {
    if (!doc.music) return <p className="text-xs text-gray-400">No music added.</p>;
    return (
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Music</p>
        <label className="block text-xs text-gray-500">Volume: {Math.round(doc.music.volume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={doc.music.volume} onChange={e => patch({ music: { ...doc.music!, volume: +e.target.value } })} className="w-full mt-1" />
        </label>
        <button onClick={() => { patch({ music: undefined }); setSel(null); }} className="text-xs font-semibold text-red-500 hover:text-red-600">Remove music</button>
      </div>
    );
  }

  if (sel.type === "text") {
    const t = doc.textOverlays.find(o => o.id === sel.id);
    if (!t) return null;
    return (
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Text</p>
        <textarea value={t.text} onChange={e => updateText(t.id, { text: e.target.value })} rows={2} className="w-full text-sm rounded-lg border border-gray-200 px-2.5 py-2 focus:outline-none focus:border-blue-400" />
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500 flex-1">Size
            <input type="range" min={20} max={140} value={t.fontSize} onChange={e => updateText(t.id, { fontSize: +e.target.value })} className="w-full" />
          </label>
          <input type="color" value={t.color} onChange={e => updateText(t.id, { color: e.target.value })} className="w-9 h-9 rounded border border-gray-200" />
        </div>
        <label className="block text-xs text-gray-500">X: {Math.round(t.x * 100)}%
          <input type="range" min={0} max={1} step={0.01} value={t.x} onChange={e => updateText(t.id, { x: +e.target.value })} className="w-full" />
        </label>
        <label className="block text-xs text-gray-500">Y: {Math.round(t.y * 100)}%
          <input type="range" min={0} max={1} step={0.01} value={t.y} onChange={e => updateText(t.id, { y: +e.target.value })} className="w-full" />
        </label>
        <div className="flex gap-2">
          <label className="text-xs text-gray-500 flex-1">Start {t.start.toFixed(1)}s
            <input type="range" min={0} max={doc.durationSec} step={0.1} value={t.start} onChange={e => updateText(t.id, { start: Math.min(+e.target.value, t.end - 0.2) })} className="w-full" /></label>
          <label className="text-xs text-gray-500 flex-1">End {t.end.toFixed(1)}s
            <input type="range" min={0} max={doc.durationSec} step={0.1} value={t.end} onChange={e => updateText(t.id, { end: Math.max(+e.target.value, t.start + 0.2) })} className="w-full" /></label>
        </div>
        <button onClick={() => { patch({ textOverlays: doc.textOverlays.filter(o => o.id !== t.id) }); setSel(null); }} className="text-xs font-semibold text-red-500 hover:text-red-600">Delete</button>
      </div>
    );
  }

  if (sel.type === "image") {
    const t = doc.imageOverlays.find(o => o.id === sel.id);
    if (!t) return null;
    return (
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Image</p>
        <label className="block text-xs text-gray-500">Width: {Math.round(t.w * 100)}%
          <input type="range" min={0.05} max={1} step={0.01} value={t.w} onChange={e => updateImage(t.id, { w: +e.target.value })} className="w-full" /></label>
        <label className="block text-xs text-gray-500">X: {Math.round(t.x * 100)}%
          <input type="range" min={0} max={1} step={0.01} value={t.x} onChange={e => updateImage(t.id, { x: +e.target.value })} className="w-full" /></label>
        <label className="block text-xs text-gray-500">Y: {Math.round(t.y * 100)}%
          <input type="range" min={0} max={1} step={0.01} value={t.y} onChange={e => updateImage(t.id, { y: +e.target.value })} className="w-full" /></label>
        <div className="flex gap-2">
          <label className="text-xs text-gray-500 flex-1">Start {t.start.toFixed(1)}s
            <input type="range" min={0} max={doc.durationSec} step={0.1} value={t.start} onChange={e => updateImage(t.id, { start: Math.min(+e.target.value, t.end - 0.2) })} className="w-full" /></label>
          <label className="text-xs text-gray-500 flex-1">End {t.end.toFixed(1)}s
            <input type="range" min={0} max={doc.durationSec} step={0.1} value={t.end} onChange={e => updateImage(t.id, { end: Math.max(+e.target.value, t.start + 0.2) })} className="w-full" /></label>
        </div>
        <button onClick={() => { patch({ imageOverlays: doc.imageOverlays.filter(o => o.id !== t.id) }); setSel(null); }} className="text-xs font-semibold text-red-500 hover:text-red-600">Delete</button>
      </div>
    );
  }
  return null;
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ doc, dur, currentTime, sel, setSel, seek }: {
  doc: EditorDoc; dur: number; currentTime: number; sel: Selection;
  setSel: (s: Selection) => void; seek: (t: number) => void;
  patch: (p: Partial<EditorDoc>) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${(t / dur) * 100}%`;

  const onScrub = (e: React.PointerEvent) => {
    const el = trackRef.current; if (!el) return;
    const move = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      seek(((clientX - rect.left) / rect.width) * dur);
    };
    move(e.clientX);
    const mv = (ev: PointerEvent) => move(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const Lane = ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <div className="flex items-center h-8">
      <span className="w-16 text-[10px] font-semibold text-gray-400 uppercase flex-shrink-0">{label}</span>
      <div className="relative flex-1 h-6 bg-gray-100 rounded">{children}</div>
    </div>
  );

  const block = (start: number, end: number, color: string, selected: boolean, onClick: () => void, key?: string) => (
    <button key={key} onClick={onClick}
      className={`absolute top-0.5 bottom-0.5 rounded text-[9px] text-white font-semibold flex items-center px-1 overflow-hidden ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ left: pct(start), width: pct(Math.max(0.1, end - start)), background: color }} />
  );

  const capRange = doc.captions.segments.length ? [doc.captions.segments[0].start / 1000, doc.captions.segments[doc.captions.segments.length - 1].end / 1000] : null;

  return (
    <div className="border-t border-gray-200 bg-white px-5 py-3 flex-shrink-0">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-mono text-gray-500">{fmt(currentTime)} / {fmt(dur)}</span>
      </div>
      {/* Ruler / scrubber */}
      <div ref={trackRef} onPointerDown={onScrub} className="relative ml-16 h-5 mb-1 cursor-pointer">
        <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200" />
        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-600 z-10" style={{ left: pct(currentTime) }}>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 -ml-1 -mt-0.5" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Lane label="Video">{block(doc.trimStart, doc.trimEnd, "#3b82f6", sel?.type === "clip", () => setSel({ type: "clip" }))}</Lane>
        <Lane label="Captions">{doc.captions.enabled && capRange && block(capRange[0], capRange[1], "#a855f7", sel?.type === "caption", () => setSel({ type: "caption" }))}</Lane>
        <Lane label="Audio">{doc.music && block(0, dur, "#10b981", sel?.type === "music", () => setSel({ type: "music" }))}</Lane>
        <Lane label="Overlays">
          {doc.textOverlays.map(t => block(t.start, t.end, "#f59e0b", sel?.type === "text" && sel.id === t.id, () => setSel({ type: "text", id: t.id }), "t" + t.id))}
          {doc.imageOverlays.map(t => block(t.start, t.end, "#ec4899", sel?.type === "image" && sel.id === t.id, () => setSel({ type: "image", id: t.id }), "i" + t.id))}
        </Lane>
      </div>
    </div>
  );
}

export default function AdvancedEditorPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <AdvancedEditorInner />
    </Suspense>
  );
}
