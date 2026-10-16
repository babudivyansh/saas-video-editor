"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useModKey } from "./useModKey";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL_ID, getImageModel, resolveImageAspectRatio } from "@/lib/models/imageModels";
import type { ModelOverrideMap } from "@/lib/model-overrides";
import { useModelOverrides } from "./useModelOverrides";
import type { ImageParam } from "@/lib/models/types";
import { Tooltip } from "@/app/components/ui/Tooltip";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, StageEmpty, StageProgress } from "@/app/components/tools/ToolWorkspace";

// Aspect ratios are per model (lib/models/imageModels.ts, from each provider's
// schema). The old shared list offered "Original" and ratios most models ignored.

// ── Types ────────────────────────────────────────────────────────────────────
interface Generation {
  id: string;
  imageUrl: string;
  prompt: string;
  model: string;
  ratio: string;
  createdAt: number;
}

// Plain module-scope helper (not a component/hook) so the impure Date.now()/
// crypto.randomUUID() calls it makes aren't analyzed as part of a component's
// render body by the React Compiler's purity checks — this only ever runs
// inside the generate() click handler, never during render.
function buildGeneration(imageUrl: string, prompt: string, model: string, ratio: string): Generation {
  return { id: crypto.randomUUID(), imageUrl, prompt, model, ratio, createdAt: Date.now() };
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
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}

// Flat per-generation credit cost shown next to each image model — the admin
// override when one is set, exactly as the route charges.
function creditLabel(cost: number): string {
  return `${cost} ${cost === 1 ? "credit" : "credits"}`;
}
function priceOf(m: { id: string; creditCost: number }, overrides: ModelOverrideMap): number {
  return overrides[m.id]?.creditCost ?? m.creditCost;
}

