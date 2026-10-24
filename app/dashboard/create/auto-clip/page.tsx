"use client";
import { Suspense, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import CaptionStyleGrid from "@/app/components/auto-clip/CaptionStyleGrid";
import { ReframeAndCutsControls } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { discardDraftProject } from "@/lib/discard-draft-project";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { useBillingOverlay } from "@/app/components/billing/BillingOverlayContext";
import { UrlImportField } from "@/app/components/auto-clip/UrlImportField";
import { Switch } from "@/app/components/ui/Switch";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { Button } from "@/app/components/ui/Button";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useVideoGenerate, getStoredToken } from "@/app/hooks/useVideoGenerate";
import { indexForTemplateId, DEFAULT_TEMPLATE_ID } from "@/lib/captions/legacyStyleIndex";
import { estimateRunCost } from "@/lib/captions/runEstimate";
import { OVERFLOW_MINUTES_PER_CREDIT, overflowCreditsFor } from "@/lib/plans/tiers";
import { MAX_INSTRUCTIONS_CHARS } from "@/lib/autoclip-create-input";
import { IcFilm, IcCloud, IcFile, IcX, IcSparkle, apiFetch, ASPECTS } from "./_components/shared";
import { clipEditorHref, projectHref } from "@/lib/project-links";
import { sourceDurationError, sourceFileError } from "@/lib/autoclip-source";
import { FlowHeader, PresetCards, QuestionHeading, StepFooter, flowStyles as fs, type FlowStep, type Preset, type PresetId } from "./_components/FlowParts";

