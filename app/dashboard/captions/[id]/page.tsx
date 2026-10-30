"use client";

// A Caption Studio project. One page, one step at a time (?step=): the
// project and its unsaved state live across steps instead of reloading.

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseStudioStep, type StudioStep } from "@/lib/captions/studio";
import { StudioHeader } from "../_components/StudioHeader";
import { TemplateEditStep } from "../_components/TemplateEditStep";
import { StyleStep } from "../_components/StyleStep";
import { ExportStep } from "../_components/ExportStep";
import { useStudioProject } from "../_components/useStudioProject";

export default function CaptionStudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const step = parseStudioStep(useSearchParams().get("step"));
  const { project, loadError, saveError, transcribe, save, startTranscription } = useStudioProject(id);

  const hasCaptions = (project?.doc.tracks.caption.length ?? 0) > 0;
  const hrefFor = (s: StudioStep) => (s === "edit" || hasCaptions ? `/dashboard/captions/${id}?step=${s}` : null);
  const go = (s: StudioStep) => router.push(`/dashboard/captions/${id}?step=${s}`);
  const next: { step: StudioStep; label: string } | null =
    step === "edit" ? { step: "style", label: "Next: Style" } : step === "style" ? { step: "export", label: "Next: Export" } : null;

  return (
    // Template & edit fits the window on a desktop so its columns scroll on their own.
    <div className={`flex min-h-screen flex-col bg-bg text-fg ${step === "edit" ? "lg:h-screen" : ""}`}>
      <StudioHeader
        current={step}
        title={project?.title}
        hrefFor={hrefFor}
        right={next && hasCaptions ? (
          <button type="button" onClick={() => go(next.step)} className="h-9 rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-on-primary hover:bg-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            {next.label}
          </button>
        ) : null}
      />
      {saveError && (
        <p role="alert" className="border-b border-error/30 bg-error/10 px-6 py-2.5 text-sm text-error">{saveError}</p>
      )}
      {loadError ? (
        <div className="flex flex-1 items-center justify-center p-6"><p role="alert" className="text-sm text-error">{loadError}</p></div>
      ) : !project ? (
        <div className="flex flex-1 items-center justify-center p-6"><p className="text-sm text-fg-subtle" role="status">Opening your project…</p></div>
      ) : step === "edit" ? (
        <TemplateEditStep project={project} transcribe={transcribe} save={save} startTranscription={startTranscription} />
      ) : !hasCaptions ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-sm text-fg-muted">
            Your captions aren&apos;t ready yet. <button type="button" onClick={() => go("edit")} className="font-semibold text-emerald-bright underline-offset-2 hover:underline">Go back to Template &amp; edit</button> to make them.
          </p>
        </div>
      ) : step === "style" ? (
        <StyleStep project={project} save={save} />
      ) : (
        <ExportStep project={project} />
      )}
    </div>
  );
}
