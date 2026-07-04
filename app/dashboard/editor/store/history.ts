// Hand-rolled undo/redo: a snapshot stack of TimelineDoc. Actions push a
// snapshot on *commit* (pointer-up after a drag, blur after a text edit),
// never per intermediate frame, so stacks stay small and undo feels sane.

import type { TimelineDoc } from "@/lib/editor/types";

const MAX_SNAPSHOTS = 50;

export interface HistoryState {
  past: TimelineDoc[];
  future: TimelineDoc[];
}

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

/** Record `current` before it is about to be mutated. Clears the redo stack. */
export function pushHistory(h: HistoryState, current: TimelineDoc): HistoryState {
  const past = [...h.past, structuredClone(current)];
  if (past.length > MAX_SNAPSHOTS) past.shift();
  return { past, future: [] };
}

export function undo(h: HistoryState, current: TimelineDoc): { history: HistoryState; doc: TimelineDoc } | null {
  if (h.past.length === 0) return null;
  const past = [...h.past];
  const doc = past.pop()!;
  return { history: { past, future: [...h.future, structuredClone(current)] }, doc };
}

export function redo(h: HistoryState, current: TimelineDoc): { history: HistoryState; doc: TimelineDoc } | null {
  if (h.future.length === 0) return null;
  const future = [...h.future];
  const doc = future.pop()!;
  return { history: { past: [...h.past, structuredClone(current)], future }, doc };
}
