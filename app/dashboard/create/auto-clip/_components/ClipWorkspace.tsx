"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef, useState, useEffect, useReducer, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ReframeAndCutsControls } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { LiteEditTab, type LiteEdits } from "@/app/components/auto-clip/LiteEditTab";
import { ClipCaptionPreview } from "@/app/components/auto-clip/ClipCaptionPreview";
import { mediaPath, renderWaitReducer, rerenderPriceLabel, type CropKeyframe } from "@/app/components/auto-clip/clipPanelLogic";
import { useCommitQueue, type CommitQueueHandle } from "@/app/components/auto-clip/useCommitQueue";
import { CaptionTemplatePicker, CaptionTweakControls, TranslateCaptions } from "@/app/components/auto-clip/CaptionTemplatePicker";
import { resolveCaptionTemplate, resolveTemplateId } from "@clipiro/shared/caption-templates";
import { templateIdForIndex } from "@/lib/captions/legacyStyleIndex";
import { Switch } from "@/app/components/ui/Switch";
import { Button } from "@/app/components/ui/Button";
import { hexToASS, assToHex } from "@/lib/ass-color";
import { RelatedSection, RelatedRail, RelatedList, RelatedEmpty, RelatedLoading, SourceWindowBar, fmtDuration } from "@/app/components/related/RelatedContent";
import type { ClipRelated } from "@/lib/related-content";
import { IcChevronLeft, IcChevronRight, IcPlay, ApiError, apiFetch, ClipItem, ScoreBreakdownWithInsights, InsightRow, scoreBand, arCss, ASPECTS } from "./shared";
import { EditInEditorButton, DubPanel, PublishPanel } from "./ClipActions";
import type { SpeakerMode } from "@/lib/speaker-modes";

export type WorkspaceTab = "edit" | "captions" | "reframe" | "insights" | "transcript" | "publish" | "related";

// ── Related panel (clip workspace) ───────────────────────────────────────────
// The workspace previously showed a finished clip in total isolation: no source
// filename, no position in the source, no way back, and no acknowledgement that
// the other clips from the same run existed at all.
export function RelatedForClip({
  related,
  onOpenSibling,
}: {
  related: ClipRelated;
  onOpenSibling: (clipId: string) => void;
}) {
  const { source, siblingClips, derived } = related;
  const hasDerived =
    derived.dubs.length > 0 || derived.publishes.length > 0 || derived.editorProjects.length > 0;

  return (
    <>
      <RelatedSection title="From this source">
        {source ? (
          <div className="space-y-2.5 px-3 py-3 rounded-xl bg-surface">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink truncate">
                {source.asset?.name ?? source.project.title}
              </span>
              <span className="text-[10px] text-ink-soft/60 shrink-0">
                {source.project.clipCount} clip{source.project.clipCount === 1 ? "" : "s"}
              </span>
            </div>
            <SourceWindowBar
              startSec={source.window.startSec}
              endSec={source.window.endSec}
              sourceDurationSec={source.window.sourceDurationSec}
            />
          </div>
        ) : (
          <RelatedEmpty message="We couldn't trace this clip back to its source video." />
        )}
      </RelatedSection>

      <RelatedSection title="Other clips from this video" count={siblingClips.length}>
        {siblingClips.length > 0 ? (
          <RelatedRail
            items={siblingClips.map((c) => ({
              id: c.id,
              title: c.title || `Clip ${c.index + 1}`,
              meta: fmtDuration(c.durationSec),
              thumbnailUrl: c.thumbnailUrl,
              score: c.score,
              onClick: () => onOpenSibling(c.id),
            }))}
          />
        ) : (
          <RelatedEmpty message="This was the only clip from this video." />
        )}
      </RelatedSection>

      <RelatedSection title="Made from this clip">
        {hasDerived ? (
          <RelatedList
            items={[
              ...derived.editorProjects.map((p) => ({
                id: p.id,
                title: p.title,
                meta: "Editor project",
                href: `/dashboard/editor?projectId=${p.id}`,
              })),
              ...derived.dubs.map((d) => ({
                id: d.id,
                title: `Dubbed — ${d.targetLang.toUpperCase()}`,
                meta: d.status,
              })),
              ...derived.publishes.map((p) => ({
                id: p.id,
                title: p.provider ? `Published to ${p.provider}` : "Published",
                meta: p.status,
                href: p.permalink ?? undefined,
                external: true,
              })),
            ]}
          />
        ) : (
          <RelatedEmpty message="Nothing made from this clip yet — dub, publish or open it in the editor." />
        )}
      </RelatedSection>
    </>
  );
}

/**
 * Download, one click — except while the clip is re-rendering with a change
 * the user just made, when the file on the server is still the OLD version.
 * It said "Download" throughout and handed over the previous render.
 */
function DownloadLink({ href, pending, className, children }: { href: string; pending: boolean; className: string; children: React.ReactNode }) {
  if (pending) {
    return (
      <span role="link" aria-disabled="true" title="Your latest change is still rendering" className={`${className} opacity-60 cursor-wait`}>
        Rendering…
      </span>
    );
  }
  return <a href={href} download className={className}>{children}</a>;
}

