import type { Asset } from "@clipiro/shared";
import { createVideoPlayer } from "expo-video";

// A video picked from Files (or uploaded that way into Assets) has no length
// on record, and a clip needs one: the timeline would otherwise guess 5 s.
// The length is read by loading the file in a hidden player, as the web
// editor does with a <video> element.

/** The video's length in seconds, or null if it doesn't load within `timeoutMs`. */
export function probeDuration(uri: string, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolve) => {
    const player = createVideoPlayer(uri);
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loaded.remove();
      failed.remove();
      player.release();
      resolve(v);
    };
    const loaded = player.addListener("sourceLoad", (e) => finish(e.duration > 0 ? e.duration : null));
    const failed = player.addListener("statusChange", (e) => e.status === "error" && finish(null));
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/** Fills in the length of videos that have none on record (from their signed link). */
export async function withDurations(list: Asset[]): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const a of list) {
    out.push(a.kind === "video" && !a.durationSec && a.url ? { ...a, durationSec: await probeDuration(a.url) } : a);
  }
  return out;
}