// ── Custom dropdown ──────────────────────────────────────────────────────────
function ModelDropdown({ value, onChange, overrides }: { value: string; onChange: (v: string) => void; overrides: ModelOverrideMap }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = getImageModel(value);
  const filtered = IMAGE_MODELS.filter(m => overrides[m.id]?.enabled !== false).filter(m =>
    !search.trim() ||
    m.displayName.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => { if (o) setSearch(""); return !o; })}
        className="flex items-center gap-2 w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13.5px] font-medium text-fg hover:border-line-strong transition-colors cursor-pointer"
      >
        <span className="flex-1 text-left">{selected.displayName}</span>
        <span className="text-[10px] font-semibold text-fg-muted bg-surface-3 rounded-md px-1.5 py-0.5 whitespace-nowrap">{creditLabel(priceOf(selected, overrides))}</span>
        <IcChevron />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full bg-panel rounded-xl border border-line shadow-xl overflow-hidden">
          <div className="p-2 border-b border-line">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand/60"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); setSearch(""); }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] text-left hover:bg-surface-2 transition-colors cursor-pointer"
              >
                {value === m.id ? <span className="text-brand"><IcCheck /></span> : <span className="w-3.5 h-3.5" />}
                <span className="flex-1 font-medium text-fg">{m.displayName}</span>
                <span className="text-[10px] font-semibold text-fg-subtle bg-surface-3 rounded-md px-1.5 py-0.5 whitespace-nowrap">{creditLabel(priceOf(m, overrides))}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3.5 py-3 text-[12.5px] text-fg-subtle text-center">No models found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RatioDropdown({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
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
        className="flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2.5 text-[13.5px] font-medium text-fg hover:border-line-strong transition-colors cursor-pointer whitespace-nowrap"
      >
        {value} <IcChevron />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-32 bg-panel rounded-xl border border-line shadow-xl overflow-hidden">
          {options.map(r => (
            <button
              key={r}
              onClick={() => { onChange(r); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-surface-2 transition-colors cursor-pointer"
            >
              {value === r ? <span className="text-brand"><IcCheck /></span> : <span className="w-3.5 h-3.5" />}
              <span className="font-medium text-fg">{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
/**
 * Save an image to disk. `<a download>` is ignored for cross-origin URLs (the
 * images are on S3), so the button used to just open the image in a new tab.
 * Fetching it as a blob makes it a same-origin download; if the fetch is
 * blocked, fall back to opening it as before.
 */
async function saveImage(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = "generated-image.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function ImageGeneratorTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const modKey = useModKey();
  const job = useJobPolling({ toolSlug: "image-generator", token });
  const fireReviewPrompt = useReviewPromptTrigger();

  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL_ID);
  const [ratio, setRatio] = useState("9:16");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [guidanceScale, setGuidanceScale] = useState("");
  const [steps, setSteps] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const modelEntry = getImageModel(model);
  const supports = useCallback((p: ImageParam) => modelEntry.supportedParameters.includes(p), [modelEntry]);
  const overrides = useModelOverrides();
  // Snaps to a ratio this model accepts — derived, so switching models never
  // leaves a ratio the provider would reject or ignore.
  const effectiveRatio = resolveImageAspectRatio(modelEntry, ratio) ?? ratio;

  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [lightbox, setLightbox] = useState<Generation | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const addedForJobId = useRef<string | null>(null);
  const storageKey = user ? `image_gen_history:${user.id}` : "image_gen_history:guest";
  const generating = job.status === "processing";

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
    if (!user || !token) { openAuthModal("login", "AI Image Generator"); return; }
    if (!prompt.trim() || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  const generate = useCallback(async () => {
    if (!user || !token) { openAuthModal("login", "AI Image Generator"); return; }
    if (!prompt.trim() || generating) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setCurrentImage(null);

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const res = await fetch("/api/tools/image-generator", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            prompt: prompt.trim(),
            model,
            ratio: effectiveRatio,
            negativePrompt: supports("negativePrompt") && negativePrompt.trim() ? negativePrompt.trim() : undefined,
            seed: supports("seed") && seed.trim() ? Number(seed) : undefined,
            guidanceScale: supports("guidanceScale") && guidanceScale.trim() ? Number(guidanceScale) : undefined,
            steps: supports("steps") && steps.trim() ? Number(steps) : undefined,
            idempotencyKey,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generation failed");
        return data as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [user, token, openAuthModal, prompt, generating, model, effectiveRatio, negativePrompt, seed, guidanceScale, steps, supports, job]);

  // Once the job is done, pick up the resulting image URL from job.meta.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (addedForJobId.current === job.jobId) return;
    addedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    const imageUrl = (job.meta as { imageUrl?: string } | null)?.imageUrl;
    if (!imageUrl) return;
    const item = buildGeneration(imageUrl, prompt.trim(), model, effectiveRatio);
    setCurrentImage(imageUrl);
    persistGenerations([item, ...generations]);
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, job.jobId, job.meta, fireReviewPrompt]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void generate(); }
  }

  const modelName = modelEntry.displayName;
  const price = priceOf(modelEntry, overrides);

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />

      {/* ui/Modal: Esc closes it, focus is trapped, the icon buttons have names. */}
      {lightbox && (
        <Modal open onClose={() => setLightbox(null)} bare ariaLabel="Generated image" maxWidth="max-w-3xl" panelClassName="!bg-transparent !border-transparent !shadow-none">
          <div className="relative w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.imageUrl} alt={lightbox.prompt} className="w-full rounded-2xl shadow-2xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <a
                href={lightbox.imageUrl}
                download="generated-image.png"
                onClick={(e) => { e.preventDefault(); void saveImage(lightbox.imageUrl); }}
                aria-label="Download image"
                className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <IcDownload />
              </a>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <IcX />
              </button>
            </div>
            <p className="text-white/70 text-[12px] mt-3 line-clamp-2">{lightbox.prompt}</p>
          </div>
        </Modal>
      )}

      <ToolWorkspace
        title="AI Image Generator"
        icon="image"
        badges={<ToolBadge>{creditLabel(price)}</ToolBadge>}
        description="Describe a picture and the AI draws it."
        controls={
          <>
            <ToolField label="Prompt" hint={
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {prompt.length.toLocaleString()} / 2,000
                <Tooltip content="Be specific: subject, style, lighting, and mood all help. Enhance expands a short idea.">
                  <span className="cursor-help text-fg-subtle"><IcInfo /></span>
                </Tooltip>
              </span>
            }>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Describe the image you want to create…"
                  aria-label="Prompt"
                  rows={5}
                  maxLength={2000}
                  className="w-full resize-none rounded-xl border border-line bg-surface-1 px-3.5 py-3 pb-11 text-[13.5px] leading-relaxed text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
                />
                <button
                  type="button"
                  onClick={enhancePrompt}
                  disabled={!prompt.trim() || enhancing}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enhancing ? <Spinner className="w-3 h-3" /> : <IcSparkle />}
                  Enhance prompt
                </button>
              </div>
            </ToolField>

            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Model</p>
                <ModelDropdown value={model} onChange={setModel} overrides={overrides} />
              </div>
              {supports("aspectRatio") && (modelEntry.aspectRatios?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Shape</p>
                  <RatioDropdown value={effectiveRatio} options={modelEntry.aspectRatios!} onChange={setRatio} />
                </div>
              )}
              {/* Only models whose endpoint takes an input image offer one. */}
              {modelEntry.imageInput !== "none" && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Reference</p>
                  {referencePreview ? (
                    <div className="relative h-[42px] w-[42px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={referencePreview} alt="reference" className="h-full w-full rounded-xl border border-line object-cover" />
                      <button type="button" aria-label="Remove reference" onClick={() => setReferencePreview(null)}
                              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-2.5 w-2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ) : (
                    <button type="button" aria-label="Add a reference image" onClick={() => fileRef.current?.click()}
                            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-fg-subtle transition-colors hover:text-fg-muted">
                      <IcImage />
                    </button>
                  )}
                </div>
              )}
            </div>

            {supports("negativePrompt") && (
              <ToolField label="Avoid">
                <input
                  value={negativePrompt}
                  onChange={e => setNegativePrompt(e.target.value)}
                  placeholder="Things to keep out of the image…"
                  aria-label="Negative prompt"
                  className="w-full rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-[13px] text-fg outline-none transition placeholder:text-fg-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
                />
              </ToolField>
            )}

            {(supports("seed") || supports("guidanceScale") || supports("steps")) && (
              <div>
                <button type="button" onClick={() => setShowAdvanced(a => !a)} aria-expanded={showAdvanced}
                        className="flex items-center gap-1 text-[12px] font-semibold text-fg-muted hover:text-fg">
                  Advanced <IcChevron />
                </button>
                {showAdvanced && (
                  <div className="mt-2 flex gap-3">
                    {supports("seed") && (
                      <label className="flex-1">
                        <span className="mb-1 block text-[11px] text-fg-subtle">Seed</span>
                        <input type="number" value={seed} onChange={e => setSeed(e.target.value)} placeholder="Random"
                               className="w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/60" />
                      </label>
                    )}
                    {supports("guidanceScale") && (
                      <label className="flex-1">
                        <span className="mb-1 block text-[11px] text-fg-subtle">Guidance</span>
                        <input type="number" value={guidanceScale} onChange={e => setGuidanceScale(e.target.value)} placeholder="Default"
                               className="w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/60" />
                      </label>
                    )}
                    {supports("steps") && (
                      <label className="flex-1">
                        <span className="mb-1 block text-[11px] text-fg-subtle">Steps</span>
                        <input type="number" value={steps} onChange={e => setSteps(e.target.value)} placeholder="Default"
                               className="w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/60" />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        }
        footer={
          <>
            {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
            {job.status === "error" && job.error && <p role="alert" className="text-[12px] text-error">{job.error}</p>}
            {job.status === "cancelled" && <p className="text-[12px] text-fg-subtle">Cancelled — your credit was refunded.</p>}
            <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
              {modelName} · <span className="font-semibold text-fg">{creditLabel(price)}</span>
            </CostRow>
            <Button type="button" className="w-full" onClick={() => void generate()} disabled={!prompt.trim() || generating} loading={generating}>
              {generating ? "Generating…" : <>Generate image <kbd className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-semibold sm:inline-block">{modKey}+Enter</kbd></>}
            </Button>
            {!user && <p className="text-center text-[12px] text-fg-subtle">You&apos;ll be asked to sign in to generate.</p>}
          </>
        }
        stageActions={
          currentImage && !generating ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void saveImage(currentImage)}>
              <span className="inline-flex items-center gap-2"><IcDownload /> Download</span>
            </Button>
          ) : undefined
        }
        stage={
          generating ? (
            <StageProgress label={`Generating with ${modelName}…`} progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
          ) : currentImage ? (
            <div className="flex flex-1 flex-col gap-2">
              <button type="button" onClick={() => setLightbox(generations[0] ?? null)} className="flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-1" aria-label="View larger">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentImage} alt="Generated" className="max-h-[640px] w-full object-contain" />
              </button>
              <p className="text-[12px] text-fg-subtle">Saved to your Assets</p>
            </div>
          ) : (
            <StageEmpty icon="image" title="Your image appears here">
              Write a prompt on the left — try Enhance prompt to turn a short idea into a detailed one.
            </StageEmpty>
          )
        }
        below={
          generations.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Recent generations</p>
                <button type="button" onClick={() => persistGenerations([])} className="text-[12px] font-medium text-fg-muted hover:text-fg">Clear list</button>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {generations.map(g => (
                  <button key={g.id} type="button" onClick={() => setLightbox(g)} title={g.prompt}
                          className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-line transition-colors hover:border-line-strong">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.imageUrl} alt={g.prompt} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      />
    </>
  );
}
