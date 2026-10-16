// Puts a library asset on the timeline: video goes after the last video clip,
// audio and images land at the playhead. Shared by the Media panel and the
// empty-project start screen. Throws if the duration can't be probed.

import { useEditorStore } from "../../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { type AssetRow, probeDuration } from "./assetData";

export async function addAssetToTimeline(asset: AssetRow): Promise<void> {
  const store = useEditorStore.getState();
  if (asset.kind === "video") {
    const duration = asset.duration ?? (await probeDuration(asset.url, "video"));
    const doc = useEditorStore.getState().doc;
    const last = doc.tracks.video[doc.tracks.video.length - 1];
    store.addVideoClip({
      type: "video",
      id: crypto.randomUUID(),
      assetId: asset.id,
      timelineStart: docDuration(doc) === 0 || !last ? 0 : last.timelineStart + last.duration,
      duration,
      srcIn: 0,
      volume: 1,
      muted: false,
    });
  } else if (asset.kind === "audio") {
    const duration = asset.duration ?? (await probeDuration(asset.url, "audio"));
    store.addAudioClip({
      type: "audio",
      id: crypto.randomUUID(),
      assetId: asset.id,
      timelineStart: useEditorStore.getState().currentTime,
      duration,
      srcIn: 0,
      volume: 0.5,
    });
  } else {
    store.addImageClip({
      type: "image",
      id: crypto.randomUUID(),
      assetId: asset.id,
      timelineStart: useEditorStore.getState().currentTime,
      duration: 4,
      x: 0.5,
      y: 0.5,
      scalePct: 1,
      opacity: 1,
    });
  }
}
