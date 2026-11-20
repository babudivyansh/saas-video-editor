// What AutoClip accepts as a source video, checked in the browser before an
// upload starts — the server only said no after the whole file had gone up.
// Shared by the AutoClip page and Home's launch box so they can't drift.

import {
  PLAN_NAME,
  TIER_MAX_AUTOCLIP_SOURCE_SECONDS,
  formatBytes,
  maxUploadBytesForTier,
  type TierId,
} from "@/lib/plans/tiers";

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/mov", "video/webm"];
export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];
export const MIN_SOURCE_SEC = 60;

// The limits are the plan's own (lib/plans/tiers.ts), the same numbers the
// server enforces and /pricing advertises. These used to be a flat 500 MB and
// 90 minutes, which blocked Creator, Pro and Studio users from the 1-5 GB,
// 2-6 hour sources their plan includes. When the plan isn't known yet (auth
// still loading) the check defers to the server rather than guess low.
const UNKNOWN_PLAN: TierId = "studio";

const planLabel = (tier: TierId) => PLAN_NAME[tier];

/** "30 min" / "1 h" / "2 h 30 min". */
function formatLength(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "MP4, MOV or WebM · up to 2 GB · 1 min to 4 h", for the drop zone's hint. */
export function sourceLimitsHint(tier: TierId | null | undefined): string {
  const plan = tier ?? UNKNOWN_PLAN;
  return `MP4, MOV or WebM · up to ${formatBytes(maxUploadBytesForTier(plan))} · 1 min to ${formatLength(TIER_MAX_AUTOCLIP_SOURCE_SECONDS[plan])}`;
}

/** Type and size, which are known the moment a file is chosen. */
export function sourceFileError(f: { type: string; name: string; size: number }, tier: TierId | null | undefined): string | null {
  const typeOk = ACCEPTED_VIDEO_TYPES.includes(f.type) || ACCEPTED_VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));
  if (!typeOk) return "That file isn't a supported video. Use MP4, MOV or WebM.";
  const plan = tier ?? UNKNOWN_PLAN;
  const maxBytes = maxUploadBytesForTier(plan);
  if (f.size > maxBytes) {
    return `That video is over ${formatBytes(maxBytes)}, the ${planLabel(plan)} plan's limit. Trim or compress it, or upgrade for larger files.`;
  }
  return null;
}

/** Length, once the file's metadata (or a library asset's record) has it. */
export function sourceDurationError(sec: number | null | undefined, tier: TierId | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec < MIN_SOURCE_SEC) return "That video is under a minute — AutoClip needs at least 1 minute of footage.";
  const plan = tier ?? UNKNOWN_PLAN;
  const maxSec = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[plan];
  if (sec > maxSec) {
    return `That video is over ${formatLength(maxSec)}, the ${planLabel(plan)} plan's limit. Trim it, or upgrade for longer videos.`;
  }
  return null;
}

/** A local video's length from its metadata; null if the browser can't read it. */
export function readVideoDuration(file: File, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    setTimeout(() => finish(null), timeoutMs);
    el.src = url;
  });
}
