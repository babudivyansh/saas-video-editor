// Pure logic behind the clip panel's one-click editing: framing the live
// caption preview like the render, knowing when the render that carries the
// user's latest change has landed, and saving changes one request at a time.
// No React here, so all of it is unit-tested directly (clipPanelLogic.test.ts).

/** A crop window at a clip-relative time, as fractions of the source frame (lib/reframe.ts). */
export interface CropKeyframe { tSec: number; x: number; y: number; w: number; h: number }

/** The crop in force at `tSec`: the last keyframe at or before it (the render holds each one). */
export function cropAt(keyframes: CropKeyframe[] | null | undefined, tSec: number): CropKeyframe | null {
  if (!keyframes?.length) return null;
  let cur = keyframes[0];
  for (const k of keyframes) {
    if (k.tSec <= tSec) cur = k;
    else break;
  }
  return cur;
}

/**
 * CSS object-position (percent, x then y) that shows the same part of the
 * source as `crop` in a box of `boxAspect` (w/h) filled with object-fit:cover.
 * The box always shows the whole short side of the source, so this centres
 * the box on the crop's centre and clamps it inside the frame. No crop means
 * centred, which is also the render's static fallback.
 */
export function coverObjectPosition(
  crop: CropKeyframe | null,
  srcAspect: number,
  boxAspect: number,
): { x: number; y: number } {
  if (!crop || !(srcAspect > 0) || !(boxAspect > 0)) return { x: 50, y: 50 };
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const pct = (centre: number, visible: number) => {
    if (visible >= 1) return 50;
    const left = Math.min(Math.max(centre - visible / 2, 0), 1 - visible);
    return Math.round((left / (1 - visible)) * 1000) / 10;
  };
  if (srcAspect >= boxAspect) {
    // Source is wider: full height shows, a vertical slice of the width.
    return { x: pct(cx, boxAspect / srcAspect), y: 50 };
  }
  return { x: 50, y: pct(cy, srcAspect / boxAspect) };
}

/** A media URL without its signature, so a re-signed URL for the same file compares equal. */
export function mediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

// ── Waiting for the render that carries the latest change ──────────────────
// Every render uploads to a new key, so a changed file path means one render
// landed. A change queued behind a render in flight ("queued_next") needs two:
// the one running and the one after it.

export interface RenderWait {
  /** Renders still to land before the video on screen shows the latest change. */
  left: number;
  /** The file path last seen. */
  path: string | null;
}

export type RenderWaitEvent =
  | { type: "committed"; deferred: boolean }
  | { type: "clip"; path: string | null; status: string };

export function renderWaitReducer(state: RenderWait, ev: RenderWaitEvent): RenderWait {
  if (ev.type === "committed") {
    return { ...state, left: Math.max(state.left, ev.deferred ? 2 : 1) };
  }
  // A failed render will not be followed by the one we were waiting for.
  if (ev.status === "failed") return { left: 0, path: ev.path };
  if (ev.path !== state.path) {
    return { left: state.path == null ? state.left : Math.max(0, state.left - 1), path: ev.path };
  }
  return state;
}

// ── Saving one change at a time ─────────────────────────────────────────────

export type CommitStatus = "idle" | "waiting" | "saving" | "error";

export interface CommitResult { deferred: boolean }

/**
 * Debounced, sequential, latest-wins saving for one control group. A burst of
 * changes (clicking through templates, dragging a slider) becomes one request
 * once the user pauses; a change made while a request is in flight is sent
 * after it, never alongside it, so the server sees them in order.
 */
export class CommitQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next: (() => Promise<CommitResult>) | null = null;
  private inFlight = false;
  status: CommitStatus = "idle";
  error: string | null = null;

  constructor(
    private readonly onChange: (q: CommitQueue) => void,
    private onCommitted: (r: CommitResult) => void = () => {},
  ) {}

  /** Who hears about a finished save (the component's latest callback). */
  setOnCommitted(fn: (r: CommitResult) => void): void {
    this.onCommitted = fn;
  }

  /** Queue `send` to run `delayMs` after the last call; replaces anything not yet sent. */
  schedule(send: () => Promise<CommitResult>, delayMs: number): void {
    this.next = send;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delayMs);
    this.set("waiting", null);
  }

  /** Send what is queued now (e.g. when the panel closes). */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.inFlight || !this.next) return;
    const send = this.next;
    this.next = null;
    this.inFlight = true;
    this.set("saving", null);
    try {
      const r = await send();
      this.onCommitted(r);
      this.inFlight = false;
      if (this.next) {
        // Something changed while this one was saving: send it straight away.
        void this.flush();
        return;
      }
      this.set(this.timer ? "waiting" : "idle", null);
    } catch (e) {
      this.inFlight = false;
      this.set("error", e instanceof Error ? e.message : "Couldn't save that change");
      if (this.next) void this.flush();
    }
  }

  get busy(): boolean {
    return this.inFlight || this.timer != null || this.next != null;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(status: CommitStatus, error: string | null) {
    this.status = status;
    this.error = error;
    this.onChange(this);
  }
}

/** The price line for a control that re-renders the clip. */
export function rerenderPriceLabel(rerenderCount: number, price: number | null): string {
  if (rerenderCount === 0 || price === 0) return "free";
  if (price == null) return "may cost credits";
  return `${price} credit${price === 1 ? "" : "s"}`;
}

// ── Transcript tab ──────────────────────────────────────────────────────────

/** 6800 (ms) -> "0:06.8" */
export function fmtStamp(ms: number): string {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Splits a word-timed transcript into caption-sized lines (indexes into the
 * word list): a new line after sentence punctuation, after a pause, or at
 * eight words. Only for reading and editing; the render does its own grouping.
 */
export function groupTranscriptLines(words: { word: string; start: number; end: number }[]): number[][] {
  const lines: number[][] = [];
  let cur: number[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length > 0 && prev && (cur.length >= 8 || w.start - prev.end > 600 || /[.?!]["')\]]?$/.test(prev.word))) {
      lines.push(cur);
      cur = [];
    }
    cur.push(i);
  });
  if (cur.length > 0) lines.push(cur);
  return lines;
}

/**
 * Clip-relative words moved onto a new trim window: shifted by the change in
 * start, clipped to the new length, words outside it dropped. The same rule as
 * the server's rebaseClipWords (lib/autoclip-pipeline.ts, server-only), for a
 * draft that sends corrected words and a new trim in one render.
 */
export function rebaseWords<W extends { start: number; end: number }>(words: W[], oldStartSec: number, newStartSec: number, newEndSec: number): W[] {
  const shiftMs = (newStartSec - oldStartSec) * 1000;
  const lengthMs = (newEndSec - newStartSec) * 1000;
  return words
    .map((w) => ({ ...w, start: w.start - shiftMs, end: w.end - shiftMs }))
    .filter((w) => w.end > 0 && w.start < lengthMs)
    .map((w) => ({ ...w, start: Math.max(0, w.start), end: Math.min(lengthMs, w.end) }));
}
