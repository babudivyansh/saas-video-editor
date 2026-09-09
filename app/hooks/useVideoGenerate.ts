"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { discardDraftProject } from "@/lib/discard-draft-project";

export type GenerateStatus = "idle" | "uploading" | "creating" | "rendering" | "completed" | "failed";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function uploadVideo(file: File, token: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Upload failed (${res.status})`);
  }
  const data = await res.json() as { url: string };
  return data.url;
}

async function createProject(token: string, data: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Failed to create project");
  }
  const json = await res.json() as { project: { id: string } };
  return json.project.id;
}

async function callGenerate(endpoint: string, token: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Generate failed (${res.status})`);
  }
}

// A stuck job used to poll forever with no way out — this bounds it, matching
// app/components/useJobPolling.ts's maxDurationMs pattern for the /api/tools/*
// family.
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

export function useVideoGenerate() {
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  // "Shipped, but degraded" — the same Project.warnings channel AutoClip uses.
  // reddit-video and text-video write music_unavailable here; without this the
  // row was recorded and never read, and a silent video looked intentional.
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef(0);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = useCallback((projectId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setWarnings(null);
    pollStartRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
        clearInterval(pollRef.current!);
        setError("This is taking longer than expected. Please try again.");
        setStatus("failed");
        return;
      }
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // A 404 means the project is gone (deleted, or never existed) — this
        // is terminal, not transient. Treating it as "keep trying" polled
        // forever instead of ever surfacing an error.
        if (res.status === 404) {
          clearInterval(pollRef.current!);
          setError("This project could not be found — it may have been deleted.");
          setStatus("failed");
          return;
        }
        if (!res.ok) return; // other transient failures: keep polling
        const { project } = await res.json() as { project: { status: string; videoUrl?: string; progress?: number; warnings?: unknown } };
        if (project.progress != null) setProgress(project.progress);
        if (project.status === "completed" && project.videoUrl) {
          clearInterval(pollRef.current!);
          setVideoUrl(project.videoUrl);
          // Prisma Json — narrow it here rather than trusting the column shape.
          setWarnings(
            Array.isArray(project.warnings)
              ? project.warnings.filter((w): w is string => typeof w === "string")
              : null,
          );
          setStatus("completed");
        } else if (project.status === "failed") {
          clearInterval(pollRef.current!);
          setError("Render failed — please try again.");
          setStatus("failed");
        }
      } catch {
        // transient network error — keep polling, bounded by MAX_POLL_DURATION_MS above
      }
    }, 3000);
  }, []);

  const generateSplitScreen = useCallback(async (params: {
    /** A freshly picked file to upload. Mutually exclusive with videoUrl. */
    file?: File;
    /** A video already hosted on our S3 (e.g. reused from the Asset Library)
     *  — skips the upload step entirely. Pass `fileName` alongside it for the
     *  project title, since there's no File to read `.name` from. */
    videoUrl?: string;
    fileName?: string;
    bgVideoUrl: string;
    /** Legacy index, derived from the slug. Kept on the wire for back-compat. */
    subtitleStyleIndex: number;
    /** Caption template slug — what the picker actually selects now. */
    captionTemplateId?: string;
    mode: "oneword" | "lines";
    token: string;
  }) => {
    const { file, videoUrl, fileName, bgVideoUrl, subtitleStyleIndex, captionTemplateId, mode, token } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    try {
      const uploadedVideoUrl = videoUrl ?? await uploadVideo(file!, token);
      setStatus("creating");
      const projectId = await createProject(token, {
        title: fileName ?? file?.name ?? "Video",
        backgroundUrl: bgVideoUrl,
        subtitlesStyle: { styleIndex: subtitleStyleIndex, templateId: captionTemplateId ?? null, mode },
        uploadedVideoUrl,
        productType: "split-screen",
      });
      await callGenerate("/api/generate/split-screen", token, {
        projectId,
        bgVideoUrl,
        subtitleStyleIndex,
        captionTemplateId,
        mode,
      });
      setStatus("rendering");
      startPolling(projectId, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, [startPolling]);

  const generateStreamerVideo = useCallback(async (params: {
    /** A freshly picked file to upload. Mutually exclusive with videoUrl. */
    file?: File;
    /** A video already hosted on our S3 (e.g. reused from the Asset Library)
     *  — skips the upload step entirely. */
    videoUrl?: string;
    fileName?: string;
    titleText: string;
    /** Styles the TITLE overlay. Historical name — it predates real captions. */
    subtitleStyleIndex: number;
    /** Caption template slug for the burned-in subtitles. */
    captionTemplateId?: string;
    captionMode?: "oneword" | "lines";
    token: string;
  }) => {
    const { file, videoUrl, fileName, titleText, subtitleStyleIndex, captionTemplateId, captionMode, token } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    try {
      const uploadedVideoUrl = videoUrl ?? await uploadVideo(file!, token);
      setStatus("creating");
      const projectId = await createProject(token, {
        title: titleText || fileName || file?.name || "Video",
        subtitlesStyle: { styleIndex: subtitleStyleIndex, templateId: captionTemplateId ?? null, mode: captionMode ?? "oneword" },
        uploadedVideoUrl,
        productType: "streamer-video",
      });
      await callGenerate("/api/generate/streamer-video", token, {
        projectId,
        titleText,
        subtitleStyleIndex,
        captionTemplateId,
        captionMode,
      });
      setStatus("rendering");
      startPolling(projectId, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, [startPolling]);

  const generateAutoClip = useCallback(async (params: {
    file: File;
    minDuration: number;
    maxDuration: number;
    clipCount: number;
    aspectRatio: string;
    instructions: string;
    captionStyleIndex: number;
    /** Clipiro caption template slug. null = captions off. The index above is
     *  derived from it and kept only for the public v1 API contract. */
    captionTemplateId?: string | null;
    token: string;
    reframingPreset?: string;
    removeSilence?: boolean;
    silenceThresholdMs?: number;
    removeFillers?: boolean;
    smartAutoReframe?: boolean;
    zoomStrength?: "low" | "medium" | "high";
    speakerMode?: "auto" | "single" | "split" | "active";
    smoothness?: number;
    trackingSpeed?: number;
    animatedCaptions?: boolean;
  }) => {
    const {
      file, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionStyleIndex, captionTemplateId, token,
      reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
      smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions
    } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    let createdId: string | null = null;
    try {
      const uploadedVideoUrl = await uploadVideo(file, token);
      setStatus("creating");
      const pid = await createProject(token, {
        title: file.name,
        uploadedVideoUrl,
        productType: "auto-clip",
      });
      createdId = pid;
      setProjectId(pid);
      // This only kicks off analysis (transcribe + Gemini pick) — no clips are
      // rendered and no credits are charged yet. The page polls
      // /api/projects/{pid}/clips and shows a review step once picks land;
      // rendering (and the actual charge) happens after the user confirms.
      await callGenerate("/api/generate/auto-clip", token, {
        projectId: pid,
        minDuration,
        maxDuration,
        clipCount,
        aspectRatio,
        instructions,
        captionStyleIndex,
        captionTemplateId,
        reframingPreset,
        removeSilence,
        silenceThresholdMs,
        removeFillers,
        smartAutoReframe,
        zoomStrength,
        speakerMode,
        smoothness,
        trackingSpeed,
        animatedCaptions,
      });
      setStatus("rendering");
    } catch (err: unknown) {
      // Only removes it if analysis never started — see discardDraftProject.
      if (createdId) await discardDraftProject(createdId, token);
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, []);

  /**
   * Kick off analysis for a project whose source video is ALREADY in place —
   * the URL-import path, where the video was pulled server-side rather than
   * uploaded from the browser. Everything after this point is identical to the
   * upload flow, so it shares the same status/polling state.
   */
  const generateAutoClipForProject = useCallback(async (params: {
    projectId: string;
    token: string;
    minDuration: number;
    maxDuration: number;
    clipCount: number;
    aspectRatio: string;
    instructions: string;
    captionStyleIndex: number;
    /** Clipiro caption template slug. null = captions off. The index above is
     *  derived from it and kept only for the public v1 API contract. */
    captionTemplateId?: string | null;
    reframingPreset?: string;
    removeSilence?: boolean;
    silenceThresholdMs?: number;
    removeFillers?: boolean;
    smartAutoReframe?: boolean;
    zoomStrength?: "low" | "medium" | "high";
    speakerMode?: "auto" | "single" | "split" | "active";
    smoothness?: number;
    trackingSpeed?: number;
    animatedCaptions?: boolean;
  }) => {
    const { projectId, token, ...rest } = params;
    setStatus("creating");
    setError(null);
    setVideoUrl(null);
    setProjectId(projectId);
    try {
      await callGenerate("/api/generate/auto-clip", token, { projectId, ...rest });
      setStatus("rendering");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("idle");
    setVideoUrl(null);
    setError(null);
    setProjectId(null);
    setProgress(0);
    setWarnings(null);
  }, []);

  return { status, videoUrl, error, projectId, progress, warnings, generateSplitScreen, generateStreamerVideo, generateAutoClip, generateAutoClipForProject, reset };
}
