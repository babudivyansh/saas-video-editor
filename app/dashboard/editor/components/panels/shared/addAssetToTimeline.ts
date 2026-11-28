// Puts a library asset on the timeline: video goes after the last video clip,
// audio and images land at the playhead. Shared by the Media panel and the
// empty-project start screen. Throws if the duration can't be probed.

import { useEditorStore } from "../../../store/editorStore";
import { docDuration } from "@/lib/editor/doc-utils";
import { MAX_OVERLAY_LANES } from "@/lib/editor/types";
import { type AssetRow, probeDuration } from "./assetData";
import { playUiSound } from "../../../hooks/useUiSound";
import { showPanelToast } from "../../ui/PanelToast";
import { recordSourceDuration } from "../../../store/sourceDurations";

export async function addAssetToTimeline(asset: AssetRow, opts?: { asOverlay?: boolean }): Promise<void> {
  const store = useEditorStore.getState();
  if (asset.kind === "video" && opts?.asOverlay) {
    // Picture-in-picture at the playhead, top-right quarter, on the lowest
    // lane that is free at that time.
    const duration = asset.duration ?? (await probeDuration(asset.url, "video"));
    recordSourceDuration(asset.id, duration);
    const doc = useEditorStore.getState().doc;
    const at = useEditorStore.getState().currentTime;
    const busy = new Set(
      doc.tracks.overlay.filter((o) => at < o.timelineStart + o.duration && at + duration > o.timelineStart).map((o) => o.lane),
    );
    let lane = 0;
    while (busy.has(lane) && lane < MAX_OVERLAY_LANES - 1) lane++;
    store.addOverlayClip({
      type: "overlay",
      id: crypto.randomUUID(),
      assetId: asset.id,
      timelineStart: at,
      duration,
      srcIn: 0,
      volume: 1,
      muted: false,
      x: 0.72,
      y: 0.28,
      scalePct: 0.4,
      lane,
    });
    playUiSound("add");
    showPanelToast("Added as an overlay");
    return;
  }
  if (asset.kind === "video") {
    const duration = asset.duration ?? (await probeDuration(asset.url, "video"));
    recordSourceDuration(asset.id, duration);
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
    recordSourceDuration(asset.id, duration);
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
  playUiSound("add");
  showPanelToast(`Added to the ${asset.kind === "video" ? "video" : asset.kind === "audio" ? "audio" : "image"} track`);
}
