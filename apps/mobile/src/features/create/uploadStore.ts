import { ApiError, NetworkError, type Asset } from "@clipiro/shared";
import { AppState } from "react-native";
import { create } from "zustand";
import { jobs } from "@/lib/api";
import { abandonUpload, beginUpload, partCount, sendParts, UploadRefused, type PendingRun, type SavedUpload, type UploadFile, type UploadIO } from "./upload";
import { deviceUploadIO } from "./uploadIo";

// The AutoClip upload in progress, and the run it starts when it finishes.
// One at a time. It lives outside the screen so it keeps going while the user
// looks around the app, and it resumes by itself when the app comes back to
// the foreground after losing the connection or being backgrounded.

export type AutoClipRefusal = { message: string; required: number | null; balance: number | null; overflowCredits: number | null };

type Status =
  /** Nothing under way. */
  | "idle"
  | "uploading"
  /** Stopped by the connection or the app being closed; resumable. */
  | "paused"
  /** Uploaded; asking the server to start the run. */
  | "starting"
  /** The run started: `jobId`. */
  | "started"
  /** Uploaded, but the run was refused for minutes or credits: `asset` + `refusal`. */
  | "short"
  /** Can't go on: `error`. */
  | "failed";

export type UploadState = {
  status: Status;
  fileName: string | null;
  /** 0–1. */
  progress: number;
  error: string | null;
  jobId: string | null;
  asset: Asset | null;
  refusal: AutoClipRefusal | null;
  saved: SavedUpload | null;
  /** Reads an interrupted upload from disk (at app start). */
  hydrate: () => Promise<void>;
  upload: (file: UploadFile, run: PendingRun) => Promise<void>;
  resume: () => Promise<void>;
  /** Stops and discards the upload. */
  cancel: () => Promise<void>;
  /** Back to idle once the screen has used the result. */
  clear: () => void;
};

let io: UploadIO = deviceUploadIO;
/** Tests swap the file access. */
export function setUploadIO(next: UploadIO) {
  io = next;
}

let controller: AbortController | null = null;
let cancelled = false;

const IDLE = { status: "idle" as const, fileName: null, progress: 0, error: null, jobId: null, asset: null, refusal: null, saved: null };

const savedProgress = (s: SavedUpload) => {
  const n = partCount(s);
  const done = Object.keys(s.etags).length;
  return n ? Math.min(done * s.partSizeBytes, s.file.sizeBytes) / s.file.sizeBytes : 0;
};

/** A refused run, read from the API's 402 (lib: autoClipRefusal on the server). */
function refusalOf(e: ApiError): AutoClipRefusal {
  return { message: e.message, required: e.body.required ?? null, balance: e.body.balance ?? null, overflowCredits: e.body.overflowCredits ?? null };
}

export const useAutoClipUpload = create<UploadState>((set, get) => {
  async function run(work: (signal: AbortSignal) => Promise<{ asset: Asset; run: PendingRun }>) {
    controller = new AbortController();
    cancelled = false;
    set({ status: "uploading", error: null });
    let result: { asset: Asset; run: PendingRun };
    try {
      result = await work(controller.signal);
    } catch (e) {
      if (cancelled) return; // cancel() already reset everything
      if (e instanceof UploadRefused || (e instanceof ApiError && e.status !== 401)) {
        await abandonUpload(io, get().saved);
        set({ ...IDLE, status: "failed", error: e instanceof ApiError ? e.message : "The upload didn’t go through. Try again." });
      } else {
        // No connection, or the app was backgrounded mid-part: the saved parts stay.
        set({ status: "paused", error: e instanceof NetworkError ? e.message : "Upload paused. It’ll carry on when you’re back online." });
      }
      return;
    } finally {
      controller = null;
    }
    set({ status: "starting", asset: result.asset, saved: null, progress: 1 });
    try {
      const { jobId } = await jobs.start({ type: "autoclip", source: { kind: "asset", assetId: result.asset.id }, settings: result.run.settings, allowCreditOverflow: result.run.allowCreditOverflow ?? false });
      set({ status: "started", jobId });
    } catch (e) {
      // The video is safely in Assets either way; the screen offers the next step.
      if (e instanceof ApiError && e.status === 402) set({ status: "short", refusal: refusalOf(e) });
      else set({ status: "failed", error: e instanceof ApiError || e instanceof NetworkError ? e.message : "Couldn’t start AutoClip. Try again." });
    }
  }

  const onProgress = (fraction: number) => set({ progress: fraction });

  return {
    ...IDLE,

    hydrate: async () => {
      if (get().status !== "idle") return;
      const saved = await io.load();
      if (!saved) return;
      if (!io.fileExists(saved.file.uri)) {
        await abandonUpload(io, saved); // Android cleared the picked copy: start over
        return;
      }
      set({ status: "paused", saved, fileName: saved.file.name, progress: savedProgress(saved), error: null });
    },

    upload: async (file, pending) => {
      if (get().status === "uploading" || get().status === "starting") return;
      set({ ...IDLE, fileName: file.name });
      await run(async (signal) => {
        const { saved, urls } = await beginUpload(io, file, pending);
        set({ saved });
        return { asset: await sendParts(io, saved, urls, { signal, onProgress }), run: pending };
      });
    },

    resume: async () => {
      const saved = get().saved;
      if (!saved || get().status === "uploading") return;
      await run(async (signal) => ({ asset: await sendParts(io, saved, new Map(), { signal, onProgress }), run: saved.run }));
    },

    cancel: async () => {
      cancelled = true;
      controller?.abort();
      const saved = get().saved;
      set(IDLE);
      await abandonUpload(io, saved);
    },

    clear: () => set(IDLE),
  };
});

// Back in the app after a pause (lost connection, or Android stopped the
// transfer while backgrounded): carry on where it stopped.
AppState.addEventListener("change", (s) => {
  if (s === "active" && useAutoClipUpload.getState().status === "paused") void useAutoClipUpload.getState().resume();
});
