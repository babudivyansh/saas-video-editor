"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Models / options ──────────────────────────────────────────────────────────
const MODELS = [
  { slug: "veo3-standard", name: "VEO3 Standard",  badge: "Popular"              },
  { slug: "veo3-fast",     name: "VEO3 Fast",       badge: "Fast"                 },
  { slug: "hailuo-02",     name: "Hailuo 02",       badge: "Excels at physics"    },
  { slug: "seedance-pro",  name: "Seedance 1 Pro",  badge: "Best Length Control"  },
];
const DURATIONS = ["5s", "8s"];
const RATIOS    = ["16:9", "9:16", "1:1"];

const SAMPLE_PROMPTS = [
  { label: "Cinematic sunset", text: "A cinematic aerial shot of a golden sunset over the ocean, waves crashing on the shore, dramatic lighting, 4K quality" },
  { label: "City timelapse",   text: "A timelapse of a busy city street at night, neon lights reflecting on wet pavement, cars streaming past in light trails" },
  { label: "Nature macro",     text: "Extreme macro close-up of a dewdrop falling onto a green leaf in slow motion, water ripples spreading outward" },
  { label: "Space nebula",     text: "A breathtaking flythrough of a colorful cosmic nebula, stars twinkling, vibrant purples and blues, cinematic space photography" },
  { label: "Forest rain",      text: "Gentle rain falling through a misty forest, sunlight filtering through the canopy, moss-covered rocks, peaceful and serene" },
  { label: "Ocean waves",      text: "Powerful ocean waves crashing against rocky cliffs, white foam spraying high into the air, dramatic overcast sky" },
  { label: "Fire close-up",    text: "A close-up of dancing flames in slow motion, deep orange and red tones, embers floating upward, dark background" },
  { label: "Mountain peak",    text: "A majestic snow-capped mountain peak at dawn, pink and orange clouds below the summit, eagle soaring in the foreground" },
];

const PROMPT_TIPS = [
  "Start with the camera movement (aerial shot, close-up, timelapse…)",
  "Describe the subject, setting, and mood in detail",
  "Mention lighting style (golden hour, neon, dramatic, soft)",
  "Add a quality tag at the end (4K, cinematic, photorealistic)",
  "Keep prompts under 200 words for best results",
];

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0"><path d="M6 9l6 6 6-6"/></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5"/></svg>;
}
function IcBook() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
}
function IcFileText() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
}
function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>;
}
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

