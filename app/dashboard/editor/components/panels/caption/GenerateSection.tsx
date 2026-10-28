"use client";

// Whole-timeline caption generation: transcribes every unique video asset on
// the timeline (once each, even if reused by multiple clips) and places cues
// respecting each clip's own trim/speed/position — see
// lib/editor/caption-generation.ts for the pure planning/conversion math this
// orchestrates. Mirrors the fetch+store-update shape the old per-clip "Auto
// captions" button (now removed) used, just looped across the whole timeline.

import React, { useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useEditorStore } from "../../../store/editorStore";
import { planCaptionGeneration, wordsToCaptionCues, type RawWordTiming } from "@/lib/editor/caption-generation";
import type { CaptionClip } from "@/lib/editor/types";
import { DUB_LANGUAGES } from "@/lib/languages";
import { Button, SelectField, showPanelToast } from "../../ui";
import { playUiSound } from "../../../hooks/useUiSound";
import { clientAuthToken } from "@/lib/client-session";

const AUTO_DETECT = "Auto-detect";
const LANGUAGE_OPTIONS = [AUTO_DETECT, ...DUB_LANGUAGES.map((l) => l.label)];

export default function GenerateSection() {
  const doc = useEditorStore((s) => s.doc);
  const addCaptionClips = useEditorStore((s) => s.addCaptionClips);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const { user, refreshUser } = useAuth();
  const [language, setLanguage] = useState(AUTO_DETECT);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasCaptions = doc.tracks.caption.length > 0;
  const plan = planCaptionGeneration(doc);
  // Billed in Clip Minutes: 1 per minute of each unique video, rounded up,
  // charged by the server once it knows each file's length. The client only
  // knows the floor — at least 1 minute per video — so that's the pre-check.
  const minMinutes = plan.length;

  const generate = async (replace: boolean) => {
    if (plan.length === 0) {
      setError("Add a video clip to the timeline first.");
      return;
    }
    if ((user?.minutes ?? 0) < minMinutes) {
      setError(`Not enough Clip Minutes — captions use 1 minute per minute of video (at least ${minMinutes} here).`);
      return;
    }
    setWorking(true);
    setError(null);
    const languageCode = DUB_LANGUAGES.find((l) => l.label === language)?.code; // undefined = Scribe auto-detect
    try {
      const token = clientAuthToken();
      const allCues: CaptionClip[] = [];
      for (let i = 0; i < plan.length; i++) {
        const { assetId, clips } = plan[i];
        setProgress(`Transcribing asset ${i + 1} of ${plan.length}…`);
        const res = await fetch("/api/editor/captions", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ assetId, languageCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Transcription failed");
        const words: RawWordTiming[] = data.words;
        for (const clip of clips) allCues.push(...wordsToCaptionCues(words, clip));
      }
      if (allCues.length === 0) throw new Error("No speech detected across the timeline.");
      addCaptionClips(allCues, { replace });
      setProgress("");
      refreshUser();
      playUiSound("go");
      showPanelToast(`Captions ready · ${allCues.length} cues`);
      setActivePanel("captionEdit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
      setProgress("");
      refreshUser();
    } finally {
      setWorking(false);
    }
  };

  const videoMinutes = Math.max(minMinutes, Math.ceil(doc.tracks.video.reduce((n, c) => n + c.duration, 0) / 60));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-editor-md border border-editor-border bg-editor-card p-3">
        <div className="flex items-center justify-between text-[12.5px] font-semibold text-editor-text">
          <span>{plan.length === 0 ? "No video on the timeline" : `${plan.length} video${plan.length === 1 ? "" : "s"} to transcribe`}</span>
          {plan.length > 0 && <span className="font-mono text-[11px] text-editor-text-muted">~{videoMinutes} min</span>}
        </div>
        <p className="text-[11.5px] text-editor-text-muted">
          1 Clip Minute per minute of video · you have {user?.minutes ?? 0} left
        </p>
      </div>
      <SelectField label="Spoken language" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      <Button variant="primary" onClick={() => generate(hasCaptions)} disabled={working} className={working ? "editor-thinking" : "editor-press"}>
        {working ? progress || "Transcribing…" : hasCaptions ? "Regenerate captions" : "Generate captions"}
      </Button>
      {hasCaptions && <p className="text-[11px] text-editor-text-muted">Regenerating replaces the captions you have now.</p>}
      <p className="text-[11px] text-editor-text-faint">Takes about 20 seconds per minute of video. You&apos;ll land on Edit when it&apos;s done.</p>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