// Mirrors the limits printed on the drop zone (and enforced server-side).

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
  // Set by the Home launch box: a pasted link plus the presets picked beside
  // it. Read once as initial state — the form owns them after that.
  const launchUrl = params.get("url");
  const launchLength = LENGTH_PRESETS.find((p) => p.id === params.get("length"));
  const launchRatio = params.get("ratio");

  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [importedUrl, setImportedUrl] = useState<string | null>(null);
  const [importedTitle, setImportedTitle] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // A video reused from the Global Asset Library — already hosted on our S3,
  // so unlike importedUrl (a third-party link the URL-import route still has
  // to download) this only needs a project created with its URL, no import step.
  const [pickedAsset, setPickedAsset] = useState<PickerAsset | null>(null);

  const [minDuration, setMinDuration] = useState(launchLength?.min ?? 15);
  const [maxDuration, setMaxDuration] = useState(launchLength?.max ?? 60);
  const [clipCount, setClipCount] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(
    launchRatio === "16:9" || launchRatio === "1:1" ? launchRatio : "9:16",
  );
  const [instructions, setInstructions] = useState("");
  const [captionsOn, setCaptionsOn] = useState(params.get("captions") !== "0");
  // The caption style is a TEMPLATE ID, not an index into a colour table.
  // captionStyleIndex is still derived from it on the wire (see the create
  // bodies below) purely to keep the public v1 API contract working.
  const [captionTemplateId, setCaptionTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const captionStyleIndex = indexForTemplateId(captionTemplateId);

  // The caller's balances, shown beside Generate.
  const pricingQuery = useQuery({
    queryKey: ["auto-clip-pricing"],
    queryFn: () => apiFetch<{ balance: number; minutes: number }>("/api/generate/auto-clip"),
    staleTime: 60_000,
  });
  const balance = pricingQuery.data?.balance ?? null;
  const minutesBalance = pricingQuery.data?.minutes ?? null;

  // Source length, when it can be known before the run: read from the chosen
  // file's metadata, or the library asset's stored duration. A URL import
  // stays unknown until analysis, and the quote says so.
  // Keyed by the preview URL it was read from, so a stale reading can never
  // price a newly chosen file.
  const [fileDuration, setFileDuration] = useState<{ url: string; sec: number } | null>(null);
  // The chosen file's length once read, else a library asset's stored one. A
  // URL import stays null until analysis, and the quote says so.
  const sourceDurationSec: number | null = file
    ? (fileDuration && fileDuration.url === videoPreviewUrl ? fileDuration.sec : null)
    : (pickedAsset?.duration ?? null);
  // Opt-in: pay a minutes shortfall in AI credits instead of being refused.
  const [allowCreditOverflow, setAllowCreditOverflow] = useState(false);

  const runCost = useMemo(() => estimateRunCost({ sourceDurationSec }), [sourceDurationSec]);
  const minutesShort = runCost.minutes != null && minutesBalance != null ? Math.max(runCost.minutes - minutesBalance, 0) : 0;

  const [reframingPreset, setReframingPreset] = useState("balanced");
  const [removeSilence, setRemoveSilence] = useState(false);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState(400);
  const [removeFillers, setRemoveFillers] = useState(false);
  const [smartAutoReframe, setSmartAutoReframe] = useState(true);
  const [zoomStrength, setZoomStrength] = useState<"low" | "medium" | "high">("medium");
  const [speakerMode, setSpeakerMode] = useState<"auto" | "single" | "split" | "active">("auto");
  const [smoothness, setSmoothness] = useState(50);
  const [trackingSpeed, setTrackingSpeed] = useState(50);
  // Motion is part of each caption template now; kept on the wire for older clients.
  const animatedCaptions = true;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const {
    status: genStatus, error: genError, projectId: genProjectId, paymentBlock,
    generateAutoClip, generateAutoClipForProject, reset, clearPaymentBlock,
  } = useVideoGenerate();
  const creditModal = useInsufficientCredits();
  const { openBilling } = useBillingOverlay();

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
  // Also arrives as ?retry=<id>&name=<title> from "Try again" on a failed
  // project's clips page (/dashboard/projects/[id]).
  const [retryProject, setRetryProject] = useState<{ id: string; name: string | null } | null>(() => {
    const id = params.get("retry");
    return id ? { id, name: params.get("name") } : null;
  });

  // The moment a run starts, go to its project page, where its clips appear
  // as they're cut. Replace, not push: Back shouldn't land on a spent form.
  useEffect(() => {
    if ((genStatus === "rendering" || genStatus === "completed") && genProjectId) router.replace(projectHref(genProjectId));
  }, [genStatus, genProjectId, router]);

  // Old links (emails, notifications, bookmarks) put a run on this page as
  // ?project=<id>[&clip=<id>]. A project's clips live on its own page now.
  useEffect(() => {
    if (!resumeProjectId) return;
    router.replace(deepLinkClipId ? clipEditorHref(resumeProjectId, deepLinkClipId) : projectHref(resumeProjectId));
  }, [resumeProjectId, deepLinkClipId, router]);

  useEffect(() => { return () => { if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); }; }, [videoPreviewUrl]);

  // "Make clips with AutoClip" in the Assets library links here with
  // ?asset=<id>: start with that video already picked, exactly as if it had
  // been chosen through "Choose from Assets". Ignored when resuming a run.
  const deepLinkAssetId = params.get("asset");
  useEffect(() => {
    if (!deepLinkAssetId || resumeProjectId) return;
    let cancelled = false;
    apiFetch<{ asset: PickerAsset & { status?: string } }>(`/api/assets/${encodeURIComponent(deepLinkAssetId)}`)
      .then(({ asset }) => {
        if (cancelled || asset.kind !== "video") return;
        setPickedAsset(asset);
      })
      .catch(() => {
        if (!cancelled) setImportError("Couldn't load that video from your Assets. Pick it again below.");
      });
    return () => { cancelled = true; };
  }, [deepLinkAssetId, resumeProjectId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // One question at a time (design C). A retry already has its video and was
  // set up once, so it opens on the last step, ready to Generate.
  const [step, setStep] = useState<FlowStep>(() => (params.get("retry") ? 3 : 1));
  const [preset, setPreset] = useState<PresetId | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [step]);
  const applyPreset = useCallback((p: Preset) => {
    setPreset(p.id);
    if (!p.apply) return;
    const len = LENGTH_PRESETS.find((l) => l.id === p.apply!.length)!;
    setClipCount(p.apply.clipCount);
    setMinDuration(len.min); setMaxDuration(len.max);
    setSpeakerMode(p.apply.speakerMode);
  }, []);

  const handleFile = useCallback((f: File) => {
    // Checked here because a drop bypasses the input's `accept`, and the
    // server only said no after the whole upload had finished.
    const fileError = sourceFileError(f);
    if (fileError) { setImportError(fileError); return; }
    setImportError(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(f);
    setVideoPreviewUrl(URL.createObjectURL(f));
  }, [videoPreviewUrl]);

  const handleClearFile = useCallback(() => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(null);
    setVideoPreviewUrl(null);
  }, [videoPreviewUrl]);

  // Read a chosen file's length from its metadata (async, so it lands in state).
  useEffect(() => {
    if (!file || !videoPreviewUrl) return;
    const el = document.createElement("video");
    el.preload = "metadata";
    let live = true;
    el.onloadedmetadata = () => {
      if (live && Number.isFinite(el.duration)) setFileDuration({ url: videoPreviewUrl, sec: el.duration });
    };
    el.src = videoPreviewUrl;
    return () => { live = false; el.removeAttribute("src"); };
  }, [file, videoPreviewUrl]);

  // Length is only known once the file's metadata loads (effect above).
  const durationError = sourceDurationError(sourceDurationSec);

  // Covers the awaits before the status flips (project create, URL import):
  // the button showed nothing for those seconds, and a second click made a
  // second project and a second run.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const lengthPreset: LengthPreset = LENGTH_PRESETS.find((p) => p.min === minDuration && p.max === maxDuration)?.id ?? "standard";

  const runGenerate = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    const settings = {
      minDuration, maxDuration, clipCount, aspectRatio, instructions,
      captionStyleIndex: captionsOn ? captionStyleIndex : -1,
      captionTemplateId: captionsOn ? captionTemplateId : null,
      reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
      smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions,
      allowCreditOverflow,
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
  }, [file, retryProject, pickedAsset, importedUrl, importedTitle, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionsOn, captionStyleIndex, captionTemplateId, reframingPreset, removeSilence, silenceThresholdMs, removeFillers, smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions, allowCreditOverflow, generateAutoClip, generateAutoClipForProject]);

  const handleGenerate = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await runGenerate();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [runGenerate]);

  const handleReset = useCallback(() => {
    reset();
    handleClearFile();
    setImportedUrl(null); setImportedTitle(null); setImportError(null); setPickedAsset(null); setRetryProject(null);
    setMinDuration(15); setMaxDuration(60); setClipCount(8); setAspectRatio("9:16");
    setInstructions(""); setCaptionsOn(true); setCaptionTemplateId(DEFAULT_TEMPLATE_ID);
    setReframingPreset("balanced"); setRemoveSilence(false); setSilenceThresholdMs(400); setRemoveFillers(false);
    setSmartAutoReframe(true); setZoomStrength("medium"); setSpeakerMode("auto"); setSmoothness(50); setTrackingSpeed(50);
    setAdvancedOpen(false); setStep(1); setPreset(null);
    router.push("/dashboard/create/auto-clip");
  }, [reset, handleClearFile, router]);

  const canGenerate = (!!file || !!importedUrl || !!pickedAsset || !!retryProject) && !durationError && !submitting;

  // Between Generate and the run's project page: the upload, then the create
  // call. A run that fails before it has a project is said here, with its
  // reason; one that fails later is said on the project page.
  if (resumeProjectId || genStatus === "uploading" || genStatus === "creating" || genStatus === "rendering" || (genStatus === "completed" && genProjectId)) {
    const heading = resumeProjectId ? "Opening your project…" : genStatus === "uploading" ? "Uploading your video…" : "Starting your run…";
    return (
      <div className={`relative h-full overflow-hidden ${fs.page}`}>
        {!resumeProjectId && <span className={fs.topbar} aria-hidden="true" />}
        <span className={fs.orb} aria-hidden="true" />
        <div className="relative mx-auto max-w-xl px-6 pb-32 pt-24 text-center">
          <div className="relative mx-auto mb-8 w-[160px] overflow-hidden rounded-2xl" style={{ aspectRatio: "9/16", background: "linear-gradient(160deg, var(--surface-3), var(--bg))" }}>
            <div className="ac-shimmer absolute inset-0" />
          </div>
          <h1 className="mb-3 text-[32px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]"><span role="status" aria-live="polite">{heading}</span></h1>
          {!resumeProjectId && <p className="text-[15px] text-fg-muted">Keep this tab open until the upload finishes. After that you can leave.</p>}
        </div>
      </div>
    );
  }
  // "completed" with no project id has nothing to open either.
  if (genStatus === "failed" || genStatus === "completed") {
    return (
      <div className={`h-full overflow-y-auto ${fs.page}`}>
        <div className="mx-auto max-w-xl px-6 pb-32 pt-24 text-center">
          <h1 className="mb-2 text-[32px] font-bold tracking-[-0.03em] text-fg">Something went wrong</h1>
          <p className="mb-7 text-[15px] text-fg-muted">{genError ?? "We couldn't start this run. Try again."}</p>
          <Button variant="secondary" onClick={handleReset}>Start over</Button>
        </div>
      </div>
    );
  }

  const hasSource = !!file || !!importedUrl || !!pickedAsset || !!retryProject;
  const lengthLabel = LENGTH_PRESETS.find((p) => p.id === lengthPreset)?.label ?? "15–60s";
  const choiceSummary = `${clipCount} clip${clipCount === 1 ? "" : "s"} · ${lengthLabel} · ${aspectRatio} · ${captionsOn ? "captions on" : "no captions"}`;

  const sourceBlock = file && videoPreviewUrl ? (
    <div className="launch-sweep relative flex items-center gap-4 rounded-[20px] border border-line bg-surface-1 p-4">
      <video src={`${videoPreviewUrl}#t=0.1`} preload="metadata" muted playsInline className="w-28 rounded-xl bg-black object-cover" style={{ aspectRatio: "16/9" }} />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm font-semibold text-fg"><IcFile /><span className="truncate">{file.name}</span></div><p className="mt-0.5 text-xs text-fg-muted">Ready to analyze</p></div>
      <button onClick={handleClearFile} aria-label="Remove video" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><IcX /></button>
    </div>
  ) : importedUrl ? (
    <div className="launch-sweep relative flex items-center gap-4 rounded-[20px] border border-line bg-surface-1 p-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tint-emerald text-brand"><IcCloud /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{importedTitle}</p><p className="mt-0.5 text-xs text-fg-muted">Downloaded from your link when analysis starts.</p></div>
      <button onClick={() => { setImportedUrl(null); setImportedTitle(null); }} aria-label="Use a different source" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><IcX /></button>
    </div>
  ) : retryProject ? (
    <div className="launch-sweep relative flex items-center gap-4 rounded-[20px] border border-line bg-surface-1 p-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tint-emerald text-brand"><IcFilm /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{retryProject.name ?? "Your video"}</p>
        <p className="mt-0.5 text-xs text-fg-muted">Trying this video again. Adjust anything below, then Generate.</p>
      </div>
      <button onClick={() => { setRetryProject(null); setStep(1); }} aria-label="Use a different source" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><IcX /></button>
    </div>
  ) : pickedAsset ? (
    <div className="launch-sweep relative flex items-center gap-4 rounded-[20px] border border-line bg-surface-1 p-4">
      <video src={`${pickedAsset.url}#t=0.1`} preload="metadata" muted playsInline className="w-28 rounded-xl bg-black object-cover" style={{ aspectRatio: "16/9" }} />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm font-semibold text-fg"><IcFile /><span className="truncate">{pickedAsset.name}</span></div><p className="mt-0.5 text-xs text-fg-muted">From your Assets library</p></div>
      <button onClick={() => setPickedAsset(null)} aria-label="Use a different source" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><IcX /></button>
    </div>
  ) : null;

  const alerts = (
    <>
      {durationError && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-medium text-error">{durationError}</p>}
      {importError && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-medium text-error">{importError}</p>}
    </>
  );

  const SEG_ON = "border-primary/50 bg-primary/10 text-primary";
  const SEG_OFF = "border-line bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg";

  return (
    <div
      ref={scrollRef}
      className={`h-full overflow-y-auto ${fs.page} ${dragging && step === 1 ? fs.dropping : ""}`}
      onDragOver={step === 1 ? (e) => { e.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={step === 1 ? (e) => { if (e.currentTarget === e.target) setDragging(false); } : undefined}
      onDrop={step === 1 ? (e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); } : undefined}
    >
      <div className="flex min-h-full flex-col">
        <FlowHeader step={step} minutesBalance={minutesBalance} />
        <input ref={inputRef} type="file" accept="video/mp4,video/mov,video/quicktime,video/webm" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

        <main className="flex flex-1 flex-col items-center gap-9 px-6 pb-16 pt-10">
          {step === 1 && (
            <>
              <QuestionHeading step={1} before="What are we " accent="clipping" after=" today?" />
              <div className={`${fs.rise} flex w-full max-w-[760px] flex-col gap-3`} style={{ animationDelay: ".08s" }}>
                {sourceBlock ?? (
                  <>
                    {/* A real button, so it is reachable by keyboard and announced. */}
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-[24px] border border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${dragging ? "border-primary bg-tint-emerald" : "border-line-strong bg-surface-1 hover:border-primary/60"}`}
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary"><IcCloud /></span>
                      <span className="text-lg font-semibold text-fg">Drop a video anywhere, or choose a file</span>
                      <span className="text-[13px] text-fg-muted">MP4, MOV or WebM · up to 500 MB · 1 min to 1 h 30 m</span>
                    </button>
                    <div className="flex items-center justify-center gap-2.5">
                      <AssetField accept={["video"]} label="Choose from Assets" onSelect={(asset) => { handleClearFile(); setImportedUrl(null); setImportedTitle(null); setPickedAsset(asset); }} />
                    </div>
                    <div className="my-1 flex items-center gap-3">
                      <div className="h-px flex-1 bg-line" />
                      <span className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">or</span>
                      <div className="h-px flex-1 bg-line" />
                    </div>
                    <UrlImportField initialUrl={launchUrl ?? undefined} onImported={(info) => { setImportedUrl(info.url); setImportedTitle(info.title); }} />
                  </>
                )}
                {alerts}
              </div>
              <PresetCards value={preset} onChange={applyPreset} />
            </>
          )}

          {step === 2 && (
            <>
              <QuestionHeading step={2} before="How should it " accent="look" after="?" />
              <div className={`${fs.rise} flex w-full max-w-[760px] flex-col gap-6 rounded-[24px] border border-line bg-surface-1 p-6`} style={{ animationDelay: ".08s" }}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p id="ac-length-label" className="mb-2 block text-[13px] font-semibold text-fg">Clip length</p>
                    <div role="group" aria-labelledby="ac-length-label" className="flex gap-1.5">
                      {LENGTH_PRESETS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={lengthPreset === p.id} onClick={() => { setMinDuration(p.min); setMaxDuration(p.max); }}
                          className={`flex-1 rounded-[10px] border py-2.5 text-[13px] font-semibold transition-colors ${lengthPreset === p.id ? SEG_ON : SEG_OFF}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p id="ac-count-label" className="mb-2 block text-[13px] font-semibold text-fg">How many clips</p>
                    <div className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-1.5">
                      <button onClick={() => setClipCount((c) => Math.max(1, c - 1))} aria-label="Fewer clips" className="h-8 w-8 rounded-lg border border-line text-fg transition-colors hover:bg-surface-2">−</button>
                      <span className="flex-1 text-center text-sm font-bold text-fg tabular-nums" aria-live="polite" aria-labelledby="ac-count-label">{clipCount}</span>
                      <button onClick={() => setClipCount((c) => Math.min(20, c + 1))} aria-label="More clips" className="h-8 w-8 rounded-lg border border-line text-fg transition-colors hover:bg-surface-2">+</button>
                    </div>
                  </div>
                </div>

                <div>
                  <p id="ac-aspect-label" className="mb-2 block text-[13px] font-semibold text-fg">Aspect ratio</p>
                  <div role="group" aria-labelledby="ac-aspect-label" className="flex gap-2">
                    {ASPECTS.map((a) => (
                      <button key={a.value} type="button" aria-pressed={aspectRatio === a.value} onClick={() => setAspectRatio(a.value)} className={`inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${aspectRatio === a.value ? SEG_ON : SEG_OFF}`}>
                        <span className={`${a.box} rounded-[2px] border-[1.5px] border-current`} />{a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div><p className="text-[13px] font-semibold text-fg">Captions</p><p className="mt-0.5 text-xs text-fg-muted">Burned in, word-by-word — pick a style below.</p></div>
                  <Switch checked={captionsOn} onChange={setCaptionsOn} label="Captions" />
                </div>
                {captionsOn && (
                  <CaptionStyleGrid value={captionTemplateId} onChange={setCaptionTemplateId} />
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <QuestionHeading step={3} before="Ready to " accent="clip" after="?" />
              <div className={`${fs.rise} flex w-full max-w-[760px] flex-col gap-4`} style={{ animationDelay: ".08s" }}>
                {sourceBlock}
                <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-line bg-surface-1 px-4 py-3">
                  <span className="text-[13px] font-semibold text-fg">{choiceSummary}</span>
                  <button type="button" onClick={() => setStep(2)} className="ml-auto text-[13px] font-semibold text-primary hover:underline">Change</button>
                </div>
                {alerts}
                {paymentBlock && (
                  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-tint-amber px-4 py-3 text-sm">
                    <p className="min-w-[16rem] flex-1 text-fg">
                      {paymentBlock.kind === "free_limit"
                        ? paymentBlock.message
                        : paymentBlock.kind === "minutes"
                          ? `This video needs ${paymentBlock.required ?? "more"} Clip Minutes${paymentBlock.balance != null ? ` and you have ${paymentBlock.balance}` : ""}. Nothing was charged.${paymentBlock.overflowCredits ? ` Tick "pay the rest in AI credits" below to cover it with ${paymentBlock.overflowCredits} credit${paymentBlock.overflowCredits === 1 ? "" : "s"}.` : ""}`
                          : `You need ${paymentBlock.required ?? "more"} credits to start this run${paymentBlock.balance != null ? ` and you have ${paymentBlock.balance}` : ""}. Nothing was charged.`}
                    </p>
                    {paymentBlock.kind === "minutes" ? (
                      // Minute packs sell on the billing overlay's Top Up tab.
                      <Button size="sm" onClick={() => openBilling({ tab: "topup" })}>Top up minutes</Button>
                    ) : paymentBlock.kind === "free_limit" ? (
                      <a href={paymentBlock.upgradeUrl} className="font-bold text-brand hover:underline">See plans</a>
                    ) : (
                      <Button size="sm" onClick={() => creditModal.open({ required: paymentBlock.required, balance: paymentBlock.balance, action: "Auto Clips" })}>Top up</Button>
                    )}
                    <button onClick={clearPaymentBlock} aria-label="Dismiss" className="text-fg-muted hover:text-fg"><IcX /></button>
                  </div>
                )}

                <div className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface-1 p-5">
                  <button type="button" aria-expanded={advancedOpen} aria-controls="ac-advanced" onClick={() => setAdvancedOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
                    <span className="flex flex-col"><span className="text-[13px] font-semibold text-fg">Advanced</span><span className="text-xs text-fg-muted">Reframe, camera motion, zoom, speaker mode, audio cleanup, instructions</span></span>
                    <span className="text-[12px] font-semibold text-brand">{advancedOpen ? "Hide" : "Show"}</span>
                  </button>
                  {advancedOpen && (
                    <div id="ac-advanced" className="ac-panel-in flex flex-col gap-5 border-t border-line pt-5">
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
                      <div>
                        <label htmlFor="ac-instructions" className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-fg-muted">Instructions (optional)</label>
                        <textarea id="ac-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={MAX_INSTRUCTIONS_CHARS} placeholder="e.g. Focus on funny moments, avoid silent parts, prioritize high-energy sections…" className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-3 text-sm text-fg transition-all placeholder:text-fg-subtle focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>
                  )}
                </div>

                {/* There is no review step after this, so this is the LAST moment a
                    price can be shown before minutes are spent. */}
                <div className="rounded-[20px] border border-line bg-surface-1 p-5 text-[13px] text-fg-muted">
                  <span className="font-semibold text-fg">
                    {runCost.minutes != null
                      ? `Uses ${runCost.minutes} Clip Minute${runCost.minutes === 1 ? "" : "s"}`
                      : "Uses 1 Clip Minute per minute of video"}
                  </span>
                  <span className="mt-0.5 block text-[12px]">
                    Any number of clips from one video. Re-running the same video within 7 days is free,
                    and a failed run is refunded in full.
                  </span>
                  {minutesBalance != null && (
                    <span className={`mt-0.5 block text-[12px] ${minutesShort > 0 ? "font-semibold text-warning" : ""}`}>
                      Your balance: {minutesBalance} Clip Minute{minutesBalance === 1 ? "" : "s"}
                      {balance != null && <> · {balance} AI credit{balance === 1 ? "" : "s"}</>}
                      {minutesShort > 0 && ` (${minutesShort} short)`}
                    </span>
                  )}
                  <Checkbox
                    className="mt-1.5 text-[12px]"
                    checked={allowCreditOverflow}
                    onChange={setAllowCreditOverflow}
                    showLabel
                    label={`If I run out of minutes, pay the rest in AI credits (${OVERFLOW_MINUTES_PER_CREDIT} minutes = 1 credit${
                      minutesShort > 0 ? `, ${overflowCreditsFor(minutesShort)} credit${overflowCreditsFor(minutesShort) === 1 ? "" : "s"} for this video` : ""
                    })`}
                  />
                </div>
              </div>
            </>
          )}
        </main>

        {step === 1 && (
          <StepFooter hint={hasSource ? "Next: how should it look?" : "Add a video to continue"}>
            <Button onClick={() => setStep(2)} disabled={!hasSource || !!durationError}>Continue →</Button>
          </StepFooter>
        )}
        {step === 2 && (
          <StepFooter hint="Next: review and generate" onBack={() => setStep(1)}>
            <Button onClick={() => setStep(3)}>Continue →</Button>
          </StepFooter>
        )}
        {step === 3 && (
          <StepFooter hint={choiceSummary} onBack={() => setStep(2)}>
            <button onClick={handleGenerate} disabled={!canGenerate} aria-busy={submitting || undefined} className="inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40">
              <IcSparkle /> {submitting ? "Starting…" : "Generate clips"}
            </button>
          </StepFooter>
        )}
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
