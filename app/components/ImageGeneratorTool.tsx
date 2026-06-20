"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

// ── Models ───────────────────────────────────────────────────────────────────
const MODELS = [
  { slug: "imagen-3", name: "Imagen 3", badge: "Google" },
];

const RATIOS = ["Original","1:1","4:3","3:4","16:9","9:16","3:2","2:3","21:9"];

// ── Types ────────────────────────────────────────────────────────────────────
interface Generation {
  id: string;
  imageUrl: string;
  prompt: string;
  model: string;
  ratio: string;
  createdAt: number;
}

// ── Icons ────────────────────────────────────────────────────────────────────
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0"><path d="M6 9l6 6 6-6"/></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
}
function IcInfo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>;
}
function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5z"/></svg>;
}
function IcWand() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

// ── Custom dropdown ──────────────────────────────────────────────────────────
function ModelDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = MODELS.find(m => m.slug === value) ?? MODELS[0];

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13.5px] font-medium text-gray-900 hover:border-gray-300 transition-colors cursor-pointer"
      >
        <span className="flex-1 text-left">{selected.name}</span>
        {selected.badge && (
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-md px-1.5 py-0.5">{selected.badge}</span>
        )}
        <IcChevron />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          {MODELS.map(m => (
            <button
              key={m.slug}
              onClick={() => { onChange(m.slug); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] text-left hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {value === m.slug ? <span className="text-blue-600"><IcCheck /></span> : <span className="w-3.5 h-3.5" />}
              <span className="flex-1 font-medium text-gray-900">{m.name}</span>
              {m.badge && (
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-md px-1.5 py-0.5 whitespace-nowrap">{m.badge}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RatioDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] font-medium text-gray-900 hover:border-gray-300 transition-colors cursor-pointer whitespace-nowrap"
      >
        {value} <IcChevron />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-32 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          {RATIOS.map(r => (
            <button
              key={r}
              onClick={() => { onChange(r); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {value === r ? <span className="text-blue-600"><IcCheck /></span> : <span className="w-3.5 h-3.5" />}
              <span className="font-medium text-gray-900">{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ImageGeneratorTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();

  const [model, setModel] = useState("imagen-3");
  const [ratio, setRatio] = useState("9:16");
  const [prompt, setPrompt] = useState("");
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [lightbox, setLightbox] = useState<Generation | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const storageKey = user ? `image_gen_history:${user.id}` : "image_gen_history:guest";

  useEffect(() => {
    try { setGenerations(JSON.parse(localStorage.getItem(storageKey) ?? "[]")); } catch { setGenerations([]); }
  }, [storageKey]);

  function persistGenerations(items: Generation[]) {
    setGenerations(items);
    try { localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 30))); } catch {}
  }

  function handleReferenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReferencePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function enhancePrompt() {
    if (!prompt.trim() || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhancement failed");
      setPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enhancement failed");
    } finally {
      setEnhancing(false);
    }
  }

  async function generate() {
    if (!user || !token) { openAuthModal("login", "AI Image Generator"); return; }
    if (!prompt.trim() || generating) return;
    setError(null);
    setGenerating(true);
    setCurrentImage(null);
    try {
      const res = await fetch("/api/tools/image-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: prompt.trim(), model, ratio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const item: Generation = {
        id: crypto.randomUUID(),
        imageUrl: data.imageUrl,
        prompt: prompt.trim(),
        model,
        ratio,
        createdAt: Date.now(),
      };
      setCurrentImage(data.imageUrl);
      persistGenerations([item, ...generations]);
      refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); generate(); }
  }

  const modelName = MODELS.find(m => m.slug === model)?.name ?? model;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-8 pb-12">
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.imageUrl} alt={lightbox.prompt} className="w-full rounded-2xl shadow-2xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <a
                href={lightbox.imageUrl}
                download="generated-image.png"
                className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <IcDownload />
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <IcX />
              </button>
            </div>
            <p className="text-white/70 text-[12px] mt-3 line-clamp-2">{lightbox.prompt}</p>
          </div>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* ── Left panel ──────────────────────────────────────────── */}
        <div className="w-[660px] flex-shrink-0">

          {/* Controls row */}
          <div className="flex items-end gap-3 mb-4">
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-gray-500 mb-1.5">Model</p>
              <ModelDropdown value={model} onChange={setModel} />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-gray-500 mb-1.5">Ratio</p>
              <RatioDropdown value={ratio} onChange={setRatio} />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[12px] font-semibold text-gray-500">Reference</p>
                <span className="text-gray-400 cursor-help" title="Adding a reference image means your prompt will edit that image">
                  <IcInfo />
                </span>
              </div>
              {referencePreview ? (
                <div className="relative w-[42px] h-[42px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={referencePreview} alt="reference" className="w-full h-full object-cover rounded-xl border border-gray-200" />
                  <button
                    onClick={() => setReferencePreview(null)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 text-white flex items-center justify-center cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-[42px] h-[42px] rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <IcImage />
                </button>
              )}
            </div>
          </div>

          {/* Preview area */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 mb-4 overflow-hidden" style={{ minHeight: 340 }}>
            {generating ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[340px] gap-4">
                <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                  <Spinner className="w-6 h-6 text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-bold text-gray-800">Generating your image…</p>
                  <p className="text-[12.5px] text-gray-400 mt-1">Using {modelName}</p>
                </div>
              </div>
            ) : currentImage ? (
              <div className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentImage} alt="Generated" className="w-full rounded-2xl" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-2xl" />
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={currentImage}
                    download="generated-image.png"
                    className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                  >
                    <IcDownload />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[340px] gap-3 text-center px-8">
                <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm text-gray-400">
                  <IcSparkle />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-gray-900">Ready to create something amazing?</p>
                  <p className="text-[13px] text-blue-500 mt-1">Enter a prompt below and let AI bring your ideas to life</p>
                </div>
              </div>
            )}
          </div>

          {/* Prompt */}
          <p className="text-[13.5px] font-bold text-gray-900 mb-2">Prompt</p>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Describe the image you want to create..."
              rows={6}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[13.5px] leading-relaxed text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none pb-10"
            />
            {/* Enhance Prompt */}
            <button
              onClick={enhancePrompt}
              disabled={!prompt.trim() || enhancing}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {enhancing ? <Spinner className="w-3 h-3" /> : <IcWand />}
              Enhance Prompt
              {!enhancing && <IcChevron />}
            </button>
          </div>

          {error && <p className="text-[12px] text-red-500 mt-2">{error}</p>}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={!prompt.trim() || generating}
            className={`mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold transition-colors ${
              prompt.trim() && !generating
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {generating ? <><Spinner /> Generating…</> : <><IcWand /> Generate Image</>}
            {!generating && prompt.trim() && (
              <kbd className="ml-1 hidden sm:inline-block text-[11px] font-semibold bg-white/20 rounded px-1.5 py-0.5">⌘+Enter</kbd>
            )}
          </button>
          {!user && (
            <p className="text-[12px] text-gray-400 mt-2 text-center">You&apos;ll be asked to sign in to generate.</p>
          )}
        </div>

        {/* ── Right panel: Recent Generations ─────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Recent Generations</h2>
            {generations.length > 0 && (
              <button
                onClick={() => persistGenerations([])}
                className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {generations.length === 0 ? (
            /* Empty placeholders (dashed boxes like crayo) */
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl border-2 border-dashed border-gray-200 bg-gray-50" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {generations.map(g => (
                <button
                  key={g.id}
                  onClick={() => setLightbox(g)}
                  className="aspect-square rounded-xl overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer relative group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.imageUrl} alt={g.prompt} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                    <p className="text-white text-[10px] leading-tight line-clamp-2">{g.prompt}</p>
                  </div>
                </button>
              ))}
              {/* Filler placeholders to keep grid shape */}
              {generations.length < 9 && Array.from({ length: Math.max(0, 9 - generations.length) }).map((_, i) => (
                <div key={`ph-${i}`} className="aspect-square rounded-xl border-2 border-dashed border-gray-200 bg-gray-50" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
