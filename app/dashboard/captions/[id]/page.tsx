"use client";

// A Caption Studio project. One page, one step at a time (?step=): the
// project and its unsaved state live across steps instead of reloading.

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseStudioStep, type StudioStep } from "@/lib/captions/studio";
import { StudioHeader } from "../_components/StudioHeader";
import { TemplateStep } from "../_components/TemplateStep";
import { useStudioProject } from "../_components/useStudioProject";

export default function CaptionStudioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const step = parseStudioStep(useSearchParams().get("step"));
  const { project, loadError, saveError, transcribe, save, startTranscription } = useStudioProject(id);

  const hasCaptions = (project?.doc.tracks.caption.length ?? 0) > 0;
  const hrefFor = (s: StudioStep) => (s === "template" || hasCaptions ? `/dashboard/captions/${id}?step=${s}` : null);
  const go = (s: StudioStep) => router.push(`/dashboard/captions/${id}?step=${s}`);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <StudioHeader current={step} title={project?.title} hrefFor={hrefFor} />
      {saveError && (
        <p role="alert" className="border-b border-error/30 bg-error/10 px-6 py-2.5 text-sm text-error">{saveError}</p>
      )}
      {loadError ? (
        <div className="flex flex-1 items-center justify-center p-6"><p role="alert" className="text-sm text-error">{loadError}</p></div>
      ) : !project ? (
        <div className="flex flex-1 items-center justify-center p-6"><p className="text-sm text-fg-subtle" role="status">Opening your project…</p></div>
      ) : step === "template" ? (
        <TemplateStep project={project} transcribe={transcribe} save={save} startTranscription={startTranscription} onDone={() => go("edit")} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-sm text-fg-muted">
            This step is on its way. Your captions are saved — you can also open this project in the editor.
          </p>
        </div>
      )}
    </div>
  );
}
