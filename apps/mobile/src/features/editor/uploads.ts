import { onQueueUploaded } from "../assets/uploadQueue";
import { findClip, insertAssets } from "./docOps";
import { useEditor } from "./store";

// Files picked in the editor's Upload tab go through the Assets upload queue
// (so they're in Assets too) and, as each one lands, onto the timeline where
// the playhead was when they were picked, one after another. A file that
// lands after the person has opened another edit only stays in Assets.

const waiting = new Map<string, { projectId: string; batch: number }>();
/** Where each batch's next file goes. */
const cursor = new Map<number, number>();
let batches = 0;

export function placeWhenUploaded(queueIds: string[], projectId: string, at: number) {
  const batch = ++batches;
  cursor.set(batch, at);
  for (const id of queueIds) waiting.set(id, { projectId, batch });
}

onQueueUploaded((id, asset) => {
  const w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  const s = useEditor.getState();
  if (s.projectId !== w.projectId) return;
  const r = insertAssets(s.doc, [asset], cursor.get(w.batch) ?? s.playhead);
  s.addMedia([asset]);
  s.edit(() => r.doc, r.selected);
  const clip = findClip(r.doc, r.selected);
  if (clip) cursor.set(w.batch, clip.timelineStart + clip.duration);
});
