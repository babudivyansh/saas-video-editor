"use client";
import { useState, useCallback } from "react";
import { discardDraftProject } from "@/lib/discard-draft-project";

// Starts AutoClip runs. The only product left on this hook — the other
// create products it served were deleted, and with them the project-polling
// loop it used to carry (AutoClip's results page polls its own clips route).

export type GenerateStatus = "idle" | "uploading" | "creating" | "rendering" | "completed" | "failed";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

/**
 * Why a run was refused before it started, when the answer is "pay" rather
 * than "something broke". Kept separate from `error` because the page answers
 * it differently: it stays on the form (nothing ran, the draft is gone) and
 * offers a way forward — the top-up modal, or the upgrade page.
 *
 * These used to arrive as a thrown Error whose message was the server's bare
 * error code, so the user saw the literal text "insufficient_credits" under
 * "Something went wrong", with the upgrade link and the shortfall discarded.
 */
export type PaymentBlock =
  | { kind: "credits"; required?: number; balance?: number }
  | { kind: "free_limit"; message: string; upgradeUrl: string };

/** A non-2xx from the create route, with its status and body intact. */
export class GenerateError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `Generate failed (${status})`);
    this.name = "GenerateError";
  }
}

function paymentBlockFrom(err: unknown): PaymentBlock | null {
  if (!(err instanceof GenerateError) || err.status !== 402) return null;
  if (err.body.error === "free_limit_reached") {
    return {
      kind: "free_limit",
      message: typeof err.body.message === "string" ? err.body.message : "You've used this month's free Auto Clip videos.",
      upgradeUrl: typeof err.body.upgradeUrl === "string" ? err.body.upgradeUrl : "/pricing",
    };
  }
  return {
    kind: "credits",
    required: typeof err.body.required === "number" ? err.body.required : undefined,
    balance: typeof err.body.balance === "number" ? err.body.balance : undefined,
  };
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

async function callGenerate(token: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/generate/auto-clip", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GenerateError(res.status, await res.json().catch(() => ({})));
}

export interface RunSettings {
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
}

export function useVideoGenerate() {
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [paymentBlock, setPaymentBlock] = useState<PaymentBlock | null>(null);

  /** Upload a local file, create its project, start the run. */
  const generateAutoClip = useCallback(async (params: RunSettings & { file: File; token: string }) => {
    const { file, token, ...settings } = params;
    setStatus("uploading");
    setError(null);
    setPaymentBlock(null);
    let createdId: string | null = null;
    try {
      const uploadedVideoUrl = await uploadVideo(file, token);
      setStatus("creating");
      const pid = await createProject(token, { title: file.name, uploadedVideoUrl, productType: "auto-clip" });
      createdId = pid;
      // Charges up front and renders every clip — there is no review step.
      await callGenerate(token, { projectId: pid, ...settings });
      setProjectId(pid);
      setStatus("rendering");
    } catch (err: unknown) {
      // Only removes it if analysis never started — see discardDraftProject.
      if (createdId) await discardDraftProject(createdId, token);
      const block = paymentBlockFrom(err);
      if (block) {
        setPaymentBlock(block);
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("failed");
    }
  }, []);

  /**
   * Start a run for a project whose source is ALREADY in place — a URL
   * import, a library asset, or a retry of a failed project.
   *
   * A refusal is reported on the FORM, not by flipping to the results view:
   * returns to "idle" and rethrows, so the caller shows its own message. It
   * used to set "failed", which switched the page to the results view and hid
   * the caller's error behind a generic one. A payment refusal does not throw:
   * it is `paymentBlock`, which the page renders.
   */
  const generateAutoClipForProject = useCallback(async (params: RunSettings & { projectId: string; token: string }) => {
    const { projectId: pid, token, ...settings } = params;
    setStatus("creating");
    setError(null);
    setPaymentBlock(null);
    try {
      await callGenerate(token, { projectId: pid, ...settings });
      setProjectId(pid);
      setStatus("rendering");
    } catch (err: unknown) {
      setStatus("idle");
      const block = paymentBlockFrom(err);
      if (block) {
        setPaymentBlock(block);
        return "payment_blocked" as const;
      }
      throw err;
    }
    return "started" as const;
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setProjectId(null);
    setPaymentBlock(null);
  }, []);

  const clearPaymentBlock = useCallback(() => setPaymentBlock(null), []);

  return { status, error, projectId, paymentBlock, generateAutoClip, generateAutoClipForProject, reset, clearPaymentBlock };
}
