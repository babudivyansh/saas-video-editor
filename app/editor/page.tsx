"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  title: string;
  script: string;
  voiceId: string;
  musicUrl?: string;
  backgroundUrl: string;
  subtitlesStyle: { fontName?: string; fontSize?: number; highlightColor?: string; baseColor?: string };
  status: string;
  videoUrl?: string;
}

interface WordTiming { word: string; start: number; end: number; }

const STYLE_OPTIONS = ["engaging and informative", "humorous", "dramatic", "educational", "motivational"];
const VOICE_IDS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli" },
];
const BG_VIDEOS = [
  { label: "Minecraft", url: "/fallback/minecraft.mp4" },
  { label: "Subway Surfers", url: "/fallback/subway.mp4" },
  { label: "Abstract Loop", url: "/fallback/abstract.mp4" },
];

function token() { return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""; }

function EditorContent() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("id");

  const [step, setStep] = useState(1);

  // Step 1
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");

  // Step 2
  const [voiceId, setVoiceId] = useState(VOICE_IDS[0].id);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);

  // Step 3
  const [bgVideo, setBgVideo] = useState(BG_VIDEOS[0].url);
  const [musicUrl, setMusicUrl] = useState("");

  // Step 4
  const [fontName, setFontName] = useState("Outfit");
  const [fontSize, setFontSize] = useState(80);
  const [highlightColor, setHighlightColor] = useState("#00ffff");
  const [baseColor, setBaseColor] = useState("#ffffff");

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    if (!projectId) { router.push("/dashboard"); return; }
    fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.project) { router.push("/dashboard"); return; }
        const p: Project = d.project;
        if (p.script) { setScript(p.script); setTitle(p.title); setStep(2); }
        if (p.voiceId) { setVoiceId(p.voiceId); }
        if (p.backgroundUrl) setBgVideo(p.backgroundUrl);
        if (p.subtitlesStyle) {
          const s = p.subtitlesStyle as typeof p.subtitlesStyle;
          if (s.fontName) setFontName(s.fontName);
          if (s.fontSize) setFontSize(s.fontSize);
          if (s.highlightColor) setHighlightColor(s.highlightColor.replace(/&H00/, "#").slice(0, 7));
          if (s.baseColor) setBaseColor(s.baseColor.replace(/&H00/, "#").slice(0, 7));
        }
      });
  }, [projectId, router]);

  function hexToASS(hex: string): string {
    const c = hex.replace("#", "");
    return `&H00${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}`;
  }

  async function generateScript() {
    setScriptLoading(true);
    try {
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ topic, style }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setScript(d.script); setTitle(d.title);
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ title: d.title, script: d.script }),
      });
      setStep(2);
    } finally { setScriptLoading(false); }
  }

  async function generateVoice() {
    setVoiceLoading(true);
    try {
      const res = await fetch("/api/generate/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ text: script, voiceId, projectId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setAudioUrl(d.audioUrl); setWordTimings(d.wordTimings);
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ voiceId }),
      });
      setStep(3);
    } finally { setVoiceLoading(false); }
  }

  async function handleExport() {
    setExporting(true); setExportError("");
    try {
      const subtitlesStyle = {
        fontName, fontSize,
        highlightColor: hexToASS(highlightColor),
        baseColor: hexToASS(baseColor),
      };
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ backgroundUrl: bgVideo, musicUrl: musicUrl || null, subtitlesStyle }),
      });
      const res = await fetch("/api/generate/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          projectId, bgVideoUrl: bgVideo, voiceAudioUrl: audioUrl,
          musicUrl: musicUrl || undefined, wordTimings, subtitlesStyle,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.push("/dashboard");
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally { setExporting(false); }
  }

  const stepLabel = ["Script", "Voice", "Background & Music", "Captions & Export"];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">← Dashboard</Link>
        <h1 className="text-sm font-medium text-white">{title || "New video"}</h1>
        <div className="flex gap-2">
          {stepLabel.map((l, i) => (
            <span
              key={l}
              className={`text-xs px-2 py-1 rounded ${step === i + 1 ? "bg-violet-600 text-white" : "text-zinc-600"}`}
            >
              {i + 1}. {l}
            </span>
          ))}
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        {/* Step 1 */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-semibold text-white">What&apos;s your video about?</h2>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Topic / prompt</label>
              <textarea
                value={topic} onChange={e => setTopic(e.target.value)} rows={3}
                placeholder="e.g. 5 mind-blowing facts about black holes"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Style</label>
              <select
                value={style} onChange={e => setStyle(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              >
                {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button
              onClick={generateScript} disabled={!topic || scriptLoading}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {scriptLoading ? "Generating script…" : "Generate script →"}
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Review & choose voice</h2>
              <button onClick={() => setStep(1)} className="text-xs text-zinc-500 hover:text-white">← Edit script</button>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Script</label>
              <textarea
                value={script} onChange={e => setScript(e.target.value)} rows={8}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Voice</label>
              <div className="grid grid-cols-3 gap-2">
                {VOICE_IDS.map(v => (
                  <button
                    key={v.id} onClick={() => setVoiceId(v.id)}
                    className={`py-2 rounded-lg text-sm transition-colors ${voiceId === v.id ? "bg-violet-600 text-white" : "bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={generateVoice} disabled={!script || voiceLoading}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {voiceLoading ? "Generating voice…" : "Generate voiceover →"}
            </button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Background & Music</h2>
              <button onClick={() => setStep(2)} className="text-xs text-zinc-500 hover:text-white">← Edit voice</button>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Background video</label>
              <div className="grid grid-cols-3 gap-2">
                {BG_VIDEOS.map(v => (
                  <button
                    key={v.url} onClick={() => setBgVideo(v.url)}
                    className={`py-2 rounded-lg text-sm transition-colors ${bgVideo === v.url ? "bg-violet-600 text-white" : "bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <input
                type="text" placeholder="Or paste a URL to your own S3 video"
                value={BG_VIDEOS.some(v => v.url === bgVideo) ? "" : bgVideo}
                onChange={e => setBgVideo(e.target.value)}
                className="mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Background music URL (optional)</label>
              <input
                type="text" placeholder="https://…/music.mp3"
                value={musicUrl} onChange={e => setMusicUrl(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            {audioUrl && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">Preview voiceover</p>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}
            <button
              onClick={() => setStep(4)}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              Next: Customize captions →
            </button>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Caption style & Export</h2>
              <button onClick={() => setStep(3)} className="text-xs text-zinc-500 hover:text-white">← Background</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Font</label>
                <select
                  value={fontName} onChange={e => setFontName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                >
                  {["Outfit", "Arial", "Impact", "Georgia", "Montserrat"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Font size</label>
                <input
                  type="number" min={40} max={120} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Highlight color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={highlightColor} onChange={e => setHighlightColor(e.target.value)} className="h-9 w-14 rounded cursor-pointer" />
                  <span className="text-sm text-zinc-400">{highlightColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Base color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={baseColor} onChange={e => setBaseColor(e.target.value)} className="h-9 w-14 rounded cursor-pointer" />
                  <span className="text-sm text-zinc-400">{baseColor}</span>
                </div>
              </div>
            </div>

            {/* Caption preview */}
            <div className="bg-black rounded-xl flex items-center justify-center py-10 relative overflow-hidden aspect-[9/16] max-h-64">
              <p className="text-white font-bold text-center px-4" style={{ fontFamily: fontName, fontSize: Math.round(fontSize * 0.25), color: baseColor }}>
                {wordTimings.slice(0, 5).map((w, i) => (
                  <span key={i} style={{ color: i === 0 ? highlightColor : baseColor }}>{w.word} </span>
                ))}
              </p>
            </div>

            {exportError && <p className="text-red-400 text-sm">{exportError}</p>}

            <button
              onClick={handleExport} disabled={exporting || !audioUrl}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-base"
            >
              {exporting ? "Exporting… (this may take a minute)" : "Export video →"}
            </button>
            {!audioUrl && <p className="text-xs text-zinc-500 text-center">Go back and generate a voiceover first.</p>}
          </div>
        )}
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-zinc-500">Loading editor…</div>}>
      <EditorContent />
    </Suspense>
  );
}