// ── Generic dropdown ──────────────────────────────────────────────────────────
function Dropdown<T extends { slug?: string; label?: string; name?: string; badge?: string | null }>({
  label,
  value,
  options,
  getSlug,
  getLabel,
  getBadge,
  onChange,
}: {
  label: string;
  value: string;
  options: T[];
  getSlug: (o: T) => string;
  getLabel: (o: T) => string;
  getBadge?: (o: T) => string | null | undefined;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => getSlug(o) === value) ?? options[0];

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-gray-900 hover:border-gray-300 transition-colors"
        >
          <span className="flex-1 text-left truncate">{getLabel(selected)}</span>
          {getBadge && getBadge(selected) && (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-md px-1.5 py-0.5 flex-shrink-0">
              {getBadge(selected)}
            </span>
          )}
          <IcChevron />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 w-full z-30 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
            {options.map(opt => {
              const slug = getSlug(opt);
              const badge = getBadge?.(opt);
              return (
                <button
                  key={slug}
                  onClick={() => { onChange(slug); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3.5 py-2.5 text-[13px] text-left hover:bg-gray-50 transition-colors"
                >
                  <span className={`flex-shrink-0 w-3.5 ${value === slug ? "text-blue-600" : "text-transparent"}`}>
                    <IcCheck />
                  </span>
                  <span className="flex-1 font-medium text-gray-900 truncate">{getLabel(opt)}</span>
                  {badge && (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-md px-1.5 py-0.5 flex-shrink-0">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Prompt Library Modal ──────────────────────────────────────────────────────
function PromptLibraryModal({ onSelect, onClose }: { onSelect: (text: string) => void; onClose: () => void }) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Prompt Library</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><IcX /></button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
          {SAMPLE_PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => { onSelect(p.text); onClose(); }}
              className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
            >
              <p className="text-xs font-semibold text-gray-700 group-hover:text-blue-700 mb-1">{p.label}</p>
              <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{p.text}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Prompt Docs Popover ───────────────────────────────────────────────────────
function PromptDocsPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function h(e: MouseEvent) { void e; onClose(); }
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div className="absolute top-full mt-2 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-lg p-4 w-72" onClick={e => e.stopPropagation()}>
      <p className="text-xs font-bold text-gray-800 mb-2.5 flex items-center gap-1.5"><IcInfo /> Prompt Writing Tips</p>
      <ul className="space-y-1.5">
        {PROMPT_TIPS.map((tip, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500 leading-relaxed">
            <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>{tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main tool ─────────────────────────────────────────────────────────────────
type Stage = "idle" | "generating" | "complete" | "error";

export default function VideoGeneratorTool() {
  const { refreshUser } = useAuth();

  const [model,       setModel]       = useState("veo3-standard");
  const [duration,    setDuration]    = useState("8s");
  const [ratio,       setRatio]       = useState("16:9");
  const [prompt,      setPrompt]      = useState("");
  const [stage,       setStage]       = useState<Stage>("idle");
  const [progress,    setProgress]    = useState(0);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null);
  const [downloadName,setDownloadName]= useState("ai-video.mp4");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showDocs,    setShowDocs]    = useState(false);
  const [refImage,    setRefImage]    = useState<File | null>(null);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcut
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && stage === "idle" && prompt.trim()) {
        e.preventDefault();
        handleGenerate();
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const handleGenerate = async () => {
    if (!prompt.trim() || stage === "generating") return;

    const token = localStorage.getItem("token");
    if (!token) { setErrorMsg("Please log in to use this tool."); return; }

    setStage("generating");
    setProgress(5);
    setErrorMsg("");
    setVideoUrl(null);

    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        model,
        duration: parseInt(duration),
        aspectRatio: ratio,
      };

      const res = await fetch("/api/tools/video-generator", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const { jobId } = await res.json();
      const name = `ai-video-${Date.now()}.mp4`;
      setDownloadName(name);

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const poll = await fetch(`/api/tools/video-generator?jobId=${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await poll.json();
            if (data.progress != null) setProgress(data.progress);
            if (data.status === "done") { clearInterval(interval); resolve(); }
            else if (data.status === "error") { clearInterval(interval); reject(new Error(data.error ?? "Generation failed")); }
          } catch (err) { clearInterval(interval); reject(err); }
        }, 2000);
      });

      setProgress(100);

      const dlRes = await fetch(`/api/tools/video-generator?jobId=${jobId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) throw new Error("Download failed");

      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);

      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();

      await refreshUser();
      setStage("complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  };

  const handleReset = () => {
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
  };

  const durationOptions = DURATIONS.map(d => ({ slug: d, name: d }));
  const ratioOptions    = RATIOS.map(r => ({ slug: r, name: r }));

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">VEO3 Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate stunning videos from text with AI</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
          <div className="p-6 space-y-5">

            {/* Dropdowns row */}
            <div className="flex gap-3">
              <Dropdown
                label="Model"
                value={model}
                options={MODELS}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                getBadge={o => o.badge}
                onChange={setModel}
              />
              <Dropdown
                label="Duration"
                value={duration}
                options={durationOptions}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                onChange={setDuration}
              />
              <Dropdown
                label="Aspect Ratio"
                value={ratio}
                options={ratioOptions}
                getSlug={o => o.slug}
                getLabel={o => o.name}
                onChange={setRatio}
              />
            </div>

            {/* Buttons row */}
            <div className="flex items-center gap-2 flex-wrap relative">
              <button
                onClick={() => setShowLibrary(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
              >
                <IcBook /> Prompt Library
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowDocs(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
                >
                  <IcFileText /> Prompt Docs
                </button>
                {showDocs && <PromptDocsPopover onClose={() => setShowDocs(false)} />}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (f) setRefImage(f); e.target.value = "";
              }} />
              {!refImage ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors"
                >
                  <IcImage /> Add reference image
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">
                  <IcImage />
                  <span className="max-w-[120px] truncate">{refImage.name}</span>
                  <button onClick={() => setRefImage(null)} className="text-blue-400 hover:text-blue-700 transition-colors ml-0.5"><IcX /></button>
                </div>
              )}
            </div>

            {/* Prompt textarea */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prompt</label>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the video you want to create..."
                rows={8}
                disabled={stage === "generating"}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none transition-all disabled:opacity-60"
              />
              <p className="text-[11px] text-gray-400 mt-1 text-right">{prompt.length}/2000</p>
            </div>

            {/* Progress bar */}
            {stage === "generating" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><Spinner /> Generating… this takes 1–3 minutes</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{errorMsg}</p>
            )}

            {/* Video result */}
            {stage === "complete" && videoUrl && (
              <div className="space-y-3">
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl border border-gray-200 bg-black"
                  style={{ maxHeight: 360 }}
                />
                <div className="flex gap-2">
                  <a
                    href={videoUrl}
                    download={downloadName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold transition-colors"
                  >
                    <IcDownload /> Download
                  </a>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            )}

            {/* Generate button */}
            {stage !== "complete" && (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || stage === "generating"}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #335CFF 0%, #7B5EA7 100%)" }}
              >
                {stage === "generating" ? (
                  <><Spinner /> Generating…</>
                ) : (
                  <>Generate Video <kbd className="text-[10px] text-white/60 font-normal bg-white/10 px-1.5 py-0.5 rounded">⌘+Enter</kbd></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {showLibrary && (
        <PromptLibraryModal
          onSelect={text => setPrompt(text)}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}
