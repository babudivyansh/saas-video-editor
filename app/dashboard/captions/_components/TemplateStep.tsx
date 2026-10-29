"use client";

// Caption Studio, step 2: pick the template. The captions are transcribed in
// the background the first time this opens; until they arrive the preview
// shows the template's own sample line. "My templates" are the user's saved
// looks (a template plus a style) and apply both at once.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
import { useCaptionTemplates } from "@/app/components/captions/useCaptionTemplates";
import { useUpgradePrompt } from "@/app/components/captions/useUpgradePrompt";
import { clientAuthToken } from "@/lib/client-session";
import { currentTemplateId, withTemplate } from "@/lib/captions/studio";
import type { SavedCaptionTemplate } from "@/lib/captions/user-templates";
import type { CaptionStyleOverride } from "@clipiro/shared/caption-style";
import { effectiveCaptionTemplate } from "@clipiro/shared/caption-style";
import { docDimensions } from "@/lib/editor/types";
import { StudioPreview } from "./StudioPreview";
import type { StudioProject, TranscribeState } from "./useStudioProject";
import type { TimelineDoc } from "@/lib/editor/types";

const PLACEMENT_LABEL = { high: "Top", mid: "Middle", low: "Lower ⅓" } as const;

export interface TemplateStepProps {
  project: StudioProject;
  transcribe: TranscribeState;
  save: (change: (doc: TimelineDoc) => TimelineDoc, extra?: { subtitlesStyle?: Record<string, unknown> }) => Promise<unknown>;
  startTranscription: (templateIdFor: () => string) => Promise<void>;
  onDone: () => void;
}

export function TemplateStep({ project, transcribe, save, startTranscription, onDone }: TemplateStepProps) {
  const { templates } = useCaptionTemplates();
  const upgrade = useUpgradePrompt();
  const [picked, setPicked] = useState<string>(currentTemplateId(project.doc) ?? project.startTemplateId);
  const [savedPick, setSavedPick] = useState<SavedCaptionTemplate | null>(null);
  const [saved, setSaved] = useState<SavedCaptionTemplate[]>([]);
  const [applying, setApplying] = useState(false);
  // Read by transcription when it finishes, which may be after later picks.
  const pickedRef = useRef(picked);
  useEffect(() => { pickedRef.current = picked; }, [picked]);

  // Captions are made once, the first time the project opens.
  useEffect(() => {
    if (project.doc.tracks.caption.length === 0 && transcribe.status === "idle") void startTranscription(() => pickedRef.current);
  }, [project.doc.tracks.caption.length, transcribe.status, startTranscription]);

  useEffect(() => {
    const token = clientAuthToken();
    fetch("/api/caption-templates/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.templates) setSaved(d.templates); })
      .catch(() => {});
  }, []);

  const frame = docDimensions(project.doc);
  // A saved look previews with its own style; a library pick with the project's.
  const previewDoc: TimelineDoc = savedPick ? { ...project.doc, captionStyle: savedPick.style } : project.doc;
  const spec = effectiveCaptionTemplate(picked, previewDoc.captionStyle, frame).template;
  const meta = templates.find((t) => t.id === picked);
  const captionsReady = project.doc.tracks.caption.length > 0;

  const apply = async () => {
    setApplying(true);
    const style: CaptionStyleOverride | undefined = savedPick ? savedPick.style : project.doc.captionStyle;
    const ok = await save(
      (doc) => {
        const next = withTemplate(doc, picked);
        if (style && Object.keys(style).length) return { ...next, captionStyle: style };
        const { captionStyle: _drop, ...rest } = next;
        return rest as TimelineDoc;
      },
      // Read by transcription if it is still running: the captions land on this pick.
      { subtitlesStyle: { templateId: picked, ...(project.language ? { language: project.language } : {}), removeFillers: project.removeFillers } },
    );
    setApplying(false);
    if (ok) onDone();
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <main className="flex min-w-0 flex-col gap-5 p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Pick a caption template</h1>
            <p className="text-sm text-fg-muted" role="status" aria-live="polite">
              {transcribe.status === "running" && "Transcribing your video — pick a template while you wait."}
              {transcribe.status === "done" && "Captions ready. Previews use your own words."}
              {transcribe.status === "idle" && (captionsReady ? "Previews use your own words." : "Getting your captions ready…")}
              {transcribe.status === "error" && <span className="text-error">{transcribe.message}</span>}
            </p>
          </div>
          {transcribe.status === "error" && (
            transcribe.code === "insufficient_minutes"
              ? <Link href="/dashboard/upgrade" className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-3">Get more minutes</Link>
              : <button type="button" onClick={() => void startTranscription(() => pickedRef.current)} className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-surface-3">Try again</button>
          )}
        </div>

        {saved.length > 0 && (
          <section aria-labelledby="cs-mine" className="flex flex-col gap-2.5">
            <h2 id="cs-mine" className="font-mono text-xs uppercase tracking-[0.08em] text-fg-subtle">My templates</h2>
            <div className="flex flex-wrap gap-2">
              {saved.map((s) => {
                const on = savedPick?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setSavedPick(s); setPicked(s.baseTemplateId); }}
                    className={`rounded-full px-4 py-2 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                      on ? "bg-primary text-on-primary" : "border border-emerald-bright/40 text-emerald-bright hover:bg-emerald-brand/10"
                    }`}
                  >
                    {s.name}{s.isDefault ? " · default" : ""}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <CaptionTemplateGallery
          value={savedPick ? null : picked}
          onChange={(id) => { setSavedPick(null); setPicked(id); }}
          onLocked={upgrade}
          columns={5}
          maxHeightClass="max-h-[calc(100vh-300px)]"
        />
      </main>

      <aside aria-label="Selected template" className="flex flex-col gap-5 border-line bg-surface-1 p-6 lg:border-l">
        <div className="flex justify-center">
          <StudioPreview doc={previewDoc} media={project.media} templateId={picked} maxWidth={340} maxHeight={480} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[22px] font-extrabold">{savedPick?.name ?? meta?.name ?? spec.name}</h2>
          <p className="text-sm leading-relaxed text-fg-muted">{meta?.hint ?? spec.hint}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-[10px] bg-surface-3 p-2.5"><dt className="text-fg-subtle">Words/line</dt><dd className="mt-0.5 text-sm font-bold">{spec.words}</dd></div>
          <div className="rounded-[10px] bg-surface-3 p-2.5"><dt className="text-fg-subtle">Motion</dt><dd className="mt-0.5 text-sm font-bold capitalize">{spec.motion}</dd></div>
          <div className="rounded-[10px] bg-surface-3 p-2.5"><dt className="text-fg-subtle">Position</dt><dd className="mt-0.5 text-sm font-bold">{PLACEMENT_LABEL[spec.placement.y]}</dd></div>
        </dl>
        <div className="mt-auto flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={applying || meta?.locked}
            className="h-12 rounded-xl bg-primary text-[15px] font-bold text-on-primary outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
          >
            {applying ? "Saving…" : "Use this template"}
          </button>
          {!captionsReady && transcribe.status !== "error" && (
            <p className="text-center text-xs text-fg-subtle">Your captions will use this template as soon as they&apos;re ready.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
