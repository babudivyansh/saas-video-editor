"use client";
import { Suspense, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import CaptionStyleGrid from "@/app/components/auto-clip/CaptionStyleGrid";
import { ReframeAndCutsControls } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { discardDraftProject } from "@/lib/discard-draft-project";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { UrlImportField } from "@/app/components/auto-clip/UrlImportField";
import { Switch } from "@/app/components/ui/Switch";
import { Button } from "@/app/components/ui/Button";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useVideoGenerate, getStoredToken } from "@/app/hooks/useVideoGenerate";
import { indexForTemplateId, DEFAULT_TEMPLATE_ID } from "@/lib/captions/legacyStyleIndex";
import { estimateRunCost, bandMaxSeconds } from "@/lib/captions/runEstimate";
import { AUTOCLIP_PRICING_DEFAULTS, type AutoClipPricing } from "@/lib/autoclip-pricing";
import { MAX_INSTRUCTIONS_CHARS } from "@/lib/autoclip-create-input";
import { CAPTION_RENDER_PRICING_DEFAULTS, type CaptionRenderPricing } from "@/lib/captions/pricingDefaults";
import { IcFilm, IcCloud, IcFile, IcX, IcSparkle, apiFetch, ASPECTS } from "./_components/shared";
import { ClipsResults } from "./_components/ClipsResults";

// ── Main flow (single-screen Create + overlay) ───────────────────────────────
type LengthPreset = "short" | "standard" | "long";
const LENGTH_PRESETS: { id: LengthPreset; label: string; min: number; max: number }[] = [
  { id: "short", label: "<30s", min: 5, max: 30 },
  { id: "standard", label: "15–60s", min: 15, max: 60 },
  { id: "long", label: "60s+", min: 60, max: 120 },
];

function AutoClipFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const resumeProjectId = params.get("project");
  // Set by Related Content links from the Assets library.
  const deepLinkClipId = params.get("clip");

  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [importedUrl, setImportedUrl] = useState<string | null>(null);
  const [importedTitle, setImportedTitle] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // A video reused from the Global Asset Library — already hosted on our S3,
  // so unlike importedUrl (a third-party link the URL-import route still has
  // to download) this only needs a project created with its URL, no import step.
  const [pickedAsset, setPickedAsset] = useState<PickerAsset | null>(null);

  const [minDuration, setMinDuration] = useState(15);
  const [maxDuration, setMaxDuration] = useState(60);
  const [clipCount, setClipCount] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [instructions, setInstructions] = useState("");
  const [captionsOn, setCaptionsOn] = useState(true);
  // The caption style is now a TEMPLATE SLUG, not an index into a colour table.
  // captionStyleIndex is still derived from it on the wire (see the create
  // bodies below) purely to keep the public v1 API contract working.
  const [captionTemplateId, setCaptionTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [premiumTemplateIds, setPremiumTemplateIds] = useState<Set<string>>(new Set());
  const captionStyleIndex = indexForTemplateId(captionTemplateId);
  const isPremiumStyle = captionsOn && premiumTemplateIds.has(captionTemplateId);

  // Priced with the same helper the create route uses, and now the same
  // PRICES: the route's GET returns the admin-set ones. This used the bundled
  // defaults, so after any repricing the figure beside Generate was not the
  // figure charged. The defaults remain only as the first-paint fallback.
  const pricingQuery = useQuery({
    queryKey: ["auto-clip-pricing"],
    queryFn: () => apiFetch<{ pricing: AutoClipPricing; captionPricing: CaptionRenderPricing; balance: number }>("/api/generate/auto-clip"),
    staleTime: 60_000,
  });
  const balance = pricingQuery.data?.balance ?? null;
  const runCost = useMemo(
    () =>
      estimateRunCost(
        { clipCount, maxDurationSec: bandMaxSeconds(minDuration, maxDuration), premiumCaptions: isPremiumStyle },
        pricingQuery.data?.pricing ?? AUTOCLIP_PRICING_DEFAULTS,
        pricingQuery.data?.captionPricing ?? CAPTION_RENDER_PRICING_DEFAULTS,
      ),
    [clipCount, minDuration, maxDuration, isPremiumStyle, pricingQuery.data],
  );

  const [reframingPreset, setReframingPreset] = useState("balanced");
  const [removeSilence, setRemoveSilence] = useState(false);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState(400);
  const [removeFillers, setRemoveFillers] = useState(false);
  const [smartAutoReframe, setSmartAutoReframe] = useState(true);
  const [zoomStrength, setZoomStrength] = useState<"low" | "medium" | "high">("medium");
  const [speakerMode, setSpeakerMode] = useState<"auto" | "single" | "split" | "active">("auto");
  const [smoothness, setSmoothness] = useState(50);
  const [trackingSpeed, setTrackingSpeed] = useState(50);
  const [animatedCaptions, setAnimatedCaptions] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const {
    status: genStatus, error: genError, projectId: genProjectId, paymentBlock,
    generateAutoClip, generateAutoClipForProject, reset, clearPaymentBlock,
  } = useVideoGenerate();
  const creditModal = useInsufficientCredits();

  // A run refused for credits opens the top-up modal straight away — the
  // user asked to spend, so the next step is paying, not reading an error.
  useEffect(() => {
    if (paymentBlock?.kind === "credits") {
      creditModal.open({ required: paymentBlock.required, balance: paymentBlock.balance, action: "Auto Clips" });
    }
  }, [paymentBlock, creditModal]);

  // A failed project the user chose to try again. Its video is already on our
  // side, so Generate re-runs THAT project (the create route re-claims a
  // "failed" project) instead of asking for the file again.
  const [retryProject, setRetryProject] = useState<{ id: string; name: string | null } | null>(null);

  // Put the run in the URL the moment it starts. It never was, so refreshing
  // mid-run dropped the user back on an empty form with no way back to it.
  useEffect(() => {
    if (genStatus === "rendering" && genProjectId && !resumeProjectId) {
      router.replace(`/dashboard/create/auto-clip?project=${encodeURIComponent(genProjectId)}`);
    }
  }, [genStatus, genProjectId, resumeProjectId, router]);

  useEffect(() => { return () => { if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); }; }, [videoPreviewUrl]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(f);
    setVideoPreviewUrl(URL.createObjectURL(f));
  }, [videoPreviewUrl]);

  const handleClearFile = useCallback(() => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(null);
    setVideoPreviewUrl(null);
  }, [videoPreviewUrl]);

  const lengthPreset: LengthPreset = LENGTH_PRESETS.find((p) => p.min === minDuration && p.max === maxDuration)?.id ?? "standard";

  const handleGenerate = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    const settings = {
      minDuration, maxDuration, clipCount, aspectRatio, instructions,
      captionStyleIndex: captionsOn ? captionStyleIndex : -1,
      captionTemplateId: captionsOn ? captionTemplateId : null,
      reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
      smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions,
    };
    if (!file && retryProject) {
      setImportError(null);
      try {
        await generateAutoClipForProject({ projectId: retryProject.id, token, ...settings });
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Couldn't start the run again");
      }
      return;
    }
    if (!file && pickedAsset) {
      setImportError(null);
      let createdId: string | null = null;
      try {
        const created = await apiFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ title: pickedAsset.name, uploadedVideoUrl: pickedAsset.url, productType: "auto-clip" }) });
        createdId = created.project.id;
        const outcome = await generateAutoClipForProject({ projectId: createdId, token, ...settings });
        // Refused for payment: nothing ran, so the draft is an empty shell.
        if (outcome === "payment_blocked") await discardDraftProject(createdId, token);
      } catch (e) {
        // If analysis never started, the project is an empty shell — drop it
        // rather than leaving a "0 clips" draft on the dashboard.
        if (createdId) await discardDraftProject(createdId, token);
        setImportError(e instanceof Error ? e.message : "Couldn't start from that asset");
      }
      return;
    }
    if (!file && importedUrl) {
      setImportError(null);
      let projectId: string | null = null;
      try {
        const created = await apiFetch<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ title: importedTitle ?? "Imported video", productType: "auto-clip" }) });
        projectId = created.project.id;
        await apiFetch(`/api/projects/${projectId}/import-url`, { method: "POST", body: JSON.stringify({ url: importedUrl }) });
        const outcome = await generateAutoClipForProject({ projectId, token, ...settings });
        if (outcome === "payment_blocked") await discardDraftProject(projectId, token);
      } catch (e) {
        // A URL that fails to import is the most common way this path breaks,
        // and it used to leave a draft named after the source video behind on
        // every retry.
        if (projectId) await discardDraftProject(projectId, token);
        setImportError(e instanceof Error ? e.message : "Import failed");
      }
      return;
    }
    if (!file) return;
    await generateAutoClip({ file, token, ...settings });
  }, [file, retryProject, pickedAsset, importedUrl, importedTitle, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionsOn, captionStyleIndex, captionTemplateId, reframingPreset, removeSilence, silenceThresholdMs, removeFillers, smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions, generateAutoClip, generateAutoClipForProject]);

  const handleReset = useCallback(() => {
    reset();
    handleClearFile();
    setImportedUrl(null); setImportedTitle(null); setImportError(null); setPickedAsset(null); setRetryProject(null);
    setMinDuration(15); setMaxDuration(60); setClipCount(8); setAspectRatio("9:16");
    setInstructions(""); setCaptionsOn(true); setCaptionTemplateId(DEFAULT_TEMPLATE_ID);
    setReframingPreset("balanced"); setRemoveSilence(false); setSilenceThresholdMs(400); setRemoveFillers(false);
    setSmartAutoReframe(true); setZoomStrength("medium"); setSpeakerMode("auto"); setSmoothness(50); setTrackingSpeed(50); setAnimatedCaptions(true);
    setAdvancedOpen(false);
    router.push("/dashboard/create/auto-clip");
  }, [reset, handleClearFile, router]);

  const showOverlay = !!resumeProjectId || genStatus !== "idle";
  const activeProjectId = resumeProjectId ?? genProjectId;
  const canGenerate = !!file || !!importedUrl || !!pickedAsset || !!retryProject;

  // "Try again" on a failed run: back to the form with this session's settings
  // kept (it used to offer only "Create another", which wiped them), and the
  // failed project as the source.
  const handleRetry = useCallback((name: string | null) => {
    if (!activeProjectId) return;
    setRetryProject({ id: activeProjectId, name });
    setFile(null); setImportedUrl(null); setPickedAsset(null); setImportError(null);
    reset();
    router.push("/dashboard/create/auto-clip");
  }, [activeProjectId, reset, router]);

  if (showOverlay) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
        <ClipsResults projectId={activeProjectId} status={resumeProjectId ? "rendering" : genStatus} error={genError} expectedCount={clipCount} fileName={file?.name ?? importedTitle ?? pickedAsset?.name ?? retryProject?.name ?? null} onReset={handleReset} onRetry={handleRetry} initialClipId={deepLinkClipId} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--surface)" }}>
      <div className="max-w-[720px] mx-auto px-6 pt-12 pb-32">
        <h1 className="text-[32px] font-extrabold tracking-tight text-ink mb-2">AutoClip</h1>
        <p className="text-base text-ink-soft mb-8 max-w-[52ch]">Add a long video. We find the moments worth posting and cut them into ready-to-publish clips.</p>

        {/* Source: file or URL */}
        <input ref={inputRef} type="file" accept="video/mp4,video/mov,video/quicktime,video/webm" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        {file && videoPreviewUrl ? (
          <div className="rounded-[20px] border border-card-border bg-panel p-4 flex items-center gap-4">
            <video src={videoPreviewUrl} className="w-28 rounded-xl object-cover bg-black" style={{ aspectRatio: "16/9" }} />
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><IcFile /><span className="truncate">{file.name}</span></div><p className="text-xs text-ink-soft mt-0.5">Ready to analyze</p></div>
            <button onClick={handleClearFile} aria-label="Remove video" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : importedUrl ? (
          <div className="rounded-[20px] border border-card-border bg-panel p-4 flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-tint-blue text-brand flex items-center justify-center"><IcCloud /></span>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-ink truncate">{importedTitle}</p><p className="text-xs text-ink-soft mt-0.5">Downloaded from your link when analysis starts.</p></div>
            <button onClick={() => { setImportedUrl(null); setImportedTitle(null); }} aria-label="Use a different source" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : retryProject ? (
          <div className="rounded-[20px] border border-line bg-panel p-4 flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-tint-emerald text-brand flex items-center justify-center"><IcFilm /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg truncate">{retryProject.name ?? "Your video"}</p>
              <p className="text-xs text-fg-muted mt-0.5">Trying this video again. Adjust anything below, then Generate.</p>
            </div>
            <button onClick={() => setRetryProject(null)} aria-label="Use a different source" className="w-9 h-9 rounded-lg border border-line text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : pickedAsset ? (
          <div className="rounded-[20px] border border-card-border bg-panel p-4 flex items-center gap-4">
            <video src={pickedAsset.url} className="w-28 rounded-xl object-cover bg-black" style={{ aspectRatio: "16/9" }} />
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><IcFile /><span className="truncate">{pickedAsset.name}</span></div><p className="text-xs text-ink-soft mt-0.5">From your Assets library</p></div>
            <button onClick={() => setPickedAsset(null)} aria-label="Use a different source" className="w-9 h-9 rounded-lg border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcX /></button>
          </div>
        ) : (
          <>
            {/* A real button, so it is reachable by keyboard and announced. It
                was a clickable div with an inline #fff background, which on the
                dark theme put near-white text on white: an invisible heading. */}
            <button
              type="button"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`w-full rounded-[20px] border border-dashed px-6 py-11 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${dragging ? "border-brand bg-tint-emerald" : "border-line bg-surface-2 hover:border-brand"}`}
            >
              <span className="w-12 h-12 rounded-2xl bg-tint-emerald text-brand flex items-center justify-center"><IcCloud /></span>
              <span className="text-base font-semibold text-fg">Drop a video here, or choose a file</span>
              <span className="text-[13px] text-fg-muted">MP4, MOV or WebM · up to 500 MB · 1 min to 1 h 30 m</span>
            </button>
            <div className="flex items-center justify-center gap-2.5 mt-4">
              <AssetField accept={["video"]} label="Choose from Assets" onSelect={(asset) => { handleClearFile(); setImportedUrl(null); setImportedTitle(null); setPickedAsset(asset); }} />
            </div>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-card-border" />
              <span className="text-xs font-semibold text-ink-soft/70 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-card-border" />
            </div>
            <UrlImportField onImported={(info) => { setImportedUrl(info.url); setImportedTitle(info.title); }} />
          </>
        )}

        {importError && <p role="alert" className="mt-3 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-medium text-error">{importError}</p>}
        {paymentBlock && (
          <div role="alert" className="mt-3 rounded-xl border border-warning/40 bg-tint-amber px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <p className="flex-1 min-w-[16rem] text-fg">
              {paymentBlock.kind === "free_limit"
                ? paymentBlock.message
                : `You need ${paymentBlock.required ?? "more"} credits to start this run${paymentBlock.balance != null ? ` and you have ${paymentBlock.balance}` : ""}. Nothing was charged.`}
            </p>
            {paymentBlock.kind === "free_limit" ? (
              <a href={paymentBlock.upgradeUrl} className="font-bold text-brand hover:underline">See plans</a>
            ) : (
              <Button size="sm" onClick={() => creditModal.open({ required: paymentBlock.required, balance: paymentBlock.balance, action: "Auto Clips" })}>Top up</Button>
            )}
            <button onClick={clearPaymentBlock} aria-label="Dismiss" className="text-fg-muted hover:text-fg"><IcX /></button>
          </div>
        )}

        {/* Essentials */}
        <div className="mt-8 rounded-[20px] border border-card-border bg-panel p-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-[13px] font-semibold text-ink block mb-2">Clip length</label>
              <div className="flex gap-1.5">
                {LENGTH_PRESETS.map((p) => (
                  <button key={p.id} onClick={() => { setMinDuration(p.min); setMaxDuration(p.max); }}
                    className={`flex-1 rounded-[10px] border py-2.5 text-[13px] font-semibold transition-colors ${lengthPreset === p.id ? "grad-brand text-on-primary shadow-glow border-transparent" : "bg-panel border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] font-semibold text-ink block mb-2">How many clips</label>
              <div className="flex items-center gap-3 border border-card-border rounded-[10px] px-3 py-1.5">
                <button onClick={() => setClipCount((c) => Math.max(1, c - 1))} aria-label="Fewer clips" className="w-8 h-8 rounded-lg border border-card-border text-ink hover:bg-tint-blue transition-colors">−</button>
                <span className="flex-1 text-center text-sm font-bold text-ink">{clipCount}</span>
                <button onClick={() => setClipCount((c) => Math.min(20, c + 1))} aria-label="More clips" className="w-8 h-8 rounded-lg border border-card-border text-ink hover:bg-tint-blue transition-colors">+</button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[13px] font-semibold text-ink block mb-2">Aspect ratio</label>
            <div className="flex gap-2">
              {ASPECTS.map((a) => (
                <button key={a.value} onClick={() => setAspectRatio(a.value)} className={`inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${aspectRatio === a.value ? "grad-brand text-on-primary shadow-glow border-transparent" : "bg-panel border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"}`}>
                  <span className={`${a.box} border-[1.5px] border-current rounded-[2px]`} />{a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[13px] font-semibold text-ink">Captions</p><p className="text-xs text-ink-soft mt-0.5">Burned in, word-by-word — style below.</p></div>
            <Switch checked={captionsOn} onChange={setCaptionsOn} label="Captions" />
          </div>
          {captionsOn && (
            <CaptionStyleGrid
              value={captionTemplateId}
              onChange={setCaptionTemplateId}
              onTemplatesLoaded={(list) =>
                setPremiumTemplateIds(new Set(list.filter((t) => t.requiresRender).map((t) => t.id)))
              }
            />
          )}

          <div className="h-px bg-card-border" />

          <button onClick={() => setAdvancedOpen((o) => !o)} className="flex items-center justify-between w-full text-left">
            <span className="flex flex-col"><span className="text-[13px] font-semibold text-ink">Advanced</span><span className="text-xs text-ink-soft">Reframe, camera motion, zoom, speaker mode, audio cleanup, instructions</span></span>
            <span className="text-[12px] font-semibold text-brand">{advancedOpen ? "Hide" : "Show"}</span>
          </button>
          {advancedOpen && (
            <div className="ac-panel-in flex flex-col gap-5 border-t border-card-border pt-5">
              <ReframeAndCutsControls
                smartAutoReframe={smartAutoReframe} setSmartAutoReframe={setSmartAutoReframe}
                reframingPreset={reframingPreset} setReframingPreset={setReframingPreset}
                zoomStrength={zoomStrength} setZoomStrength={setZoomStrength}
                speakerMode={speakerMode} setSpeakerMode={setSpeakerMode}
                smoothness={smoothness} setSmoothness={setSmoothness}
                trackingSpeed={trackingSpeed} setTrackingSpeed={setTrackingSpeed}
                removeSilence={removeSilence} setRemoveSilence={setRemoveSilence}
                silenceThresholdMs={silenceThresholdMs} setSilenceThresholdMs={setSilenceThresholdMs}
                removeFillers={removeFillers} setRemoveFillers={setRemoveFillers}
              />
              {captionsOn && (
                <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                  <div><p className="text-[12.5px] font-semibold text-ink">Animated subtitles</p><p className="text-[11px] text-ink-soft">Highlight words with dynamic sizes and colours like Opus Clip.</p></div>
                  <Switch checked={animatedCaptions} onChange={setAnimatedCaptions} label="Animated subtitles" />
                </div>
              )}
              <div>
                <label className="text-[12px] font-bold text-ink-soft uppercase tracking-wider block mb-2">Instructions (optional)</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={MAX_INSTRUCTIONS_CHARS} placeholder="e.g. Focus on funny moments, avoid silent parts, prioritize high-energy sections…" className="w-full rounded-xl border border-card-border bg-panel px-3 py-3 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-all resize-none" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-7 flex-wrap">
          <button onClick={handleGenerate} disabled={!canGenerate} className="inline-flex items-center gap-2.5 grad-brand shadow-glow hover:shadow-glow-hover hover:brightness-105 text-on-primary text-base font-bold px-8 py-4 rounded-[14px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <IcSparkle /> Generate clips
          </button>
          {/* There is no review step any more, so this is the LAST moment a
              price can be shown before money is spent. It has to be itemised
              and it has to be honest about the premium caption line, which is
              by far the largest number here. */}
          <div className="text-[13px] text-ink-soft">
            {runCost ? (
              <>
                <span className="font-semibold text-ink">
                  ~{runCost.total + 1} credit{runCost.total + 1 === 1 ? "" : "s"}
                </span>{" "}
                — analysis 1 · render {clipCount} clip{clipCount === 1 ? "" : "s"} {runCost.renderCredits}
                {runCost.captionCredits > 0 && <> · premium captions {runCost.captionCredits}</>}
                <span className="block text-[12px] mt-0.5">
                  Charged up front and rendered straight through. Unused credits are returned
                  once the real clip lengths are known, and all of it if the run fails.
                </span>
                {balance != null && (
                  <span className={`block text-[12px] mt-0.5 ${balance < runCost.total + 1 ? "text-warning font-semibold" : ""}`}>
                    Your balance: {balance} credit{balance === 1 ? "" : "s"}
                    {balance < runCost.total + 1 && " (not enough for this run)"}
                  </span>
                )}
              </>
            ) : (
              "Analysis costs 1 credit."
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AutoClipPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" /></div>}>
      <AutoClipFlow />
    </Suspense>
  );
}
