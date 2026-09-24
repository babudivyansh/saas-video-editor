"use client";
// Split out of ../page.tsx (stage 7 of the AutoClip audit) — moved, not rewritten.
import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ReframeAndCutsControls } from "@/app/components/auto-clip/ReframeAndCutsControls";
import { LiteEditTab, type LiteEdits } from "@/app/components/auto-clip/LiteEditTab";
import { CaptionTemplatePicker, CaptionRenderControls, TranslateCaptions } from "@/app/components/auto-clip/CaptionTemplatePicker";
import { CAPTION_TEMPLATES } from "@/lib/caption-templates";
import { Switch } from "@/app/components/ui/Switch";
import { Button } from "@/app/components/ui/Button";
import { hexToASS, assToHex } from "@/lib/ass-color";
import { RelatedSection, RelatedRail, RelatedList, RelatedEmpty, RelatedLoading, SourceWindowBar, fmtDuration } from "@/app/components/related/RelatedContent";
import type { ClipRelated } from "@/lib/related-content";
import { IcChevronLeft, IcChevronRight, IcPlay, apiFetch, ClipItem, ScoreBreakdownWithInsights, InsightRow, RerenderCostNote, scoreBand, arCss, ASPECTS } from "./shared";
import { EditInEditorButton, DubPanel, PublishPanel } from "./ClipActions";

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
  const [copied, setCopied] = useState(false);
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
      if (e.key === "Escape") { onClose(); return; }
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

  // Brand kits (Captions tab).
  interface BrandKit {
    id: string; name: string;
    fontName: string | null; fontSize: number | null;
    baseColor: string | null; highlightColor: string | null; outlineColor: string | null; shadowColor: string | null;
    outlineWidth: number | null; shadowDepth: number | null; borderStyle: number | null; alignment: number | null;
    animated: boolean | null;
    /** Clipiro caption-template slug, so a kit can carry a premium look. */
    captionTemplateId: string | null;
  }
  const brandKitsQuery = useQuery({
    queryKey: ["brand-kits"],
    queryFn: () => apiFetch<{ kits: BrandKit[] }>("/api/brand-kits"),
  });
  const brandKits = brandKitsQuery.data?.kits ?? [];
  const [namingKit, setNamingKit] = useState(false);
  const [newKitName, setNewKitName] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const override = (clip.subtitleStyleOverride as any) ?? {};
  const [fontName, setFontName] = useState((override.fontName as string) ?? "Outfit");
  const [fontSize, setFontSize] = useState((override.fontSize as number) ?? 80);
  const [baseColor, setBaseColor] = useState(assToHex((override.baseColor as string) ?? "&H00FFFFFF"));
  const [highlightColor, setHighlightColor] = useState(assToHex((override.highlightColor as string) ?? "&H0000FFFF"));
  const [outlineColor, setOutlineColor] = useState(assToHex((override.outlineColor as string) ?? "&H00000000"));
  const [shadowColor, setShadowColor] = useState(assToHex((override.shadowColor as string) ?? "&H00000000"));
  const [outlineWidth, setOutlineWidth] = useState((override.outlineWidth as number) ?? 8);
  const [shadowDepth, setShadowDepth] = useState((override.shadowDepth as number) ?? 0);
  const [borderStyle, setBorderStyle] = useState((override.borderStyle as number) ?? 1);
  const [alignment, setAlignment] = useState((override.alignment as number) ?? 5);
  const [animatedCaptions, setAnimatedCaptions] = useState((override.animated as boolean) ?? true);
  const [templateId, setTemplateId] = useState<string | null>((override.templateId as string) ?? null);
  const [captionsOn, setCaptionsOn] = useState(clip.hasCaptions);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Premium (provider-rendered) caption settings. Stored in the same
  // subtitleStyleOverride blob as everything else on this panel, so they
  // survive a reload and are picked up by the render request without another
  // column on Clip.
  const [captionPositionY, setCaptionPositionY] = useState((override.captionPositionY as number) ?? 65);
  const [hookEnabled, setHookEnabled] = useState((override.hook as { enabled?: boolean } | null)?.enabled ?? false);
  const [hookText, setHookText] = useState((override.hook as { text?: string } | null)?.text ?? "");
  const [applyToAll, setApplyToAll] = useState(false);

  // Whether the CHOSEN style is provider-rendered. Drives whether the premium
  // controls appear at all — position/hook mean nothing to the native ASS
  // renderer, and showing dead controls is worse than hiding them.
  const isPremiumTemplate = Boolean(
    templateId && CAPTION_TEMPLATES.find((t) => t.id === templateId)?.provider === "submagic",
  );

  async function suggestHooks(): Promise<string[]> {
    const res = await apiFetch<{ candidates: { text: string }[] }>(
      `/api/projects/${projectId}/clips/${clip.id}/captions/hooks`,
      { method: "POST", body: "{}" },
    );
    return (res.candidates ?? []).map((c) => c.text);
  }

  function applyBrandKit(kit: BrandKit) {
    if (kit.fontName != null) setFontName(kit.fontName);
    if (kit.fontSize != null) setFontSize(kit.fontSize);
    if (kit.baseColor != null) setBaseColor(assToHex(kit.baseColor));
    if (kit.highlightColor != null) setHighlightColor(assToHex(kit.highlightColor));
    if (kit.outlineColor != null) setOutlineColor(assToHex(kit.outlineColor));
    if (kit.shadowColor != null) setShadowColor(assToHex(kit.shadowColor));
    if (kit.outlineWidth != null) setOutlineWidth(kit.outlineWidth);
    if (kit.shadowDepth != null) setShadowDepth(kit.shadowDepth);
    if (kit.borderStyle != null) setBorderStyle(kit.borderStyle);
    if (kit.alignment != null) setAlignment(kit.alignment);
    if (kit.animated != null) setAnimatedCaptions(kit.animated);
    // Restore the saved LOOK too, not just its ASS field values — otherwise
    // loading a kit that was saved on a premium style silently drops back to
    // the native renderer while looking approximately right.
    if (kit.captionTemplateId != null) setTemplateId(kit.captionTemplateId);
  }
  const saveBrandKitMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ kit: BrandKit }>("/api/brand-kits", {
        method: "POST",
        body: JSON.stringify({
          name: newKitName.trim(),
          fontName, fontSize,
          baseColor: hexToASS(baseColor), highlightColor: hexToASS(highlightColor),
          outlineColor: hexToASS(outlineColor), shadowColor: hexToASS(shadowColor),
          outlineWidth, shadowDepth, borderStyle, alignment, animated: animatedCaptions,
          // Save the chosen look alongside its field values, so a kit saved on
          // a premium style comes back as that style rather than as a native
          // approximation of it.
          captionTemplateId: templateId,
        }),
      }),
    onSuccess: () => {
      setNamingKit(false);
      setNewKitName("");
      brandKitsQuery.refetch();
    },
  });
  function handleSaveBrandKit() {
    if (!newKitName.trim()) return;
    saveBrandKitMutation.mutate();
  }

  // Audio cuts / reframe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const silence = (clip.silenceSettings as any) ?? {};
  const [removeSilence, setRemoveSilence] = useState((silence.removeSilence as boolean) ?? false);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState((silence.silenceThresholdMs as number) ?? 400);
  const [removeFillers, setRemoveFillers] = useState((silence.removeFillers as boolean) ?? false);
  const [reframingPreset, setReframingPreset] = useState((silence.reframingPreset as string) ?? "balanced");
  const [smartAutoReframe, setSmartAutoReframe] = useState((silence.smartAutoReframe as boolean) ?? true);
  const [zoomStrength, setZoomStrength] = useState((silence.zoomStrength as string) ?? "medium");
  const [speakerMode, setSpeakerMode] = useState((silence.speakerMode as string) ?? "auto");
  const [smoothness, setSmoothness] = useState((silence.smoothness as number) ?? 50);
  const [trackingSpeed, setTrackingSpeed] = useState((silence.trackingSpeed as number) ?? 50);

  // Transcript (fetched on open — clips list omits transcriptJson).
  // `speaker` is carried even though nothing here renders it: the save
  // overwrites the stored transcript, so any field the client drops is gone
  // for good. Diarization is only produced at transcription time and cannot be
  // recovered by re-saving.
  interface WordTimingInfo { word: string; start: number; end: number; speaker?: string }
  const transcriptQuery = useQuery({
    queryKey: ["auto-clip-transcript", projectId, clip.id],
    queryFn: () => apiFetch<{ detail?: { transcriptJson: WordTimingInfo[] | null } }>(`/api/projects/${projectId}/clips?clipId=${encodeURIComponent(clip.id)}`),
  });
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

  async function handleSaveStyleOrCuts() {
    setSaving(true); setSaveErr(null);
    try {
      const subtitleStyleOverride = {
        ...(templateId ? { templateId } : {}),
        fontName, fontSize,
        baseColor: hexToASS(baseColor), highlightColor: hexToASS(highlightColor),
        outlineColor: hexToASS(outlineColor), shadowColor: hexToASS(shadowColor),
        outlineWidth, shadowDepth, borderStyle, alignment, animated: animatedCaptions,
        // Premium-only, and only written when the chosen style actually uses a
        // provider — otherwise these would sit in the blob confusing the next
        // person to read it.
        ...(isPremiumTemplate
          ? {
              captionPositionY,
              hook: hookEnabled && hookText.trim() ? { enabled: true, text: hookText.trim() } : { enabled: false },
            }
          : {}),
      };

      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/style`, {
        method: "PUT",
        body: JSON.stringify({
          captionStyleIndex: captionsOn ? (clip.captionStyleIndex != null && clip.captionStyleIndex >= 0 ? clip.captionStyleIndex : 0) : -1,
          subtitleStyleOverride,
          silenceSettings: { removeSilence, silenceThresholdMs, removeFillers, reframingPreset, smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed },
        }),
      });

      // "Apply to all" copies the STYLE to the sibling clips and nothing more.
      // It deliberately does not trigger a render on any of them: applying a
      // premium style to twenty clips and silently starting twenty paid
      // renders would be a very expensive surprise (§26/§38). The siblings
      // pick the style up on their next re-render.
      if (applyToAll && siblingClipIds.length > 0) {
        await Promise.allSettled(
          siblingClipIds.map((id) =>
            apiFetch(`/api/projects/${projectId}/clips/${id}/style`, {
              method: "PUT",
              // render:false — the server now honours what this comment always
              // promised. Without it every sibling was a charged re-render.
              body: JSON.stringify({ subtitleStyleOverride, render: false }),
            }),
          ),
        );
      }

      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleApplyLiteEdits(edits: LiteEdits, trim: { startSec: number; endSec: number } | null) {
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/lite`, {
        method: "PUT",
        body: JSON.stringify({ liteEdits: edits, ...(trim ? { startSec: clip.startSec + trim.startSec, endSec: clip.startSec + trim.endSec } : {}) }),
      });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleChangeAspect(aspectRatio: "9:16" | "16:9" | "1:1") {
    if (aspectRatio === clip.aspectRatio) return;
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/rerender`, {
        method: "POST",
        body: JSON.stringify({ aspectRatio }),
      });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  async function handleSaveTranscript() {
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/api/projects/${projectId}/clips/${clip.id}/transcript`, { method: "PUT", body: JSON.stringify({ transcript: localWords }) });
      onChanged();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "An error occurred");
    } finally { setSaving(false); }
  }

  const bd = clip.scoreBreakdown as unknown as ScoreBreakdownWithInsights | null;
  // No invented copy. If the model produced nothing there is nothing to
  // suggest, and offering a generic "Check out this amazing clip!" as though
  // it were written for this video is worse than offering nothing at all.
  const caption = bd?.suggestedCaption ?? null;
  const hashtags = Array.isArray(bd?.hashtags) ? bd.hashtags.join(" ") : "";
  const hasPostCopy = !!caption || !!hashtags;
  function copySocial() {
    navigator.clipboard.writeText([caption, hashtags].filter(Boolean).join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download className="hidden md:inline-block text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-card-border bg-panel text-ink hover:bg-tint-blue transition-colors">Download</a>
        </div>

        {/* Body: stage + tools panel */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bg)" }}>
          {isRendering && (
            <div role="status" aria-live="polite" className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-[3.5px] border-white/25 border-t-white rounded-full animate-spin" />
              <p className="text-sm font-semibold text-white">Applying changes…</p>
              <p className="text-xs text-white/60">{clip.status === "queued" ? "Queued" : `${clip.progress}% rendered`}</p>
            </div>
          )}
          <div className={panelOpen ? "ac-stage ac-stage-open" : "ac-stage"} style={{ padding: "20px 24px" }}>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="ac-pop relative h-full flex items-center justify-center">
                {playing && clip.videoUrl ? (
                  <video src={clip.videoUrl} controls autoPlay className="h-full max-h-full rounded-2xl bg-black" style={{ aspectRatio: arCss(clip.aspectRatio) }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
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
                      durationSec={clip.durationSec}
                      peaks={clip.audioPeaks ?? []}
                      initial={clip.liteEdits}
                      busy={saving}
                      isFirstRerenderFree={clip.rerenderCount === 0}
                      onApply={handleApplyLiteEdits}
                    />
                  </div>
                )}

                {tab === "captions" && (
                  <div className="ac-panel-in space-y-5">
                    <div>
                      <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-1">Caption style</h4>
                      <p className="text-[12.5px] text-ink-soft mb-3">One choice sets typography, keyword colour and emoji.</p>
                      <CaptionTemplatePicker
                        value={templateId}
                        onChange={(id) => {
                          setTemplateId(id);
                          const t = CAPTION_TEMPLATES.find((x) => x.id === id);
                          if (!t) return;
                          if (t.style.fontName) setFontName(t.style.fontName);
                          if (t.style.fontSize) setFontSize(t.style.fontSize);
                          if (t.style.baseColor) setBaseColor(assToHex(t.style.baseColor));
                          if (t.style.highlightColor) setHighlightColor(assToHex(t.style.highlightColor));
                          if (t.style.outlineColor) setOutlineColor(assToHex(t.style.outlineColor));
                          if (t.style.outlineWidth != null) setOutlineWidth(t.style.outlineWidth);
                          if (t.style.shadowDepth != null) setShadowDepth(t.style.shadowDepth);
                          if (t.style.borderStyle != null) setBorderStyle(t.style.borderStyle);
                          if (t.style.alignment != null) setAlignment(t.style.alignment);
                          if (t.style.animated != null) setAnimatedCaptions(t.style.animated);
                        }}
                        disabled={saving}
                      />
                    </div>

                    {/* Only for provider-rendered styles: caption position, an
                        optional Clipiro-generated hook, and apply-to-all. The
                        native ASS renderer has no concept of any of these, so
                        showing them for a native style would be dead UI. */}
                    {isPremiumTemplate && (
                      <CaptionRenderControls
                        positionY={captionPositionY}
                        onPositionYChange={setCaptionPositionY}
                        hookEnabled={hookEnabled}
                        onHookEnabledChange={setHookEnabled}
                        hookText={hookText}
                        onHookTextChange={setHookText}
                        onSuggestHooks={suggestHooks}
                        applyToAll={applyToAll}
                        onApplyToAllChange={setApplyToAll}
                        disabled={saving}
                      />
                    )}

                    <button onClick={() => setCustomizeOpen((o) => !o)} className="flex items-center justify-between w-full">
                      <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">Customize</span>
                      <span className="text-[12px] font-semibold text-brand">{customizeOpen ? "Hide" : "Show"}</span>
                    </button>
                    {customizeOpen && (
                      <div className="ac-panel-in space-y-4 border-t border-card-border pt-4">
                        {brandKits.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Load from Brand Kit</label>
                            <select defaultValue="" onChange={(e) => { const kit = brandKits.find((k) => k.id === e.target.value); if (kit) applyBrandKit(kit); e.target.value = ""; }} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-panel">
                              <option value="" disabled>Choose a saved style…</option>
                              {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Font</label>
                            <select value={fontName} onChange={(e) => setFontName(e.target.value)} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-panel">
                              {["Outfit", "Arial", "Impact", "Courier New", "Georgia", "Times New Roman"].map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Size (px)</label>
                            <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Layout</label>
                            <select value={borderStyle} onChange={(e) => setBorderStyle(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-panel">
                              <option value={1}>Outline &amp; Shadow</option>
                              <option value={3}>Background Box</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink-soft">Alignment</label>
                            <select value={alignment} onChange={(e) => setAlignment(Number(e.target.value))} className="w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-panel">
                              <option value={5}>Center</option>
                              <option value={2}>Bottom</option>
                              <option value={8}>Top</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          {[["Text", baseColor, setBaseColor] as const, ["Highlight", highlightColor, setHighlightColor] as const, ["Outline", outlineColor, setOutlineColor] as const, ["Shadow", shadowColor, setShadowColor] as const].map(([label, val, set]) => (
                            <div key={label} className="space-y-1">
                              <label className="text-[11px] font-semibold text-ink-soft block">{label}</label>
                              <input type="color" value={val} onChange={(e) => set(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border border-card-border" />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[11px] text-ink-soft"><span>Outline thickness</span><span>{outlineWidth}px</span></div>
                          <input type="range" min={0} max={12} step={1} value={outlineWidth} onChange={(e) => setOutlineWidth(Number(e.target.value))} className="w-full accent-brand" />
                          <div className="flex justify-between text-[11px] text-ink-soft"><span>Shadow depth</span><span>{shadowDepth}px</span></div>
                          <input type="range" min={0} max={12} step={1} value={shadowDepth} onChange={(e) => setShadowDepth(Number(e.target.value))} className="w-full accent-brand" />
                        </div>
                        {namingKit ? (
                          <div className="flex items-center gap-2">
                            <input value={newKitName} onChange={(e) => setNewKitName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveBrandKit(); }} placeholder="Name this style…" autoFocus className="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
                            <Button onClick={handleSaveBrandKit} disabled={saveBrandKitMutation.isPending || !newKitName.trim()} size="sm">{saveBrandKitMutation.isPending ? "Saving…" : "Save"}</Button>
                            <button type="button" onClick={() => { setNamingKit(false); setNewKitName(""); }} className="text-xs text-ink-soft/70 px-1">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setNamingKit(true)} className="w-full text-center text-xs font-semibold text-brand hover:underline py-1">Save as Brand Kit</button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                      <div className="pr-3">
                        <p className="text-[12.5px] font-semibold text-ink">Burn captions in</p>
                        <p className="text-[11px] text-ink-soft">{captionsOn ? "Baked into the exported file." : "This clip renders without subtitles."}</p>
                      </div>
                      <Switch checked={captionsOn} onChange={setCaptionsOn} label="Burn in captions" disabled={saving} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-card-border p-3">
                      <div className="pr-3">
                        <p className="text-[12.5px] font-semibold text-ink">Animated subtitles</p>
                        <p className="text-[11px] text-ink-soft">Word-by-word active highlighting with pop zoom.</p>
                      </div>
                      <Switch checked={animatedCaptions} onChange={setAnimatedCaptions} label="Animated subtitles" disabled={saving} />
                    </div>
                    <TranslateCaptions projectId={projectId} clipId={clip.id} disabled={saving} onQueued={onChanged} />
                    {saveErr && <p className="text-xs text-error">{saveErr}</p>}
                    <Button onClick={handleSaveStyleOrCuts} disabled={saving} className="w-full">{saving ? "Saving & Rendering…" : "Apply caption style"}</Button>
                    <RerenderCostNote clip={clip} />
                  </div>
                )}

                {tab === "reframe" && (
                  <div className="ac-panel-in space-y-5">
                    <div>
                      <h4 className="text-[12px] font-bold text-ink-soft uppercase tracking-wider mb-1">Aspect ratio</h4>
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
                      <RerenderCostNote clip={clip} />
                    </div>
                    <div className="h-px bg-card-border" />
                    <ReframeAndCutsControls
                      smartAutoReframe={smartAutoReframe} setSmartAutoReframe={setSmartAutoReframe}
                      reframingPreset={reframingPreset} setReframingPreset={setReframingPreset}
                      zoomStrength={zoomStrength as "low" | "medium" | "high"} setZoomStrength={setZoomStrength}
                      speakerMode={speakerMode as "auto" | "single" | "split" | "active"} setSpeakerMode={setSpeakerMode}
                      smoothness={smoothness} setSmoothness={setSmoothness}
                      trackingSpeed={trackingSpeed} setTrackingSpeed={setTrackingSpeed}
                      removeSilence={removeSilence} setRemoveSilence={setRemoveSilence}
                      silenceThresholdMs={silenceThresholdMs} setSilenceThresholdMs={setSilenceThresholdMs}
                      removeFillers={removeFillers} setRemoveFillers={setRemoveFillers}
                    />
                    {saveErr && <p className="text-xs text-error">{saveErr}</p>}
                    <Button onClick={handleSaveStyleOrCuts} disabled={saving} className="w-full">{saving ? "Saving & Rendering…" : "Apply reframe & audio"}</Button>
                    <RerenderCostNote clip={clip} />
                  </div>
                )}

                {tab === "insights" && (
                  transcriptionFailed ? (
                    <div className="ac-panel-in rounded-xl border border-warning/40 bg-tint-amber p-4">
                      <h4 className="text-xs font-bold text-warning uppercase tracking-wider mb-1.5">Insights unavailable</h4>
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
                              <button onClick={copySocial} className="text-[12px] font-bold text-brand hover:underline">{copied ? "✓ Copied!" : "Copy"}</button>
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
                    <Button onClick={handleSaveTranscript} disabled={saving || transcriptLoading || localWords.length === 0} className="w-full">{saving ? "Saving & Rendering…" : "Save transcript changes"}</Button>
                    <RerenderCostNote clip={clip} />
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
                      <DubPanel projectId={projectId} clip={clip} />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-card-border px-5 py-3.5 flex items-center gap-2.5">
                <EditInEditorButton projectId={projectId} clip={clip} className="min-h-[44px] px-4 rounded-xl border border-card-border bg-panel text-ink text-[12.5px] font-semibold hover:bg-tint-blue transition-colors disabled:opacity-50" />
                <a href={`/api/projects/${projectId}/clips/${clip.id}/download`} download className="flex-1 min-h-[44px] rounded-xl grad-brand text-on-primary text-[13.5px] font-bold shadow-glow flex items-center justify-center">Download clip</a>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

