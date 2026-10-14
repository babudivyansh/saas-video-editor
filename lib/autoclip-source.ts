// What AutoClip accepts as a source video, checked in the browser before an
// upload starts — the server only said no after the whole file had gone up.
// Shared by the AutoClip page and Home's launch box so they can't drift.

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/mov", "video/webm"];
export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];
export const MAX_SOURCE_BYTES = 500 * 1024 * 1024;
export const MIN_SOURCE_SEC = 60;
export const MAX_SOURCE_SEC = 90 * 60;

/** Type and size, which are known the moment a file is chosen. */
export function sourceFileError(f: { type: string; name: string; size: number }): string | null {
  const typeOk = ACCEPTED_VIDEO_TYPES.includes(f.type) || ACCEPTED_VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));
  if (!typeOk) return "That file isn't a supported video. Use MP4, MOV or WebM.";
  if (f.size > MAX_SOURCE_BYTES) return "That video is over 500 MB. Trim or compress it, then try again.";
  return null;
}

/** Length, once the file's metadata (or a library asset's record) has it. */
export function sourceDurationError(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec < MIN_SOURCE_SEC) return "That video is under a minute — AutoClip needs at least 1 minute of footage.";
  if (sec > MAX_SOURCE_SEC) return "That video is over 1 h 30 m. Trim it and try again.";
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