// ── Clip Workspace (ready clips) — full-screen, video hero + contextual tools ─
export function ClipWorkspace({
  projectId, clip, transcriptionFailed, initialTab, expandOrigin,
  index, total, onPrev, onNext, onClose, onChanged, onOpenSibling, siblingClipIds = [],
}: {
  projectId: string; clip: ClipItem; transcriptionFailed: boolean;
  initialTab: WorkspaceTab; expandOrigin: string;
  index: number; total: number;
  onPrev: () => void; onNext: () => void;
  onClose: () => void; onChanged: () => void;
  /** Jump the workspace to another clip from the same run. */
  onOpenSibling: (clipId: string) => void;
  /** The OTHER clips in this run, for "apply this style to all" (§38). */
  siblingClipIds?: string[];
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [panelOpen, setPanelOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [detailOpen, setDetailOpen] = useState(false);

  // A modal dialog in behaviour, not just in looks. It covered the whole
  // page but focus stayed on the card behind it, Tab walked out into the
  // hidden grid, and closing dropped focus on <body>. Now focus moves in on
  // open, Tab cycles inside, Esc closes, and focus returns to what opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Not while typing (Esc there dismisses autocomplete/IME, and closing
        // threw away half-typed caption and transcript edits), and not when an
        // inner menu already consumed it.
        const t = e.target as HTMLElement | null;
        const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (typing || e.defaultPrevented) return;
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Brand kits (Captions tab). A kit is a caption template plus an accent
  // colour (stored in highlightColor, ASS byte order) and a logo.
  interface BrandKit {
    id: string; name: string;
    highlightColor: string | null;
    captionTemplateId: string | null;
  }
  const brandKitsQuery = useQuery({
    queryKey: ["brand-kits"],
    queryFn: () => apiFetch<{ kits: BrandKit[] }>("/api/brand-kits"),
  });
  const brandKits = brandKitsQuery.data?.kits ?? [];

  // ── One-click editing ────────────────────────────────────────────────────
  // Every control in this panel takes effect on its own: it saves and starts
  // the re-render. There used to be an Apply button at the foot of the
  // Captions, Reframe and Edit tabs, and a caption template did nothing
  // visible until it was pressed. Three queues (one per tab) debounce bursts
  // and send in order; a change that lands while the clip is rendering is
  // queued server-side and renders right after (lib/autoclip-rerender.ts).
  const [renderWait, dispatchRenderWait] = useReducer(renderWaitReducer, { left: 0, path: null });
  const onCommitted = useCallback((r: { deferred: boolean }) => {
    dispatchRenderWait({ type: "committed", deferred: r.deferred });
    onChanged();
  }, [onChanged]);
  const captionQ = useCommitQueue(onCommitted);
  const reframeQ = useCommitQueue(onCommitted);
  const editQ = useCommitQueue(onCommitted);
  const clipPath = mediaPath(clip.videoUrl);
  useEffect(() => {
    dispatchRenderWait({ type: "clip", path: clipPath, status: clip.status });
  }, [clipPath, clip.status]);
  const sendRender = async (url: string, method: "PUT" | "POST", body: unknown) => {
    const r = await apiFetch<{ status?: string }>(url, { method, body: JSON.stringify(body) });
    return { deferred: r.status === "queued_next" };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const override = (clip.subtitleStyleOverride as any) ?? {};
  // The clip's template: its saved id (old ids resolve to their replacement),
  // else the one its legacy style index maps to.
  const [templateId, setTemplateId] = useState<string>(() =>
    resolveTemplateId((override.templateId as string | undefined) ?? templateIdForIndex(clip.captionStyleIndex ?? 0)),
  );
  const template = resolveCaptionTemplate(templateId);
  const [accent, setAccent] = useState<string | null>(typeof override.accent === "string" ? override.accent : null);
  const [sizeScale, setSizeScale] = useState<number>(typeof override.sizeScale === "number" ? override.sizeScale : 1);
  // Only an explicit choice is saved; until then the template's own placement
  // (or, for centred templates, the face-aware default) applies.
  const [positionY, setPositionY] = useState<number | null>(typeof override.positionY === "number" ? override.positionY : null);
  const faceY = typeof override.captionPositionY === "number" ? override.captionPositionY : null;
  const shownPositionY = positionY ?? (template.placement.y === "low" ? 68 : template.placement.y === "high" ? 25 : Math.round(faceY ?? 50));
  // What the render will use: an explicit position, else face-aware for centred templates (clip-captions.ts).
  const renderPositionY = positionY ?? (template.placement.y === "mid" ? faceY : null);
  const [captionsOn, setCaptionsOn] = useState(clip.hasCaptions);
  // Set by any caption change; the stage shows the live preview until the
  // render carrying it lands.
  const [captionTouched, setCaptionTouched] = useState(false);

  interface CaptionValues { templateId: string; accent: string | null; sizeScale: number; positionY: number | null; captionsOn: boolean }
  const captionValues = (): CaptionValues => ({ templateId, accent, sizeScale, positionY, captionsOn });
  /** The whole caption style, explicitly — null clears a tweak (the server merges). */
  const styleBody = (v: CaptionValues) => ({ templateId: v.templateId, accent: v.accent, sizeScale: v.sizeScale, positionY: v.positionY });
  function commitCaptions(patch: Partial<CaptionValues>, delayMs: number) {
    const v = { ...captionValues(), ...patch };
    if (patch.templateId !== undefined) setTemplateId(v.templateId);
    if ("accent" in patch) setAccent(v.accent);
    if (patch.sizeScale !== undefined) setSizeScale(v.sizeScale);
    if ("positionY" in patch) setPositionY(v.positionY);
    if (patch.captionsOn !== undefined) setCaptionsOn(v.captionsOn);
    setCaptionTouched(true);
    setCopiedToAll("idle");
    const idx = v.captionsOn ? (clip.captionStyleIndex != null && clip.captionStyleIndex >= 0 ? clip.captionStyleIndex : 0) : -1;
    const url = `/api/projects/${projectId}/clips/${clip.id}/style`;
    captionQ.schedule(async () => {
      try {
        return await sendRender(url, "PUT", { captionStyleIndex: idx, subtitleStyleOverride: styleBody(v) });
      } catch (e) {
        // The daily fair-use cap on free re-renders: keep the pick anyway
        // (saving a style never renders or charges) and say what that means.
        if (e instanceof ApiError && e.status === 429 && /re-rendered this clip/i.test(e.message)) {
          await apiFetch(url, { method: "PUT", body: JSON.stringify({ subtitleStyleOverride: styleBody(v), render: false }) });
          throw new Error(`Style saved but not rendered: ${e.message} Downloads keep the previous version until it re-renders.`);
        }
        throw e;
      }
    }, delayMs);
  }

  // "Use on all": copies the STYLE to the sibling clips and nothing more. It
  // deliberately does not render them — re-rendering twenty clips nobody asked
  // to re-render would be a surprise; each picks the style up on its next
  // re-render. One click (it was a switch that waited for "Apply").
  const [copiedToAll, setCopiedToAll] = useState<"idle" | "saving" | "done" | "error">("idle");
  async function applyStyleToAll() {
    setCopiedToAll("saving");
    const results = await Promise.allSettled(
      siblingClipIds.map((id) =>
        apiFetch(`/api/projects/${projectId}/clips/${id}/style`, {
          method: "PUT",
          body: JSON.stringify({ subtitleStyleOverride: styleBody(captionValues()), render: false }),
        }),
      ),
    );
    setCopiedToAll(results.every((r) => r.status === "fulfilled") ? "done" : "error");
    onChanged();
  }

  function applyBrandKit(kit: BrandKit) {
    commitCaptions({
      ...(kit.captionTemplateId ? { templateId: resolveTemplateId(kit.captionTemplateId) } : {}),
      ...(kit.highlightColor ? { accent: assToHex(kit.highlightColor).toUpperCase() } : {}),
    }, 300);
  }
  // One click, named after what it holds; it used to open a name field with
  // its own Save and Cancel.
  const kitName = `${template.name}${accent ? ` · ${accent}` : ""}`;
  const saveBrandKitMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ kit: BrandKit }>("/api/brand-kits", {
        method: "POST",
        body: JSON.stringify({
          name: kitName.slice(0, 60),
          captionTemplateId: templateId,
          highlightColor: hexToASS(accent ?? template.colors.accent.slice(0, 7)),
        }),
      }),
    onSuccess: () => { brandKitsQuery.refetch(); },
  });

  // Audio cuts / reframe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const silence = (clip.silenceSettings as any) ?? {};
  const [reframe, setReframe] = useState(() => ({
    removeSilence: (silence.removeSilence as boolean) ?? false,
    silenceThresholdMs: (silence.silenceThresholdMs as number) ?? 400,
    removeFillers: (silence.removeFillers as boolean) ?? false,
    reframingPreset: (silence.reframingPreset as string) ?? "balanced",
    smartAutoReframe: (silence.smartAutoReframe as boolean) ?? true,
    zoomStrength: (silence.zoomStrength as string) ?? "medium",
    speakerMode: (silence.speakerMode as string) ?? "auto",
    smoothness: (silence.smoothness as number) ?? 50,
    trackingSpeed: (silence.trackingSpeed as number) ?? 50,
  }));
  type ReframeState = typeof reframe;
  /** A reframe/audio setter that also saves and re-renders. Sliders wait for the drag to settle. */
  function reframeSetter<K extends keyof ReframeState>(key: K, delayMs = 500) {
    return (value: ReframeState[K]) => {
      const next = { ...reframe, [key]: value };
      setReframe(next);
      reframeQ.schedule(
        () => sendRender(`/api/projects/${projectId}/clips/${clip.id}/style`, "PUT", { silenceSettings: next }),
        delayMs,
      );
    };
  }

  // Transcript (fetched on open — clips list omits transcriptJson).
  // `speaker` is carried even though nothing here renders it: the save
  // overwrites the stored transcript, so any field the client drops is gone
  // for good. Diarization is only produced at transcription time and cannot be
  // recovered by re-saving.
  interface WordTimingInfo { word: string; start: number; end: number; speaker?: string }
  const transcriptQuery = useQuery({
    queryKey: ["auto-clip-transcript", projectId, clip.id],
    queryFn: () => apiFetch<{
      project?: { uploadedVideoUrl: string | null };
      detail?: { transcriptJson: WordTimingInfo[] | null; cropKeyframes: CropKeyframe[] | null; rerenderCost: number };
    }>(`/api/projects/${projectId}/clips?clipId=${encodeURIComponent(clip.id)}`),
  });
  const detail = transcriptQuery.data?.detail;
  const sourceUrl = transcriptQuery.data?.project?.uploadedVideoUrl ?? null;
  const priceLabel = rerenderPriceLabel(clip.rerenderCount, detail ? detail.rerenderCost : null);
  const [localWords, setLocalWords] = useState<WordTimingInfo[]>([]);
  // Seed the editable draft once the fetch lands, then leave it alone — a
  // background refetch (e.g. window refocus) must not clobber in-progress
  // edits. ClipWorkspace is remounted (key={clip.id}) on every clip switch,
  // so this only ever needs to guard "seeded or not", not "seeded for which
  // clip" — a fresh instance already means a fresh, unseeded draft.
  const [transcriptSeeded, setTranscriptSeeded] = useState(false);
  if (transcriptQuery.data && !transcriptSeeded) {
    setTranscriptSeeded(true);
    setLocalWords(transcriptQuery.data.detail?.transcriptJson ?? []);
  }
  const transcriptLoading = transcriptQuery.isLoading;

  // Related content — the source this clip was cut from, its siblings, and
  // anything made from it since. Fetched only when the tab is opened.
  const relatedQuery = useQuery({
    queryKey: ["auto-clip-related", projectId, clip.id],
    queryFn: () => apiFetch<{ related: ClipRelated }>(`/api/projects/${projectId}/clips/${clip.id}/related`),
    enabled: tab === "related",
  });

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  /** Edit tab: absolute trim points are fixed NOW, against the window the user was looking at. */
  function commitLiteEdits(edits: LiteEdits, trim: { startSec: number; endSec: number } | null, delayMs: number) {
    const window = trim ? { startSec: clip.startSec + trim.startSec, endSec: clip.startSec + trim.endSec } : {};
    editQ.schedule(
      () => sendRender(`/api/projects/${projectId}/clips/${clip.id}/lite`, "PUT", { liteEdits: edits, ...window }),
      delayMs,
    );
  }

  /** Aspect ratio, transcript: already one click each; same wait-for-render bookkeeping. */
  async function oneShot(url: string, method: "PUT" | "POST", body: unknown) {
    setSaving(true); setSaveErr(null);
    try {
      onCommitted(await sendRender(url, method, body));
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleChangeAspect(aspectRatio: "9:16" | "16:9" | "1:1") {
    if (aspectRatio === clip.aspectRatio) return;
    await oneShot(`/api/projects/${projectId}/clips/${clip.id}/rerender`, "POST", { aspectRatio });
  }

  async function handleSaveTranscript() {
    // Corrected words show on the clip at once while the render runs.
    if (captionsOn) setCaptionTouched(true);
    await oneShot(`/api/projects/${projectId}/clips/${clip.id}/transcript`, "PUT", { transcript: localWords });
  }

  const bd = clip.scoreBreakdown as unknown as ScoreBreakdownWithInsights | null;
  // No invented copy. If the model produced nothing there is nothing to
  // suggest, and offering a generic "Check out this amazing clip!" as though
  // it were written for this video is worse than offering nothing at all.
  const caption = bd?.suggestedCaption ?? null;
  const hashtags = Array.isArray(bd?.hashtags) ? bd.hashtags.join(" ") : "";
  const hasPostCopy = !!caption || !!hashtags;
  // Awaited: it said "Copied!" even when the browser refused the write.
  async function copySocial() {
    try {
      await navigator.clipboard.writeText([caption, hashtags].filter(Boolean).join("\n\n"));
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  // Every sub-score the pipeline actually stores, including the three measured
  // post-render that this panel never showed.
  const SUB_SCORES: [string, number | undefined][] = [
    ["Hook", bd?.hook], ["Engagement", bd?.engagement],
    ["Pacing", bd?.pacing], ["Payoff", bd?.payoff],
    ["Audio", bd?.audio], ["Speech rate", bd?.speechRate],
    ["Silence", bd?.silence],
  ];

  const band = scoreBand(clip.score);
  const isRendering = clip.status === "rendering" || clip.status === "queued";
  // The file on screen (and the one Download gives) doesn't have the latest
  // change yet.
  const renderPending = captionQ.busy || reframeQ.busy || editQ.busy || saving || renderWait.left > 0 || isRendering;
  const livePreview = captionTouched && (captionQ.busy || renderWait.left > 0 || isRendering);
  if (captionTouched && !livePreview) {
    // The render with the new style has landed: play it.
    setCaptionTouched(false);
    setPlaying(true);
  }
  const renderProgress = clip.status === "rendering" ? `Rendering… ${clip.progress}%` : "Queued to render…";
  /** One status line per tab: saving, then rendering, then nothing. */
  function statusFor(q: CommitQueueHandle): string | null {
    if (q.status === "waiting" || q.status === "saving") return "Saving…";
    if (isRendering || renderWait.left > 0) return renderProgress;
    return null;
  }
  const previewStatus = captionQ.busy ? "Live preview · saving…" : `Live preview · ${renderProgress.toLowerCase()}`;
  const TABS: { id: WorkspaceTab; label: string }[] = [
    { id: "edit", label: "Edit" }, { id: "captions", label: "Captions" }, { id: "reframe", label: "Reframe" },
    { id: "insights", label: "Insights" }, { id: "transcript", label: "Transcript" },
    { id: "related", label: "Related" }, { id: "publish", label: "Publish" },
  ];
  const panelTitle: Record<WorkspaceTab, string> = { edit: "Edit", captions: "Captions", reframe: "Reframe & Audio", insights: "Insights", transcript: "Transcript", related: "Related", publish: "Publish" };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ac-workspace-title" className="fixed inset-0 z-50 ac-expand" style={{ background: "var(--surface)", transformOrigin: expandOrigin }}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="ac-rise h-[60px] flex-shrink-0 border-b border-card-border bg-panel flex items-center gap-3 px-4">
          <button data-autofocus onClick={onClose} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-card-border bg-panel text-ink text-[13px] font-semibold hover:bg-tint-blue transition-colors">
            <IcChevronLeft /> Back to clips
          </button>
          <div className="w-px h-6 bg-card-border" />
          <h2 id="ac-workspace-title" className="text-sm font-bold text-ink truncate max-w-[38ch]">{clip.title || `Clip ${clip.index + 1}`}</h2>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: band.bg, color: band.text }}>
            <span aria-hidden>{band.icon}</span>{band.label}
            {clip.score != null && <span className="opacity-60 tabular-nums" title="Virality score out of 99">{clip.score}</span>}
          </span>
          <div className="flex-1" />
          <span className="hidden md:block text-xs text-ink-soft/70">Esc to close</span>
          {/* Hidden on phones: the tools panel's footer has the same button,
              and two crowded a 375px header. */}
          <DownloadLink href={`/api/projects/${projectId}/clips/${clip.id}/download`} pending={renderPending} className="hidden md:inline-block text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-card-border bg-panel text-ink hover:bg-tint-blue transition-colors">Download</DownloadLink>
        </div>

        {/* Body: stage + tools panel */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bg)" }}>
          {clip.status === "failed" && (
            <div role="alert" className="absolute left-4 right-4 top-4 z-30 rounded-xl border border-error/40 bg-panel/95 px-4 py-3 text-[12.5px] text-fg">
              <span className="font-semibold text-error">Your last change didn&apos;t render.</span>{" "}
              {clip.failureReason ?? "Try it again."} The video shown is the previous version.
            </div>
          )}
          {isRendering && !livePreview && (
            <div role="status" aria-live="polite" className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-[3.5px] border-white/25 border-t-white rounded-full animate-spin" />
              <p className="text-sm font-semibold text-white">Applying changes…</p>
              <p className="text-xs text-white/60">{clip.status === "queued" ? "Queued" : `${clip.progress}% rendered`}</p>
            </div>
          )}
          <div className={panelOpen ? "ac-stage ac-stage-open" : "ac-stage"} style={{ padding: "20px 24px" }}>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="ac-pop relative h-full flex items-center justify-center">
                {livePreview ? (
                  <ClipCaptionPreview
                    sourceUrl={sourceUrl}
                    renderedUrl={clip.videoUrl}
                    startSec={clip.startSec}
                    endSec={clip.endSec}
                    aspectCss={arCss(clip.aspectRatio)}
                    cropKeyframes={detail?.cropKeyframes ?? null}
                    words={localWords}
                    template={template}
                    captionsOn={captionsOn}
                    accent={accent}
                    sizeScale={sizeScale}
                    positionY={renderPositionY}
                    status={previewStatus}
                  />
                ) : playing && clip.videoUrl ? (
                  <video src={clip.videoUrl} controls autoPlay className="h-full max-h-full rounded-2xl bg-black" style={{ aspectRatio: arCss(clip.aspectRatio) }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    aria-label={clip.videoUrl ? "Play clip" : "Clip preview (not rendered yet)"}
                    className="group relative h-full rounded-2xl overflow-hidden"
                    style={{ aspectRatio: arCss(clip.aspectRatio), background: "linear-gradient(160deg, var(--surface-3), var(--bg) 70%)", boxShadow: "0 24px 70px rgba(0,0,0,.5)" }}
                  >
                    {clip.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-16 h-16 rounded-full bg-fg/90 text-bg flex items-center justify-center group-hover:scale-105 transition-transform"><IcPlay /></span>
                    </span>
                  </button>
                )}
              </div>
            </div>
            {/* Clip navigation */}
            <div className="h-[52px] flex-shrink-0 flex items-center justify-center gap-2 relative">
              <button aria-label="Previous clip" onClick={onPrev} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronLeft /></button>
              <span className="text-xs text-white/70 font-medium">Clip {index + 1} of {total}</span>
              <button aria-label="Next clip" onClick={onNext} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronRight /></button>
              {!panelOpen && (
                <button onClick={() => setPanelOpen(true)} className="absolute right-0 inline-flex items-center gap-2 min-h-[38px] px-4 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition-colors">Tools</button>
              )}
            </div>
          </div>

          {panelOpen && (
            <aside className="ac-tools-panel bg-panel flex flex-col">
              <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 border-b border-card-border">
                <p className="flex-1 text-sm font-bold text-ink">{panelTitle[tab]}</p>
                <button onClick={() => setPanelOpen(false)} aria-label="Hide tools" className="w-8 h-8 rounded-lg border border-card-border bg-panel text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcChevronRight /></button>
              </div>
              {/* Real tabs: role/aria-selected and arrow-key movement, not
                  aria-current on a row of buttons. On phones they scroll in
                  one row instead of wrapping to three. */}
              <div
                role="tablist"
                aria-label="Clip tools"
                className="flex flex-nowrap md:flex-wrap overflow-x-auto gap-1 px-3 py-2.5 border-b border-card-border"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const i = TABS.findIndex((t) => t.id === tab);
                  const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                  setTab(next.id);
                  (e.currentTarget.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
                }}
              >
                {TABS.map((t) => (
                  <button key={t.id} data-tab={t.id} role="tab" id={`ac-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="ac-tab-panel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
                    className={`shrink-0 min-h-[36px] px-3 rounded-full text-[12.5px] font-bold transition-colors ${tab === t.id ? "bg-brand text-on-primary" : "text-fg-muted hover:bg-surface-3 hover:text-fg"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div id="ac-tab-panel" role="tabpanel" aria-labelledby={`ac-tab-${tab}`} className="flex-1 overflow-y-auto p-5">
                {tab === "edit" && (
                  <div className="ac-panel-in">
                    <LiteEditTab
                      projectId={projectId}
                      clipId={clip.id}
                      windowSec={clip.endSec - clip.startSec}
                      peaks={clip.audioPeaks ?? []}
                      initial={clip.liteEdits}
                      priceLabel={priceLabel}
                      statusText={statusFor(editQ)}
                      error={editQ.error}
                      onCommit={commitLiteEdits}
                    />
                  </div>
                )}

                {tab === "captions" && (
                  <div className="ac-panel-in space-y-5">
                    <p className="rounded-lg bg-surface px-3 py-2 text-[11px] text-ink-soft">
                      Click a style to see it on the clip straight away. It saves and re-renders by itself — <span className="font-semibold text-ink">{priceLabel}</span>.
                    </p>
                    {(captionQ.error || statusFor(captionQ)) && (
                      <p role={captionQ.error ? "alert" : "status"} aria-live="polite" className={`text-[11.5px] font-semibold ${captionQ.error ? "text-error" : "text-brand"}`}>
                        {captionQ.error ?? statusFor(captionQ)}
                      </p>
                    )}
                    <CaptionTemplatePicker value={templateId} onChange={(id) => commitCaptions({ templateId: id }, 600)} />

                    <CaptionTweakControls
                      accent={accent}
                      templateAccent={template.colors.accent}
                      onAccentChange={(hex) => commitCaptions({ accent: hex }, 900)}
                      sizeScale={sizeScale}
                      onSizeScaleChange={(v) => commitCaptions({ sizeScale: v }, 900)}
                      positionY={shownPositionY}
                      onPositionYChange={(y) => commitCaptions({ positionY: y }, 900)}
                      otherClipCount={siblingClipIds.length}
                      onApplyToAll={() => void applyStyleToAll()}
                      applyToAllState={copiedToAll}
                    />

                    <div className="space-y-2 rounded-xl border border-card-border p-3">
                      <p className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Brand kit</p>
                      {brandKits.length > 0 && (
                        <select aria-label="Load a brand kit" defaultValue="" onChange={(e) => { const kit = brandKits.find((k) => k.id === e.target.value); if (kit) applyBrandKit(kit); e.target.value = ""; }} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-panel">
                          <option value="" disabled>Use a saved style…</option>
                          {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => saveBrandKitMutation.mutate()}
                        disabled={saveBrandKitMutation.isPending}
                        className="w-full text-center text-xs font-semibold text-brand hover:underline py-1 disabled:opacity-50"
                      >
                        {saveBrandKitMutation.isPending
                          ? "Saving…"
                          : saveBrandKitMutation.isSuccess
                            ? `✓ Saved as “${saveBrandKitMutation.data.kit.name}”`
                            : `Save this style as a Brand Kit (“${kitName}”)`}
                      </button>
                      {saveBrandKitMutation.isError && <p className="text-[11px] text-error">{saveBrandKitMutation.error instanceof Error ? saveBrandKitMutation.error.message : "Couldn't save the brand kit"}</p>}
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                      <div className="pr-3">
                        <p className="text-[12.5px] font-semibold text-ink">Burn captions in</p>
                        <p className="text-[11px] text-ink-soft">{captionsOn ? "Baked into the exported file." : "This clip renders without subtitles."}</p>
                      </div>
                      <Switch checked={captionsOn} onChange={(on) => commitCaptions({ captionsOn: on }, 400)} label="Burn in captions" />
                    </div>
                    <TranslateCaptions projectId={projectId} clipId={clip.id} disabled={renderPending} onQueued={() => onCommitted({ deferred: false })} />
                  </div>
                )}

                {tab === "reframe" && (
                  <div className="ac-panel-in space-y-5">
                    <div>
                      <h3 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-1">Aspect ratio</h3>
                      <p className="text-[12.5px] text-ink-soft mb-2.5">Re-frames and re-renders this clip for a different placement.</p>
                      <div className="flex gap-1.5">
                        {ASPECTS.map((a) => (
                          <button
                            key={a.value}
                            type="button"
                            disabled={saving || a.value === clip.aspectRatio}
                            onClick={() => handleChangeAspect(a.value)}
                            className={`flex-1 flex items-center justify-center gap-1.5 min-h-[38px] rounded-xl text-[12px] font-bold transition-colors disabled:cursor-default ${
                              a.value === clip.aspectRatio
                                ? "grad-brand text-on-primary shadow-glow"
                                : "border border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
                            }`}
                          >
                            <span className={`${a.box} border-2 border-current rounded-[2px]`} />
                            {a.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-ink-soft text-center">One click re-frames and re-renders — {priceLabel}.</p>
                    </div>
                    <div className="h-px bg-card-border" />
                    <p className="rounded-lg bg-surface px-3 py-2 text-[11px] text-ink-soft">
                      Each setting below applies as you change it and re-renders the clip — <span className="font-semibold text-ink">{priceLabel}</span>.
                    </p>
                    <ReframeAndCutsControls
                      smartAutoReframe={reframe.smartAutoReframe} setSmartAutoReframe={reframeSetter("smartAutoReframe")}
                      reframingPreset={reframe.reframingPreset} setReframingPreset={reframeSetter("reframingPreset")}
                      zoomStrength={reframe.zoomStrength as "low" | "medium" | "high"} setZoomStrength={reframeSetter("zoomStrength")}
                      speakerMode={reframe.speakerMode as SpeakerMode} setSpeakerMode={reframeSetter("speakerMode")}
                      smoothness={reframe.smoothness} setSmoothness={reframeSetter("smoothness", 900)}
                      trackingSpeed={reframe.trackingSpeed} setTrackingSpeed={reframeSetter("trackingSpeed", 900)}
                      removeSilence={reframe.removeSilence} setRemoveSilence={reframeSetter("removeSilence")}
                      silenceThresholdMs={reframe.silenceThresholdMs} setSilenceThresholdMs={reframeSetter("silenceThresholdMs", 900)}
                      removeFillers={reframe.removeFillers} setRemoveFillers={reframeSetter("removeFillers")}
                    />
                    {(saveErr || reframeQ.error) && <p role="alert" className="text-xs text-error">{reframeQ.error ?? saveErr}</p>}
                    {statusFor(reframeQ) && <p role="status" aria-live="polite" className="text-[11px] text-ink-soft text-center">{statusFor(reframeQ)}</p>}
                  </div>
                )}

                {tab === "insights" && (
                  transcriptionFailed ? (
                    <div className="ac-panel-in rounded-xl border border-warning/40 bg-tint-amber p-4">
                      <h3 className="text-xs font-bold text-warning uppercase tracking-wider mb-1.5">Insights unavailable</h3>
                      <p className="text-sm text-fg leading-relaxed">This video couldn&apos;t be transcribed, so the AI never read its content. Virality scores and suggested captions would just be guesses, so they&apos;re hidden. Add a working transcription key and re-run the analysis to get genuine insights.</p>
                    </div>
                  ) : (
                    <div className="ac-panel-in space-y-4">
                      <div className="rounded-2xl p-4" style={{ background: band.bg, border: `1px solid ${band.border}` }}>
                        <p className="text-[12px] font-bold uppercase tracking-wider mb-1.5" style={{ color: band.text }}>
                          {band.icon} {band.label}
                          {clip.score != null && <span className="opacity-60 tabular-nums"> · {clip.score}/99</span>}
                        </p>
                        <p className="text-[13.5px] font-bold text-ink mb-1">Why this clip works</p>
                        {bd?.reasoning ? (
                          <p className="text-[12.5px] text-ink-soft leading-relaxed">{bd.reasoning}</p>
                        ) : (
                          <p className="text-[12.5px] text-ink-soft/60 italic leading-relaxed">The AI didn&apos;t return an explanation for this clip.</p>
                        )}
                      </div>
                      <button onClick={() => setDetailOpen((o) => !o)} className="flex items-center justify-between w-full">
                        <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Detailed insights</span>
                        <span className="text-[12px] font-semibold text-brand">{detailOpen ? "Hide" : "View"}</span>
                      </button>
                      {detailOpen && (
                        <div className="ac-panel-in space-y-4">
                          <div className="grid grid-cols-2 gap-2.5">
                            {SUB_SCORES.map(([label, val]) => (
                              <div key={label} className="rounded-xl border border-card-border px-3 py-2.5">
                                <span className="text-[11px] text-ink-soft font-semibold block">{label}</span>
                                {typeof val === "number" ? (
                                  <>
                                    <span className="text-base font-extrabold text-ink">{val}</span>
                                    <span className="text-[11px] text-ink-soft/60"> / 99</span>
                                  </>
                                ) : (
                                  <span className="text-base font-extrabold text-ink-soft/40">—</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2.5 text-[12.5px]">
                            <InsightRow label="Audience" value={bd?.audience} />
                            <div className="h-px bg-card-border" />
                            <InsightRow label="Platform fit" value={bd?.platform} />
                            <div className="h-px bg-card-border" />
                            <InsightRow label="Best time to post" value={bd?.suggestedPostingTime} />
                            {bd?.hookExplanation && (
                              <>
                                <div className="h-px bg-card-border" />
                                <InsightRow label="Why the hook works" value={bd.hookExplanation} />
                              </>
                            )}
                            {bd?.retentionPrediction && (
                              <>
                                <div className="h-px bg-card-border" />
                                <InsightRow label="Retention outlook" value={bd.retentionPrediction} />
                              </>
                            )}
                            {clip.brollQuery && (
                              <>
                                <div className="h-px bg-card-border" />
                                <InsightRow label="B-roll searched for" value={clip.brollQuery} />
                              </>
                            )}
                          </div>
                          {hasPostCopy && (
                          <div className="rounded-xl border border-dashed border-card-border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider">Suggested post copy</span>
                              <button onClick={() => void copySocial()} className="text-[12px] font-bold text-brand hover:underline">{copied === "copied" ? "✓ Copied!" : copied === "failed" ? "Couldn't copy" : "Copy"}</button>
                            </div>
                            {caption && <p className="text-[12.5px] text-ink italic">&quot;{caption}&quot;</p>}
                            {bd?.hashtags && bd.hashtags.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {bd.hashtags.map((h) => <span key={h} className="px-2 py-0.5 rounded-md text-[10.5px] font-bold" style={{ background: "var(--tint-emerald)", color: "var(--brand)" }}>{h}</span>)}
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}

                {tab === "transcript" && (
                  <div className="ac-panel-in space-y-4">
                    <p className="text-[12px] text-ink-soft">Click any word to correct spelling or formatting. Saving re-renders the clip&apos;s captions.</p>
                    <div className="flex flex-wrap gap-2 p-3 bg-surface rounded-xl border border-card-border max-h-72 overflow-y-auto">
                      {transcriptLoading && <p className="text-xs text-ink-soft">Loading transcript…</p>}
                      {!transcriptLoading && localWords.length === 0 && (
                        <p className="text-xs text-ink-soft">No transcript for this clip — captions were off, or transcription didn&apos;t succeed for this video.</p>
                      )}
                      {localWords.map((w, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-panel px-2 py-1 rounded-md border border-card-border shadow-sm text-xs">
                          {/* Sized to its content instead of a fixed w-16, which truncated any word
                              longer than about six characters — in a field whose entire
                              purpose is reading and correcting words. */}
                          <input
                            type="text"
                            value={w.word}
                            size={Math.max(3, Math.min(w.word.length + 1, 24))}
                            onChange={(e) => { const next = [...localWords]; next[idx] = { ...next[idx], word: e.target.value }; setLocalWords(next); }}
                            className="min-w-[2.5rem] max-w-[12rem] bg-transparent focus:outline-none border-b border-transparent focus:border-brand font-semibold"
                          />
                          <span className="text-[9px] text-ink-soft/60 font-mono">{(w.start / 1000).toFixed(1)}s</span>
                        </div>
                      ))}
                    </div>
                    {saveErr && <p className="text-xs text-error">{saveErr}</p>}
                    <Button onClick={handleSaveTranscript} disabled={saving || transcriptLoading || localWords.length === 0} className="w-full">{saving ? "Saving…" : `Save transcript changes (re-renders — ${priceLabel})`}</Button>
                    {(isRendering || renderWait.left > 0) && <p role="status" aria-live="polite" className="text-[11px] text-ink-soft text-center">{renderProgress}</p>}
                  </div>
                )}

                {tab === "related" && (
                  <div className="ac-panel-in space-y-5">
                    {relatedQuery.isLoading && <RelatedLoading />}
                    {relatedQuery.error && (
                      <p className="text-xs text-error">Couldn&apos;t load related content.</p>
                    )}
                    {relatedQuery.data && (
                      <RelatedForClip
                        related={relatedQuery.data.related}
                        onOpenSibling={onOpenSibling}
                      />
                    )}
                  </div>
                )}

                {tab === "publish" && (
                  <div className="ac-panel-in space-y-4">
                    <PublishPanel projectId={projectId} clip={clip} embedded />
                    <div className="pt-1 border-t border-card-border">
                      {/* Open straight away: it was a "Dub into another language" button
                          that only revealed the language picker. */}
                      <DubPanel projectId={projectId} clip={clip} embedded />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-card-border px-5 py-3.5 flex items-center gap-2.5">
                <EditInEditorButton projectId={projectId} clip={clip} className="min-h-[44px] px-4 rounded-xl border border-card-border bg-panel text-ink text-[12.5px] font-semibold hover:bg-tint-blue transition-colors disabled:opacity-50" />
                <DownloadLink href={`/api/projects/${projectId}/clips/${clip.id}/download`} pending={renderPending} className="flex-1 min-h-[44px] rounded-xl grad-brand text-on-primary text-[13.5px] font-bold shadow-glow flex items-center justify-center">Download clip</DownloadLink>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

