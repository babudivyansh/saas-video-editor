"use client";

// A Caption Studio project on the client: load it, save changes to it (one
// save at a time, through the editor's own versioned PATCH), and turn its
// speech into captions the first time it opens.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset } from "@clipiro/shared";
import { clientAuthToken } from "@/lib/client-session";
import type { RawWordTiming } from "@/lib/editor/caption-generation";
import type { TimelineDoc } from "@/lib/editor/types";
import { currentTemplateId, studioCaptionCues } from "@/lib/captions/studio";

export interface StudioProject {
  projectId: string;
  title: string;
  version: number;
  doc: TimelineDoc;
  media: Record<string, Asset>;
  startTemplateId: string;
  language: string | null;
  removeFillers: boolean;
}

export type TranscribeState =
  | { status: "idle" | "running" | "done" }
  | { status: "error"; message: string; code?: "insufficient_minutes" };

const authHeaders = (): Record<string, string> => {
  const token = clientAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// One transcription per project per tab, even across a remount: it is paid
// (Clip Minutes), so a second request for the same video must never start.
const transcribing = new Set<string>();

export function useStudioProject(projectId: string) {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transcribe, setTranscribe] = useState<TranscribeState>({ status: "idle" });
  const latest = useRef<StudioProject | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    fetch(`/api/captions/projects/${projectId}`, { headers: authHeaders() })
      .then(async (res) => ({ res, body: await res.json().catch(() => ({})) }))
      .then(({ res, body }) => {
        if (!live) return;
        if (!res.ok) {
          setLoadError(res.status === 404 ? "This project doesn't exist or isn't yours." : (body.error ?? "Couldn't open this project."));
          return;
        }
        latest.current = body as StudioProject;
        setLoadError(null);
        setProject(body as StudioProject);
      })
      .catch(() => { if (live) setLoadError("Couldn't open this project. Check your connection."); });
    return () => { live = false; };
  }, [projectId]);

  /**
   * Applies `change` to the latest doc and saves it. Saves run one after
   * another, each with the version the previous one returned, so two quick
   * edits never conflict with each other.
   */
  const save = useCallback((change: (doc: TimelineDoc) => TimelineDoc, extra?: { subtitlesStyle?: Record<string, unknown> }) => {
    const run = async () => {
      const cur = latest.current;
      if (!cur) return false;
      const doc = change(cur.doc);
      const optimistic = { ...cur, doc };
      latest.current = optimistic;
      setProject(optimistic);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ editorDoc: doc, expectedVersion: cur.version, ...extra }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(res.status === 409 ? "This project changed in another tab. Reload to see the latest." : (body.error ?? "Couldn't save."));
        return false;
      }
      const { project: saved } = await res.json();
      latest.current = { ...latest.current!, version: saved.editorVersion };
      setProject(latest.current);
      setSaveError(null);
      return true;
    };
    const next = queue.current.then(run, run);
    queue.current = next;
    return next;
  }, [projectId]);

  /** Transcribes the project's video once and puts the captions on the chosen template. */
  const startTranscription = useCallback(async (templateIdFor: () => string) => {
    const cur = latest.current;
    const video = cur?.doc.tracks.video[0];
    if (!cur || !video || cur.doc.tracks.caption.length > 0 || transcribing.has(projectId)) return;
    transcribing.add(projectId);
    setTranscribe({ status: "running" });
    try {
      const res = await fetch("/api/editor/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ assetId: video.assetId, ...(cur.language ? { languageCode: cur.language } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTranscribe({ status: "error", message: body.error ?? "Transcription failed. Try again.", ...(body.code === "insufficient_minutes" ? { code: "insufficient_minutes" as const } : {}) });
        transcribing.delete(projectId);
        return;
      }
      const words = body.words as RawWordTiming[];
      const ok = await save((doc) => {
        // The template picked while this ran wins over the one it started on.
        const templateId = templateIdFor() || currentTemplateId(doc) || cur.startTemplateId;
        const cues = studioCaptionCues(words, doc.tracks.video[0]!, { templateId, removeFillers: cur.removeFillers });
        return { ...doc, tracks: { ...doc.tracks, caption: cues } };
      });
      setTranscribe(ok ? { status: "done" } : { status: "error", message: "Captions were made but couldn't be saved. Reload and try again." });
    } catch {
      setTranscribe({ status: "error", message: "Transcription failed. Check your connection and try again." });
      transcribing.delete(projectId);
    }
  }, [projectId, save]);

  return { project, loadError, saveError, transcribe, save, startTranscription };
}
