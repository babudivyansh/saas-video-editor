"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef, useState, useEffect, useReducer, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { REFRAME_PRESETS, ZOOM_STRENGTHS, SPEAKER_MODES } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { PanelSection, PanelSlider, Segmented, useAccordion } from "@/app/components/auto-clip/PanelSection";
import { useMenuNav } from "@/app/components/ui/useMenuNav";
import { LiteEditTab, toLiteEdits, type LiteEdits } from "@/app/components/auto-clip/LiteEditTab";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { ClipCaptionPreview } from "@/app/components/auto-clip/ClipCaptionPreview";
import { fmtStamp, groupTranscriptLines, mediaPath, rebaseWords, renderWaitReducer, rerenderPriceLabel, type CropKeyframe } from "@/app/components/auto-clip/clipPanelLogic";
import { CaptionTemplatePicker, CaptionTweakControls, TranslateCaptions } from "@/app/components/auto-clip/CaptionTemplatePicker";
import { resolveCaptionTemplate, resolveTemplateId } from "@clipiro/shared/caption-templates";
import { templateIdForIndex } from "@/lib/captions/legacyStyleIndex";
import { Switch } from "@/app/components/ui/Switch";
import { hexToASS, assToHex } from "@/lib/ass-color";
import { RelatedRail, RelatedList, RelatedEmpty, RelatedLoading, SourceWindowBar, fmtDuration } from "@/app/components/related/RelatedContent";
import type { ClipRelated } from "@/lib/related-content";
import { IcChevronLeft, IcChevronRight, IcPlay, apiFetch, ClipItem, ScoreBreakdownWithInsights, InsightRow, scoreBand, arCss, ASPECTS } from "./shared";
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

  const derivedCount = derived.dubs.length + derived.publishes.length + derived.editorProjects.length;
  const section = useAccordion("siblings");

  return (
    <div className="space-y-2">
      <PanelSection
        title="Source video"
        summary={source ? (source.asset?.name ?? source.project.title) : "Not found"}
        {...section("source")}
      >
        {source ? (
          <div className="space-y-2.5">
            <p className="text-[11px] text-fg-muted">
              {source.project.clipCount} clip{source.project.clipCount === 1 ? "" : "s"} from this video
            </p>
            <SourceWindowBar
              startSec={source.window.startSec}
              endSec={source.window.endSec}
              sourceDurationSec={source.window.sourceDurationSec}
            />
          </div>
        ) : (
          <RelatedEmpty message="We couldn't trace this clip back to its source video." />
        )}
      </PanelSection>

      <PanelSection title="Other clips" summary={siblingClips.length > 0 ? String(siblingClips.length) : "None"} {...section("siblings")}>
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
      </PanelSection>

      <PanelSection title="Made from this clip" summary={hasDerived ? String(derivedCount) : "Nothing yet"} {...section("derived")}>
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
      </PanelSection>
    </div>
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

const ASPECT_NAMES: Record<string, string> = { "9:16": "9:16 vertical", "16:9": "16:9 landscape", "1:1": "1:1 square" };

/** A small drawing of each speaker layout, so the choice reads without the docs. */
function SpeakerGlyph({ mode, on }: { mode: SpeakerMode; on: boolean }) {
  const block = `flex-1 rounded-sm ${on ? "bg-emerald-bright/40" : "bg-surface-3"}`;
  return (
    <span aria-hidden className="relative flex h-10 flex-col gap-0.5 rounded-md bg-panel p-1">
      {mode === "auto" && <span className={`flex flex-1 items-center justify-center text-[10px] font-bold ${on ? "text-emerald-bright" : "text-fg-muted"}`}>AI picks</span>}
      {mode === "single" && <span className={block} />}
      {mode === "split" && <><span className={block} /><span className={block} /></>}
      {mode === "active" && <><span className={block} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-warning" /></>}
      {mode === "gaming" && <><span className="flex-[0.6] rounded-sm bg-fg-subtle" /><span className={block} /></>}
    </span>
  );
}

/**
 * The "More" tab: Transcript, Related and Publish in a menu, so the tab row
 * is one line instead of wrapping to two. When one of them is open it takes
 * More's place in the row. Its own small menu, not ui/Dropdown: that closes on
 * a document Escape listener, which would also close the whole workspace.
 */
function MoreTabsMenu({ items, active, onPick }: {
  items: { id: WorkspaceTab; label: string; desc: string }[];
  active: WorkspaceTab | null;
  onPick: (t: WorkspaceTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useMenuNav(menuRef, open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const current = items.find((i) => i.id === active);
  return (
    <div
      ref={wrapRef}
      className="relative"
      onKeyDown={(e) => {
        // preventDefault tells the workspace's own Esc handler to leave it alone.
        if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
      }}
    >
      <button
        ref={btnRef}
        type="button"
        id={current ? `ac-tab-${current.id}` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`-mb-px flex min-h-[42px] items-center gap-1 whitespace-nowrap border-b-2 text-[12.5px] font-semibold transition-colors ${current ? "border-emerald-bright text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
      >
        {current?.label ?? "More"}
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label="More clip tools" className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-line-strong bg-panel-raised p-1.5 shadow-xl">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              role="menuitem"
              onClick={() => { onPick(i.id); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-fg">{i.label}</span>
                <span className="block text-[11px] text-fg-muted">{i.desc}</span>
              </span>
              {i.id === active && <svg aria-label="Open" role="img" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-bright"><path d="M20 6 9 17l-5-5" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  // Design B accordions, one per tab (one section open at a time).
  const capSec = useAccordion("style");
  const rfSec = useAccordion("speakers");
  const inSec = useAccordion("why");
  const pubSec = useAccordion("post");
  const [openLine, setOpenLine] = useState<number | null>(null);

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

  // ── Draft, then render once ──────────────────────────────────────────────
  // Every change used to save AND re-render the clip by itself, so picking a
  // caption style, nudging a slider or fixing one word each cost a render (and
  // a slot of the 10-a-day fair-use cap). Changes are now a draft: the stage
  // previews what it can live (caption look, words, trim, framing), and one
  // "Render changes" sends the whole draft as a single re-render.
  const [renderWait, dispatchRenderWait] = useReducer(renderWaitReducer, { left: 0, path: null });
  const onCommitted = useCallback((r: { deferred: boolean }) => {
    dispatchRenderWait({ type: "committed", deferred: r.deferred });
    onChanged();
  }, [onChanged]);
  const clipPath = mediaPath(clip.videoUrl);
  useEffect(() => {
    dispatchRenderWait({ type: "clip", path: clipPath, status: clip.status });
  }, [clipPath, clip.status]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const override = (clip.subtitleStyleOverride as any) ?? {};
  // What the rendered file has: the saved row. The draft is compared with it.
  const savedCaptions: CaptionValues = {
    // The clip's template: its saved id (old ids resolve to their replacement),
    // else the one its legacy style index maps to.
    templateId: resolveTemplateId((override.templateId as string | undefined) ?? templateIdForIndex(clip.captionStyleIndex ?? 0)),
    accent: typeof override.accent === "string" ? override.accent : null,
    sizeScale: typeof override.sizeScale === "number" ? override.sizeScale : 1,
    // Only an explicit choice is saved; until then the template's own placement
    // (or, for centred templates, the face-aware default) applies.
    positionY: typeof override.positionY === "number" ? override.positionY : null,
    captionsOn: clip.hasCaptions,
  };
  const [templateId, setTemplateId] = useState<string>(savedCaptions.templateId);
  const template = resolveCaptionTemplate(templateId);
  const [accent, setAccent] = useState<string | null>(savedCaptions.accent);
  const [sizeScale, setSizeScale] = useState<number>(savedCaptions.sizeScale);
  const [positionY, setPositionY] = useState<number | null>(savedCaptions.positionY);
  const faceY = typeof override.captionPositionY === "number" ? override.captionPositionY : null;
  const shownPositionY = positionY ?? (template.placement.y === "low" ? 68 : template.placement.y === "high" ? 25 : Math.round(faceY ?? 50));
  // What the render will use: an explicit position, else face-aware for centred templates (clip-captions.ts).
  const renderPositionY = positionY ?? (template.placement.y === "mid" ? faceY : null);
  const [captionsOn, setCaptionsOn] = useState(savedCaptions.captionsOn);
  // Set when a render carrying a visible change starts; the stage keeps the
  // live preview up until that render lands.
  const [captionTouched, setCaptionTouched] = useState(false);

  interface CaptionValues { templateId: string; accent: string | null; sizeScale: number; positionY: number | null; captionsOn: boolean }
  const captionValues = (): CaptionValues => ({ templateId, accent, sizeScale, positionY, captionsOn });
  /** The whole caption style, explicitly — null clears a tweak (the server merges). */
  const styleBody = (v: CaptionValues) => ({ templateId: v.templateId, accent: v.accent, sizeScale: v.sizeScale, positionY: v.positionY });
  /** A caption change: draft only, shown on the live preview at once. */
  function commitCaptions(patch: Partial<CaptionValues>) {
    if (patch.templateId !== undefined) setTemplateId(patch.templateId);
    if ("accent" in patch) setAccent(patch.accent ?? null);
    if (patch.sizeScale !== undefined) setSizeScale(patch.sizeScale);
    if ("positionY" in patch) setPositionY(patch.positionY ?? null);
    if (patch.captionsOn !== undefined) setCaptionsOn(patch.captionsOn);
    setCopiedToAll("idle");
  }
  const captionsDirty = (Object.keys(savedCaptions) as (keyof CaptionValues)[]).some((k) => captionValues()[k] !== savedCaptions[k]);

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
    });
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
  const savedReframe = {
    removeSilence: (silence.removeSilence as boolean) ?? false,
    silenceThresholdMs: (silence.silenceThresholdMs as number) ?? 400,
    removeFillers: (silence.removeFillers as boolean) ?? false,
    reframingPreset: (silence.reframingPreset as string) ?? "balanced",
    smartAutoReframe: (silence.smartAutoReframe as boolean) ?? true,
    zoomStrength: (silence.zoomStrength as string) ?? "medium",
    speakerMode: (silence.speakerMode as string) ?? "auto",
    smoothness: (silence.smoothness as number) ?? 50,
    trackingSpeed: (silence.trackingSpeed as number) ?? 50,
  };
  const [reframe, setReframe] = useState(savedReframe);
  type ReframeState = typeof reframe;
  /** A reframe/audio setter: draft only. */
  function reframeSetter<K extends keyof ReframeState>(key: K) {
    return (value: ReframeState[K]) => setReframe((r) => ({ ...r, [key]: value }));
  }
  const reframeDirty = JSON.stringify(reframe) !== JSON.stringify(savedReframe);

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

  // Edit tab draft: the whole lite-edit state plus a trim relative to the
  // clip's window (null = whole clip). null until the tab changes something.
  const [liteDraft, setLiteDraft] = useState<{ edits: LiteEdits; trim: { startSec: number; endSec: number } | null } | null>(null);
  // Bumped by Discard so the Edit tab drops its own copy of the draft.
  const [liteKey, setLiteKey] = useState(0);
  const savedLite = clip.liteEdits;
  const savedLiteJson = JSON.stringify(toLiteEdits({
    speed: savedLite?.speed ?? 1,
    fadeIn: savedLite?.transition?.fadeInSec ?? 0,
    fadeOut: savedLite?.transition?.fadeOutSec ?? 0,
    music: savedLite?.music,
  }));
  const trimDraft = liteDraft?.trim ?? null;
  const liteDirty = !!liteDraft && (!!trimDraft || JSON.stringify(liteDraft.edits) !== savedLiteJson);
  function commitLiteEdits(edits: LiteEdits, trim: { startSec: number; endSec: number } | null) {
    setLiteDraft({ edits, trim });
  }

  const [aspectDraft, setAspectDraft] = useState<string>(clip.aspectRatio);
  const aspectDirty = aspectDraft !== clip.aspectRatio;

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
  const originalWords = detail?.transcriptJson ?? localWords;
  const transcriptLines = groupTranscriptLines(originalWords);
  const changedWords = localWords.reduce((n, w, i) => n + (w.word !== originalWords[i]?.word ? 1 : 0), 0);
  const transcriptDirty = changedWords > 0;

  const draftParts = [
    liteDirty && (trimDraft ? "trim" : "edits"), captionsDirty && "captions", reframeDirty && "reframe",
    aspectDirty && "format", transcriptDirty && "transcript",
  ].filter((x): x is string => !!x);
  const dirty = draftParts.length > 0;

  /** The whole draft as ONE re-render. Nothing is saved until this runs. */
  async function renderChanges() {
    const patch: Record<string, unknown> = {};
    if (captionsDirty) {
      patch.subtitleStyleOverride = styleBody(captionValues());
      patch.captionStyleIndex = captionsOn ? (clip.captionStyleIndex != null && clip.captionStyleIndex >= 0 ? clip.captionStyleIndex : 0) : -1;
    }
    if (reframeDirty) patch.silenceSettings = reframe;
    if (aspectDirty) patch.aspectRatio = aspectDraft;
    if (liteDirty && liteDraft) {
      patch.liteEdits = liteDraft.edits;
      if (trimDraft) { patch.startSec = clip.startSec + trimDraft.startSec; patch.endSec = clip.startSec + trimDraft.endSec; }
    }
    if (transcriptDirty) {
      // Sent words skip the server's own rebase onto a new trim, so do it here.
      patch.transcript = trimDraft ? rebaseWords(localWords, clip.startSec, clip.startSec + trimDraft.startSec, clip.startSec + trimDraft.endSec) : localWords;
    }
    setSaving(true); setSaveErr(null);
    try {
      const r = await apiFetch<{ status?: string }>(`/api/projects/${projectId}/clips/${clip.id}/rerender`, { method: "POST", body: JSON.stringify(patch) });
      if (captionsDirty || transcriptDirty || trimDraft || aspectDirty) setCaptionTouched(true);
      setLiteDraft(null);
      onCommitted({ deferred: r.status === "queued_next" });
      if (transcriptDirty || trimDraft) {
        // The row holds the new words now (saved before the render is queued);
        // edit from those, so the next draft starts clean.
        void transcriptQuery.refetch().then((res) => setLocalWords(res.data?.detail?.transcriptJson ?? []));
      }
    } catch (e: unknown) {
      // The draft stays as it was, so nothing is lost on a 402/429.
      setSaveErr(e instanceof Error ? e.message : "Couldn't start the render");
    } finally { setSaving(false); }
  }

  function discardChanges() {
    setTemplateId(savedCaptions.templateId); setAccent(savedCaptions.accent); setSizeScale(savedCaptions.sizeScale);
    setPositionY(savedCaptions.positionY); setCaptionsOn(savedCaptions.captionsOn);
    setReframe(savedReframe);
    setAspectDraft(clip.aspectRatio);
    setLocalWords(originalWords);
    setLiteDraft(null);
    setLiteKey((k) => k + 1);
    setSaveErr(null);
  }

  // Leaving with a draft asks first: Back, Esc, the clip arrows, a related clip.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const leave = (go: () => void) => { if (dirty) setPendingLeave(() => go); else go(); };
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  // Esc closes (asking first when there is a draft); Tab stays inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened on top (all caption styles, the plans page) portals
      // outside this one and handles its own Esc and Tab. Without this, Esc
      // there closed the whole workspace too.
      const host = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (host && host !== dialogRef.current) return;
      if (e.key === "Escape") {
        // Not while typing (Esc there dismisses autocomplete/IME, and closing
        // threw away half-typed caption and transcript edits), and not when an
        // inner menu already consumed it.
        const t = e.target as HTMLElement | null;
        const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (typing || e.defaultPrevented) return;
        if (dirty) setPendingLeave(() => onClose); else onClose();
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
  }, [onClose, dirty]);

  const renderingNow = isRendering || renderWait.left > 0;
  const renderPending = saving || renderingNow;
  const trimStartAbs = trimDraft ? clip.startSec + trimDraft.startSec : clip.startSec;
  const trimEndAbs = trimDraft ? clip.startSec + trimDraft.endSec : clip.endSec;
  const renderCarrying = captionTouched && (saving || renderingNow);
  const livePreview = captionsDirty || transcriptDirty || !!trimDraft || aspectDirty || renderCarrying;
  if (captionTouched && !saving && !renderingNow) {
    // The render with the change has landed: play it.
    setCaptionTouched(false);
    setPlaying(true);
  }
  const renderProgress = clip.status === "rendering" ? `Rendering… ${clip.progress}%` : "Queued to render…";
  const previewStatus = dirty ? "Preview · not rendered yet" : `Live preview · ${renderProgress.toLowerCase()}`;
  // One status line for the whole panel, in its footer.
  const footerStatus = saving
    ? "Starting the render…"
    : renderingNow
      ? clip.status === "rendering" ? "Rendering your changes…" : "Queued to render…"
      : dirty
        ? `Not rendered yet: ${draftParts.join(", ")}`
        : "Up to date";

  // Design B: the four tabs used on every clip stay in the row; the other
  // three sit under More. When one of those is open, More shows its name.
  const MAIN_TABS: { id: WorkspaceTab; label: string }[] = [
    { id: "edit", label: "Edit" }, { id: "captions", label: "Captions" },
    { id: "reframe", label: "Reframe" }, { id: "insights", label: "Insights" },
  ];
  const MORE_TABS: { id: WorkspaceTab; label: string; desc: string }[] = [
    { id: "transcript", label: "Transcript", desc: "Fix words in the captions" },
    { id: "related", label: "Related", desc: "Source video and other clips" },
    { id: "publish", label: "Publish", desc: "Post, schedule or dub" },
  ];
  const moreActive = MORE_TABS.find((t) => t.id === tab);

  const best = SUB_SCORES.filter((s): s is [string, number] => typeof s[1] === "number").sort((a, b) => b[1] - a[1])[0];
  const hookNotes = [bd?.hookExplanation, bd?.retentionPrediction, clip.brollQuery].filter(Boolean).length;


  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ac-workspace-title" className="fixed inset-0 z-50 ac-expand" style={{ background: "var(--surface)", transformOrigin: expandOrigin }}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="ac-rise h-[60px] flex-shrink-0 border-b border-card-border bg-panel flex items-center gap-3 px-4">
          <button data-autofocus onClick={() => leave(onClose)} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-card-border bg-panel text-ink text-[13px] font-semibold hover:bg-tint-blue transition-colors">
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
                    startSec={trimStartAbs}
                    endSec={trimEndAbs}
                    aspectCss={arCss(aspectDraft)}
                    cropKeyframes={aspectDirty || trimDraft ? null : detail?.cropKeyframes ?? null}
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
              <button aria-label="Previous clip" onClick={() => leave(onPrev)} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronLeft /></button>
              <span className="text-xs text-white/70 font-medium">Clip {index + 1} of {total}</span>
              <button aria-label="Next clip" onClick={() => leave(onNext)} disabled={total <= 1} className="w-9 h-9 rounded-lg border border-white/15 bg-white/[.08] text-white flex items-center justify-center disabled:opacity-30 hover:bg-white/15 transition-colors"><IcChevronRight /></button>
              {!panelOpen && (
                <button onClick={() => setPanelOpen(true)} className="absolute right-0 inline-flex items-center gap-2 min-h-[38px] px-4 rounded-lg border border-white/15 bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition-colors">Tools</button>
              )}
            </div>
          </div>

          {panelOpen && (
            <aside className="ac-tools-panel bg-panel flex flex-col">
              <div className="flex items-center gap-2 pl-4 pr-3 pt-3 pb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">Clip {index + 1} of {total}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-fg">{clip.title || `Clip ${clip.index + 1}`}</p>
                </div>
                <button onClick={() => setPanelOpen(false)} aria-label="Hide tools" className="w-8 h-8 rounded-lg border border-card-border bg-panel text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors flex items-center justify-center"><IcChevronRight /></button>
              </div>
              <div className="flex items-end gap-4 border-b border-card-border px-4">
                {/* Real tabs: role/aria-selected and arrow-key movement. */}
                <div
                  role="tablist"
                  aria-label="Clip tools"
                  className="flex gap-4"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const i = Math.max(0, MAIN_TABS.findIndex((t) => t.id === tab));
                    const next = MAIN_TABS[(i + (e.key === "ArrowRight" ? 1 : MAIN_TABS.length - 1)) % MAIN_TABS.length];
                    setTab(next.id);
                    (e.currentTarget.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus();
                  }}
                >
                  {MAIN_TABS.map((t) => (
                    <button key={t.id} data-tab={t.id} role="tab" id={`ac-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="ac-tab-panel" tabIndex={tab === t.id || (moreActive && t.id === "edit") ? 0 : -1} onClick={() => setTab(t.id)}
                      className={`-mb-px min-h-[42px] whitespace-nowrap border-b-2 text-[12.5px] font-semibold transition-colors ${tab === t.id ? "border-emerald-bright text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <MoreTabsMenu items={MORE_TABS} active={moreActive?.id ?? null} onPick={setTab} />
              </div>

              <div id="ac-tab-panel" role="tabpanel" aria-labelledby={`ac-tab-${tab}`} className="flex-1 overflow-y-auto p-5">
                {tab === "edit" && (
                  <div className="ac-panel-in">
                    <LiteEditTab
                      key={liteKey}
                      projectId={projectId}
                      clipId={clip.id}
                      windowSec={clip.endSec - clip.startSec}
                      peaks={clip.audioPeaks ?? []}
                      initial={clip.liteEdits}
                      error={null}
                      onCommit={commitLiteEdits}
                    />
                  </div>
                )}

                {tab === "captions" && (
                  <div className="ac-panel-in space-y-2">
                    <PanelSection title="Style" summary={template.name} {...capSec("style")}>
                      <CaptionTemplatePicker value={templateId} onChange={(id) => commitCaptions({ templateId: id })} />
                    </PanelSection>
                    <PanelSection title="Colour, size and position" summary={`${accent ?? "Template colour"} · ${Math.round(sizeScale * 100)}%`} {...capSec("tweaks")}>
                      <CaptionTweakControls
                        accent={accent}
                        templateAccent={template.colors.accent}
                        onAccentChange={(hex) => commitCaptions({ accent: hex })}
                        sizeScale={sizeScale}
                        onSizeScaleChange={(v) => commitCaptions({ sizeScale: v })}
                        positionY={shownPositionY}
                        onPositionYChange={(y) => commitCaptions({ positionY: y })}
                        otherClipCount={siblingClipIds.length}
                        onApplyToAll={() => void applyStyleToAll()}
                        applyToAllState={copiedToAll}
                      />
                    </PanelSection>
                    <PanelSection
                      title="Burn in"
                      summary={captionsOn ? "Baked into the file" : "No subtitles"}
                      trailing={<Switch checked={captionsOn} onChange={(on) => commitCaptions({ captionsOn: on })} label="Burn in captions" />}
                    />
                    <PanelSection title="Language" summary="Subtitles in another language" {...capSec("language")}>
                      <TranslateCaptions projectId={projectId} clipId={clip.id} disabled={renderPending} onQueued={() => onCommitted({ deferred: false })} />
                    </PanelSection>
                    <PanelSection title="Brand kit" summary={brandKits.length > 0 ? `${brandKits.length} saved` : "None saved"} {...capSec("kit")}>
                      {brandKits.length > 0 && (
                        <select aria-label="Load a brand kit" defaultValue="" onChange={(e) => { const kit = brandKits.find((k) => k.id === e.target.value); if (kit) applyBrandKit(kit); e.target.value = ""; }} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg">
                          <option value="" disabled>Use a saved style…</option>
                          {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => saveBrandKitMutation.mutate()}
                        disabled={saveBrandKitMutation.isPending}
                        className="w-full py-1 text-center text-xs font-semibold text-emerald-bright hover:underline disabled:opacity-50"
                      >
                        {saveBrandKitMutation.isPending
                          ? "Saving…"
                          : saveBrandKitMutation.isSuccess
                            ? `✓ Saved as “${saveBrandKitMutation.data.kit.name}”`
                            : `Save this style as a Brand Kit (“${kitName}”)`}
                      </button>
                      {saveBrandKitMutation.isError && <p className="text-[11px] text-error">{saveBrandKitMutation.error instanceof Error ? saveBrandKitMutation.error.message : "Couldn't save the brand kit"}</p>}
                    </PanelSection>
                  </div>
                )}

                {tab === "reframe" && (
                  <div className="ac-panel-in space-y-2">
                    <PanelSection title="Format" summary={ASPECT_NAMES[aspectDraft] ?? aspectDraft} {...rfSec("format")}>
                      <Segmented
                        label="Aspect ratio"
                        options={ASPECTS.map((a) => ({ value: a.value, label: <><span className={`${a.box} rounded-[2px] border-2 border-current`} />{a.label}</> }))}
                        value={aspectDraft as (typeof ASPECTS)[number]["value"]}
                        onChange={setAspectDraft}
                      />
                      <p className="text-[11px] text-fg-muted">The preview shows a centred crop; the render re-frames it properly.</p>
                    </PanelSection>
                    <PanelSection
                      title="Smart Auto Reframe"
                      summary={reframe.smartAutoReframe ? "Centres and zooms" : "Off"}
                      trailing={<Switch checked={reframe.smartAutoReframe} onChange={reframeSetter("smartAutoReframe")} label="Smart Auto Reframe" />}
                    />
                    {reframe.smartAutoReframe && (
                      <>
                        <PanelSection title="Who's on screen" summary={SPEAKER_MODES.find((m) => m.value === reframe.speakerMode)?.label} {...rfSec("speakers")}>
                          <div role="radiogroup" aria-label="Speaker mode" className="grid grid-cols-3 gap-2">
                            {SPEAKER_MODES.map((m) => {
                              const on = reframe.speakerMode === m.value;
                              return (
                                <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => { if (!on) reframeSetter("speakerMode")(m.value); }}
                                  className={`flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors ${on ? "border-tint-emerald-border bg-tint-emerald" : "border-line bg-bg hover:border-line-strong"}`}>
                                  <SpeakerGlyph mode={m.value} on={on} />
                                  <span className={`text-[12px] font-semibold ${on ? "text-emerald-bright" : "text-fg"}`}>{m.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </PanelSection>
                        <PanelSection
                          title="Camera feel"
                          summary={`${REFRAME_PRESETS.find((p) => p.value === reframe.reframingPreset)?.label ?? reframe.reframingPreset} · ${ZOOM_STRENGTHS.find((z) => z.value === reframe.zoomStrength)?.label ?? reframe.zoomStrength} zoom`}
                          {...rfSec("camera")}
                        >
                          <p className="text-[12px] text-fg-muted">Camera motion</p>
                          <Segmented label="Camera motion" options={REFRAME_PRESETS} value={reframe.reframingPreset} onChange={reframeSetter("reframingPreset")} />
                          <p className="text-[12px] text-fg-muted">Zoom strength</p>
                          <Segmented label="Zoom strength" options={ZOOM_STRENGTHS} value={reframe.zoomStrength} onChange={reframeSetter("zoomStrength")} />
                        </PanelSection>
                        <PanelSection title="Smoothness and tracking" summary={`${reframe.smoothness}% · ${reframe.trackingSpeed}%`} {...rfSec("motion")}>
                          <PanelSlider label="Smoothness" value={reframe.smoothness} display={`${reframe.smoothness}%`} min={0} max={100} step={5} onChange={reframeSetter("smoothness")} />
                          <PanelSlider label="Tracking speed" value={reframe.trackingSpeed} display={`${reframe.trackingSpeed}%`} min={0} max={100} step={5} onChange={reframeSetter("trackingSpeed")} />
                        </PanelSection>
                      </>
                    )}
                    <PanelSection
                      title="Silences and fillers"
                      summary={[reframe.removeSilence ? `Silences over ${reframe.silenceThresholdMs} ms cut` : "Silences kept", reframe.removeFillers ? "fillers cut" : null].filter(Boolean).join(" · ")}
                      {...rfSec("audio")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold text-fg">Remove silences</p>
                          <p className="text-[11px] text-fg-muted">Cuts silent gaps longer than the threshold.</p>
                        </div>
                        <Switch checked={reframe.removeSilence} onChange={reframeSetter("removeSilence")} label="Remove silences" />
                      </div>
                      {reframe.removeSilence && (
                        <PanelSlider label="Silence threshold" value={reframe.silenceThresholdMs} display={`${reframe.silenceThresholdMs} ms`} min={200} max={1000} step={50} onChange={reframeSetter("silenceThresholdMs")} />
                      )}
                      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                        <div>
                          <p className="text-[12px] font-semibold text-fg">Remove filler words</p>
                          <p className="text-[11px] text-fg-muted">Cuts words like &quot;um&quot;, &quot;uh&quot; and &quot;like&quot;.</p>
                        </div>
                        <Switch checked={reframe.removeFillers} onChange={reframeSetter("removeFillers")} label="Remove filler words" />
                      </div>
                    </PanelSection>
                  </div>
                )}

                {tab === "insights" && (
                  transcriptionFailed ? (
                    <div className="ac-panel-in rounded-xl border border-warning/40 bg-tint-amber p-4">
                      <h3 className="text-xs font-bold text-warning uppercase tracking-wider mb-1.5">Insights unavailable</h3>
                      <p className="text-sm text-fg leading-relaxed">This video couldn&apos;t be transcribed, so the AI never read its content. Virality scores and suggested captions would just be guesses, so they&apos;re hidden. Add a working transcription key and re-run the analysis to get genuine insights.</p>
                    </div>
                  ) : (
                    <div className="ac-panel-in space-y-2">
                      <div className="flex items-center gap-3 px-0.5 pb-2">
                        <span className="text-[28px] font-extrabold tabular-nums text-fg">{clip.score ?? "—"}</span>
                        <div>
                          <p className="text-[13px] font-semibold" style={{ color: band.text }}><span aria-hidden>{band.icon}</span> {band.label}</p>
                          <p className="text-[11.5px] text-fg-muted">Virality score out of 99</p>
                        </div>
                      </div>
                      <PanelSection title="Why it works" {...inSec("why")}>
                        {bd?.reasoning ? (
                          <p className="text-[12.5px] leading-relaxed text-fg-muted">{bd.reasoning}</p>
                        ) : (
                          <p className="text-[12.5px] italic leading-relaxed text-fg-subtle">The AI didn&apos;t return an explanation for this clip.</p>
                        )}
                      </PanelSection>
                      <PanelSection title="Score breakdown" summary={best ? `Best: ${best[0]} ${best[1]}` : undefined} {...inSec("scores")}>
                        <div className="grid grid-cols-2 gap-2">
                          {SUB_SCORES.map(([label, val]) => (
                            <div key={label} className="space-y-1.5 rounded-lg border border-line bg-bg px-2.5 py-2">
                              <div className="flex items-baseline justify-between">
                                <span className="text-[11px] font-semibold text-fg-muted">{label}</span>
                                <span className={`text-[13px] font-extrabold ${typeof val === "number" ? "text-fg" : "text-fg-subtle"}`}>{typeof val === "number" ? val : "—"}</span>
                              </div>
                              <div className="h-1 overflow-hidden rounded bg-surface-3">
                                <div className="h-full rounded bg-emerald-bright" style={{ width: `${typeof val === "number" ? Math.min(100, (val / 99) * 100) : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </PanelSection>
                      <PanelSection title="Audience and timing" summary={bd?.suggestedPostingTime ?? bd?.platform ?? undefined} {...inSec("audience")}>
                        <div className="space-y-2.5 text-[12.5px]">
                          <InsightRow label="Audience" value={bd?.audience} />
                          <div className="h-px bg-line" />
                          <InsightRow label="Platform fit" value={bd?.platform} />
                          <div className="h-px bg-line" />
                          <InsightRow label="Best time to post" value={bd?.suggestedPostingTime} />
                        </div>
                      </PanelSection>
                      {hookNotes > 0 && (
                        <PanelSection title="Hook and retention" summary={`${hookNotes} note${hookNotes === 1 ? "" : "s"}`} {...inSec("hook")}>
                          <div className="space-y-2.5 text-[12.5px]">
                            {bd?.hookExplanation && <InsightRow label="Why the hook works" value={bd.hookExplanation} />}
                            {bd?.retentionPrediction && <InsightRow label="Retention outlook" value={bd.retentionPrediction} />}
                            {clip.brollQuery && <InsightRow label="B-roll idea" value={clip.brollQuery} />}
                          </div>
                        </PanelSection>
                      )}
                      {hasPostCopy && (
                        <PanelSection
                          title="Suggested post copy"
                          trailing={<button type="button" onClick={() => void copySocial()} className="min-h-[30px] rounded-full border border-line px-3 text-[12px] font-semibold text-fg-muted hover:text-fg">{copied === "copied" ? "✓ Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}</button>}
                          {...inSec("copy")}
                        >
                          {caption && <p className="text-[12.5px] italic text-fg">&quot;{caption}&quot;</p>}
                          {bd?.hashtags && bd.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {bd.hashtags.map((h) => <span key={h} className="rounded-md bg-tint-emerald px-2 py-0.5 text-[10.5px] font-bold text-emerald-bright">{h}</span>)}
                            </div>
                          )}
                        </PanelSection>
                      )}
                    </div>
                  )
                )}

                {tab === "transcript" && (
                  <div className="ac-panel-in space-y-2">
                    <p className="text-[12px] text-fg-muted">Click a line to correct its words. The preview shows them at once; they go into the clip when you render.</p>
                    {transcriptLoading && <p className="text-xs text-fg-muted">Loading transcript…</p>}
                    {!transcriptLoading && localWords.length === 0 && (
                      <p className="text-xs text-fg-muted">No transcript for this clip — captions were off, or transcription didn&apos;t succeed for this video.</p>
                    )}
                    {transcriptLines.map((line, li) => {
                      const open = openLine === li;
                      const edited = line.some((i) => localWords[i] && localWords[i].word !== originalWords[i]?.word);
                      const startMs = localWords[line[0]]?.start ?? 0;
                      return (
                        <div key={li} className={`rounded-xl border bg-surface-1 ${open ? "border-line-strong" : "border-line"}`}>
                          <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : li)} className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-left">
                            <span className="w-11 shrink-0 font-mono text-[11px] text-fg-subtle">{fmtStamp(startMs)}</span>
                            <span className={`min-w-0 flex-1 text-[12.5px] text-fg ${open ? "font-semibold" : "truncate"}`}>{line.map((i) => localWords[i]?.word).join(" ")}</span>
                            {edited && <span role="img" aria-label="Edited" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-bright" />}
                          </button>
                          {open && (
                            <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                              {line.map((idx) => {
                                const w = localWords[idx];
                                if (!w) return null;
                                const changed = w.word !== originalWords[idx]?.word;
                                return (
                                  <div key={idx} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${changed ? "border-tint-emerald-border bg-tint-emerald" : "border-line bg-bg"}`}>
                                    {/* Sized to its content: a fixed width truncated any word
                                        longer than about six characters. */}
                                    <input
                                      type="text"
                                      value={w.word}
                                      aria-label={`Word at ${(w.start / 1000).toFixed(1)} seconds`}
                                      size={Math.max(3, Math.min(w.word.length + 1, 24))}
                                      onChange={(e) => { const next = [...localWords]; next[idx] = { ...next[idx], word: e.target.value }; setLocalWords(next); }}
                                      className="min-w-[2.5rem] max-w-[12rem] border-b border-transparent bg-transparent font-semibold text-fg focus:border-emerald-bright focus:outline-none"
                                    />
                                    <span className="font-mono text-[9px] text-fg-subtle">{(w.start / 1000).toFixed(1)}s</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {changedWords > 0 && (
                      <p className="pt-1 text-[11.5px] text-fg-muted">{changedWords} word{changedWords === 1 ? "" : "s"} changed.</p>
                    )}
                  </div>
                )}

                {tab === "related" && (
                  <div className="ac-panel-in space-y-2">
                    {relatedQuery.isLoading && <RelatedLoading />}
                    {relatedQuery.error && (
                      <p className="text-xs text-error">Couldn&apos;t load related content.</p>
                    )}
                    {relatedQuery.data && (
                      <RelatedForClip
                        related={relatedQuery.data.related}
                        onOpenSibling={(id) => leave(() => onOpenSibling(id))}
                      />
                    )}
                  </div>
                )}

                {tab === "publish" && (
                  <div className="ac-panel-in space-y-2">
                    <PanelSection title="Post or schedule" summary="Social accounts" {...pubSec("post")}>
                      <PublishPanel projectId={projectId} clip={clip} embedded />
                    </PanelSection>
                    {/* Open straight away when picked: it was a button that only revealed the language picker. */}
                    <PanelSection title="Dub" summary="A voiced copy in another language" {...pubSec("dub")}>
                      <DubPanel projectId={projectId} clip={clip} embedded />
                    </PanelSection>
                  </div>
                )}
              </div>

              <div className="border-t border-card-border">
                <div role="status" aria-live="polite" className="space-y-1.5 px-4 pt-3">
                  {saveErr && <p role="alert" className="text-[11.5px] font-semibold text-error">{saveErr}</p>}
                  <div className="flex items-center justify-between gap-3 text-[11.5px]">
                    <span className={dirty && !renderingNow && !saving ? "text-warning" : "text-fg-muted"}>{footerStatus}</span>
                    {clip.status === "rendering" && !saving && <span className="font-mono text-emerald-bright">{clip.progress}%</span>}
                  </div>
                  {renderingNow && !saving && (
                    <div className="h-[3px] overflow-hidden rounded bg-surface-3">
                      <div className="h-full rounded bg-emerald-bright transition-[width] duration-500" style={{ width: `${clip.status === "rendering" ? clip.progress : 0}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2.5 px-4 py-3">
                  {dirty ? (
                    <>
                      <button type="button" onClick={discardChanges} disabled={saving} className="min-h-[44px] px-4 rounded-xl border border-card-border bg-panel text-ink text-[12.5px] font-semibold hover:bg-tint-blue transition-colors disabled:opacity-50">Discard</button>
                      <button type="button" onClick={() => void renderChanges()} disabled={saving} className="flex-1 min-h-[44px] rounded-xl grad-brand text-on-primary text-[13.5px] font-bold shadow-glow flex items-center justify-center disabled:opacity-60">
                        {saving ? "Starting…" : `Render changes · ${priceLabel}`}
                      </button>
                    </>
                  ) : (
                    <>
                      <EditInEditorButton projectId={projectId} clip={clip} className="min-h-[44px] px-4 rounded-xl border border-card-border bg-panel text-ink text-[12.5px] font-semibold hover:bg-tint-blue transition-colors disabled:opacity-50" />
                      <DownloadLink href={`/api/projects/${projectId}/clips/${clip.id}/download`} pending={renderPending} className="flex-1 min-h-[44px] rounded-xl grad-brand text-on-primary text-[13.5px] font-bold shadow-glow flex items-center justify-center">Download clip</DownloadLink>
                    </>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingLeave}
        title="Leave without rendering?"
        message={`Your changes (${draftParts.join(", ")}) aren't rendered yet. Leave now and they're lost.`}
        confirmLabel="Leave without rendering"
        danger
        onConfirm={() => { const go = pendingLeave; setPendingLeave(null); go?.(); }}
        onClose={() => setPendingLeave(null)}
      />
    </div>
  );
}

