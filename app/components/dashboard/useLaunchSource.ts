"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUploadQueue } from "@/app/dashboard/assets/hooks/useUploadQueue";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { getStoredToken, useVideoGenerate, type RunSettings } from "@/app/hooks/useVideoGenerate";
import { discardDraftProject } from "@/lib/discard-draft-project";
import { readVideoDuration, sourceDurationError, sourceFileError } from "@/lib/autoclip-source";
import { projectHref } from "@/lib/project-links";

// The video behind Home's launch box: a file from the computer, uploaded right
// here (through the Assets library's uploader, so it also lands in Assets), or
// a video picked from Assets. "Get clips in 1 click" then starts the run with
// the presets under the box and opens its project page.

export type LaunchState = "uploading" | "processing" | "ready" | "error";

export interface LaunchSourceView {
  name: string;
  state: LaunchState;
  progress: number;
  error: string | null;
  /** The asset's thumbnail once there is one, else the local file to draw a frame from. */
  thumbnailUrl: string | null;
  localUrl: string | null;
}

type Source =
  | { kind: "upload"; itemId: string; localUrl: string }
  | { kind: "asset"; asset: PickerAsset };

export function useLaunchSource() {
  const router = useRouter();
  const queue = useUploadQueue();
  const creditModal = useInsufficientCredits();
  const { generateAutoClipForProject, paymentBlock, clearPaymentBlock } = useVideoGenerate();
  const [source, setSource] = useState<Source | null>(null);
  const [checking, setChecking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // A run refused for credits opens the top-up straight away, as on the
  // AutoClip page: the user asked to spend, so the next step is paying.
  useEffect(() => {
    if (paymentBlock?.kind === "credits") {
      creditModal.open({ required: paymentBlock.required, balance: paymentBlock.balance, action: "Auto Clips" });
    }
  }, [paymentBlock, creditModal]);

  const resetMessages = useCallback(() => {
    setPickError(null);
    setStartError(null);
    clearPaymentBlock();
  }, [clearPaymentBlock]);

  const dropUpload = useCallback((s: Source | null) => {
    if (s?.kind !== "upload") return;
    const item = queue.items.find((i) => i.id === s.itemId);
    if (item && (item.status === "uploading" || item.status === "paused")) queue.cancel(s.itemId);
    queue.dismiss(s.itemId);
    URL.revokeObjectURL(s.localUrl);
  }, [queue]);

  const clear = useCallback(() => {
    dropUpload(source);
    setSource(null);
    resetMessages();
  }, [source, dropUpload, resetMessages]);

  const chooseFile = useCallback(async (file: File) => {
    resetMessages();
    const fileError = sourceFileError(file);
    if (fileError) { setPickError(fileError); return; }
    // Length is checked before a byte goes up: an hour-long upload that
    // AutoClip then refuses is the worst way to find out.
    setChecking(true);
    const durationError = sourceDurationError(await readVideoDuration(file));
    setChecking(false);
    if (durationError) { setPickError(durationError); return; }
    dropUpload(source);
    const [itemId] = await queue.addFiles([file]);
    setSource({ kind: "upload", itemId, localUrl: URL.createObjectURL(file) });
  }, [queue, source, dropUpload, resetMessages]);

  const chooseAsset = useCallback((asset: PickerAsset) => {
    resetMessages();
    if (asset.kind !== "video") { setPickError("Pick a video. AutoClip cuts clips from video."); return; }
    const durationError = sourceDurationError(asset.duration);
    if (durationError) { setPickError(durationError); return; }
    dropUpload(source);
    setSource({ kind: "asset", asset });
  }, [source, dropUpload, resetMessages]);

  // What the bar shows, and what a run would start from.
  let view: LaunchSourceView | null = null;
  let videoUrl: string | null = null;
  if (source?.kind === "asset") {
    view = { name: source.asset.name, state: "ready", progress: 100, error: null, thumbnailUrl: source.asset.thumbnailUrl, localUrl: null };
    videoUrl = source.asset.url;
  } else if (source?.kind === "upload") {
    const item = queue.items.find((i) => i.id === source.itemId);
    const base = { name: item?.file.name ?? "", thumbnailUrl: null, localUrl: source.localUrl };
    if (!item || item.status === "uploading" || item.status === "paused") {
      view = { ...base, state: "uploading", progress: item?.progress ?? 0, error: null };
    } else if (item.status === "processing") {
      view = { ...base, state: "processing", progress: 100, error: null };
    } else if (item.status === "done" || item.status === "duplicate") {
      view = { ...base, state: "ready", progress: 100, error: null, thumbnailUrl: item.asset?.thumbnailUrl ?? null };
      videoUrl = item.asset?.url ?? null;
    } else {
      view = { ...base, state: "error", progress: item.progress, error: item.error ?? "The upload stopped. Try again." };
    }
  }

  const retryUpload = useCallback(() => {
    if (source?.kind === "upload") queue.retry(source.itemId);
  }, [source, queue]);

  const name = view?.name ?? "";
  const ready = view?.state === "ready" && !!videoUrl;
  const start = useCallback(async (settings: RunSettings) => {
    if (!ready || !videoUrl || starting) return;
    const token = getStoredToken();
    if (!token) return;
    setStarting(true);
    resetMessages();
    let createdId: string | null = null;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, uploadedVideoUrl: videoUrl, productType: "auto-clip" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Couldn't start from this video");
      createdId = body.project.id as string;
      const outcome = await generateAutoClipForProject({ projectId: createdId, token, ...settings });
      if (outcome === "payment_blocked") {
        // Nothing ran, so the draft is an empty shell.
        await discardDraftProject(createdId, token);
        setStarting(false);
        return;
      }
      router.push(projectHref(createdId));
    } catch (e) {
      if (createdId) await discardDraftProject(createdId, token);
      setStartError(e instanceof Error ? e.message : "Couldn't start from this video");
      setStarting(false);
    }
  }, [ready, videoUrl, name, starting, generateAutoClipForProject, router, resetMessages]);

  // The asset to hand the AutoClip page when a run needs its options (a
  // minutes shortfall can be paid in credits there).
  const assetId = source?.kind === "asset" ? source.asset.id : source?.kind === "upload" ? queue.items.find((i) => i.id === source.itemId)?.asset?.id ?? null : null;

  return {
    view, ready, checking, starting, pickError, startError, paymentBlock, assetId,
    chooseFile, chooseAsset, clear, retryUpload, start,
  };
}
