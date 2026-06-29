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

export function useVideoGenerate() {
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = useCallback((projectId: string, token: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
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
        // transient network error — keep polling
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
    token: string;
  }) => {
    const { file, minDuration, maxDuration, clipCount, aspectRatio, instructions, token } = params;
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
      await callGenerate("/api/generate/auto-clip", token, {
        projectId: pid,
        minDuration,
        maxDuration,
        clipCount,
        aspectRatio,
        instructions,
      });
      setStatus("rendering");
      // Auto Clip shows every clip individually: the page polls
      // /api/projects/{pid}/clips, so no single merged-video poll here.
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
