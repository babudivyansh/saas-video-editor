import { ApiError, NetworkError } from "@clipiro/shared";
import { AppState } from "react-native";
import { create } from "zustand";
import { abandonUpload, beginUpload, sendParts, UploadRefused, type SavedUpload, type UploadFile, type UploadIO } from "../create/upload";
import { deviceUploadIO } from "../create/uploadIo";

// Files uploading into Assets, one after another (decision 2026-10-09 A: a
// foreground queue). Same direct-to-storage multipart upload as AutoClip
// (src/features/create/upload.ts), but kept in memory only: a lost
// connection pauses the queue and it carries on when the app is back in the
// foreground (or on Retry); closing the app drops what hadn't finished.

export type QueueItem = {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: "queued" | "uploading" | "paused" | "done" | "failed";
  error: string | null;
};

type Queue = {
  items: QueueItem[];
  add: (files: UploadFile[]) => void;
  cancel: (id: string) => Promise<void>;
  retry: () => void;
  /** Hides finished and failed rows. */
  clearFinished: () => void;
};

let io: UploadIO = { ...deviceUploadIO, load: async () => null, save: async () => {} };
/** Tests swap the file access. */
export function setQueueIO(next: UploadIO) {
  io = { ...next, load: async () => null, save: async () => {} };
}
/** Called with each file that lands in Assets (the screen refreshes its lists). */
let onUploaded: () => void = () => {};
export function setQueueListener(fn: () => void) {
  onUploaded = fn;
}

const files = new Map<string, UploadFile>();
const states = new Map<string, { saved: SavedUpload; urls: Map<number, string> }>();
let running = false;
let controller: AbortController | null = null;
let seq = 0;

export const useUploadQueue = create<Queue>((set, get) => {
  const patch = (id: string, p: Partial<QueueItem>) => set({ items: get().items.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  async function pump() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = get().items.find((x) => x.status === "queued");
        if (!next) return;
        const file = files.get(next.id)!;
        controller = new AbortController();
        patch(next.id, { status: "uploading", error: null });
        try {
          let state = states.get(next.id);
          if (!state) {
            state = await beginUpload(io, file);
            states.set(next.id, state);
          }
          await sendParts(io, state.saved, state.urls, { signal: controller.signal, onProgress: (f) => patch(next.id, { progress: f }) });
          states.delete(next.id);
          files.delete(next.id);
          patch(next.id, { status: "done", progress: 1 });
          onUploaded();
        } catch (e) {
          if (get().items.find((x) => x.id === next.id)?.status !== "uploading") continue; // cancelled
          if (e instanceof UploadRefused || (e instanceof ApiError && e.status !== 401)) {
            await abandonUpload(io, states.get(next.id)?.saved ?? null);
            states.delete(next.id);
            patch(next.id, { status: "failed", error: e instanceof ApiError ? e.message : "Storage refused this file. Try again." });
          } else {
            // Lost connection: this file and everything after it wait.
            patch(next.id, { status: "paused", error: e instanceof NetworkError ? e.message : "Paused. It’ll carry on when you’re back online." });
            return;
          }
        }
      }
    } finally {
      running = false;
      controller = null;
    }
  }

  return {
    items: [],
    add: (list) => {
      const added = list.map((f) => {
        const id = `up${++seq}`;
        files.set(id, f);
        return { id, name: f.name, sizeBytes: f.sizeBytes, progress: 0, status: "queued" as const, error: null };
      });
      set({ items: [...get().items, ...added] });
      void pump();
    },
    cancel: async (id) => {
      const item = get().items.find((x) => x.id === id);
      if (!item) return;
      set({ items: get().items.filter((x) => x.id !== id) });
      if (item.status === "uploading") controller?.abort();
      files.delete(id);
      const state = states.get(id);
      states.delete(id);
      await abandonUpload(io, state?.saved ?? null);
    },
    retry: () => {
      set({ items: get().items.map((x) => (x.status === "paused" || x.status === "failed" ? { ...x, status: "queued" as const, error: null } : x)).filter((x) => x.status !== "failed" || files.has(x.id)) });
      void pump();
    },
    clearFinished: () => set({ items: get().items.filter((x) => x.status !== "done" && x.status !== "failed") }),
  };
});

// Back in the app after the connection dropped: carry on.
AppState.addEventListener("change", (s) => {
  if (s === "active" && useUploadQueue.getState().items.some((x) => x.status === "paused")) useUploadQueue.getState().retry();
});
