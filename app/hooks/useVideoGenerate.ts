"use client";
import { useState, useCallback, useRef, useEffect } from "react";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef(0);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = useCallback((projectId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
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
        const { project } = await res.json() as { project: { status: string; videoUrl?: string; progress?: number } };
        if (project.progress != null) setProgress(project.progress);
        if (project.status === "completed" && project.videoUrl) {
          clearInterval(pollRef.current!);
          setVideoUrl(project.videoUrl);
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
    file: File;
    bgVideoUrl: string;
    subtitleStyleIndex: number;
    mode: "oneword" | "lines";
    token: string;
  }) => {
    const { file, bgVideoUrl, subtitleStyleIndex, mode, token } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    try {
      const uploadedVideoUrl = await uploadVideo(file, token);
      setStatus("creating");
      const projectId = await createProject(token, {
        title: file.name,
        backgroundUrl: bgVideoUrl,
        subtitlesStyle: { styleIndex: subtitleStyleIndex, mode },
        uploadedVideoUrl,
        productType: "split-screen",
      });
      await callGenerate("/api/generate/split-screen", token, {
        projectId,
        bgVideoUrl,
        subtitleStyleIndex,
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
    file: File;
    titleText: string;
    subtitleStyleIndex: number;
    token: string;
  }) => {
    const { file, titleText, subtitleStyleIndex, token } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    try {
      const uploadedVideoUrl = await uploadVideo(file, token);
      setStatus("creating");
      const projectId = await createProject(token, {
        title: titleText || file.name,
        subtitlesStyle: { styleIndex: subtitleStyleIndex },
        uploadedVideoUrl,
        productType: "streamer-video",
      });
      await callGenerate("/api/generate/streamer-video", token, {
        projectId,
        titleText,
        subtitleStyleIndex,
      });
      setStatus("rendering");
      startPolling(projectId, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, [startPolling]);

  const generateRedditVideo = useCallback(async (params: {
    postTitle: string;
    username: string;
    script: string;
    introVoiceId: string;
    scriptVoiceId: string;
    bgMusicUrl: string;
    bgVideoUrl: string;
    subtitleStyleIndex: number;
    subtitleMode: "oneword" | "lines";
    token: string;
    voiceSettings?: { stability?: number; style?: number; similarityBoost?: number };
    language?: string;
    showIntroCard?: boolean;
    darkMode?: boolean;
    upvotes?: string;
    comments?: string;
  }) => {
    const { postTitle, username, script, introVoiceId, scriptVoiceId, bgMusicUrl, bgVideoUrl,
            subtitleStyleIndex, subtitleMode, token, voiceSettings, language,
            showIntroCard, darkMode, upvotes, comments } = params;
    setStatus("creating");
    setError(null);
    setVideoUrl(null);
    setProgress(0);
    try {
      const pid = await createProject(token, {
        title: postTitle || "Reddit Story Video",
        backgroundUrl: bgVideoUrl,
        script,
        voiceId: scriptVoiceId,
        musicUrl: bgMusicUrl || null,
        subtitlesStyle: { styleIndex: subtitleStyleIndex, mode: subtitleMode },
        productType: "reddit-video",
      });
      setProjectId(pid);
      await callGenerate("/api/generate/reddit-video", token, {
        projectId: pid,
        postTitle,
        username,
        script,
        introVoiceId,
        scriptVoiceId,
        bgMusicUrl,
        bgVideoUrl,
        subtitleStyleIndex,
        subtitleMode,
        voiceSettings,
        language,
        showIntroCard,
        darkMode,
        upvotes,
        comments,
        idempotencyKey: crypto.randomUUID(),
      });
      setStatus("rendering");
      startPolling(pid, token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, [startPolling]);

  const generateTextVideo = useCallback(async (params: {
    contactName: string;
    messages: { type: "receiver" | "sender"; text: string }[];
    theme: {
      bg: string; headerBg: string; headerText: string;
      receiverBubble: string; receiverText: string;
      senderBubble: string; senderText: string;
      id?: string;
    };
    bgVideoUrl: string;
    receiverVoiceId: string;
    narratorVoiceId: string;
    bgMusicUrl: string;
    voiceSettings?: { stability?: number; style?: number; similarityBoost?: number };
    language?: string;
    avatarBase64?: string;
    token: string;
  }) => {
    const { contactName, messages, theme, bgVideoUrl, receiverVoiceId, narratorVoiceId,
            bgMusicUrl, voiceSettings, language, avatarBase64, token } = params;
    setStatus("creating");
    setError(null);
    setVideoUrl(null);
    setProgress(0);
    try {
      const firstMsg = messages[0]?.text?.slice(0, 40) || "Text Video";
      const pid = await createProject(token, {
        title: firstMsg,
        backgroundUrl: bgVideoUrl,
        voiceId: receiverVoiceId,
        musicUrl: bgMusicUrl || null,
        productType: "text-video",
      });
      setProjectId(pid);
      await callGenerate("/api/generate/text-video", token, {
        projectId: pid,
        contactName,
        messages,
        theme,
        bgVideoUrl,
        receiverVoiceId,
        narratorVoiceId,
        bgMusicUrl,
        voiceSettings,
        language,
        avatarBase64,
        idempotencyKey: crypto.randomUUID(),
      });
      setStatus("rendering");
      startPolling(pid, token);
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
      file, minDuration, maxDuration, clipCount, aspectRatio, instructions, captionStyleIndex, token,
      reframingPreset, removeSilence, silenceThresholdMs, removeFillers,
      smartAutoReframe, zoomStrength, speakerMode, smoothness, trackingSpeed, animatedCaptions
    } = params;
    setStatus("uploading");
    setError(null);
    setVideoUrl(null);
    try {
      const uploadedVideoUrl = await uploadVideo(file, token);
      setStatus("creating");
      const pid = await createProject(token, {
        title: file.name,
        uploadedVideoUrl,
        productType: "auto-clip",
      });
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
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, []);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("idle");
    setVideoUrl(null);
    setError(null);
    setProjectId(null);
    setProgress(0);
  }, []);

  return { status, videoUrl, error, projectId, progress, generateSplitScreen, generateStreamerVideo, generateRedditVideo, generateTextVideo, generateAutoClip, reset };
}
