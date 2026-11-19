// Which copy of the source a clip render reads, and what to fall back to.
//
// A re-render of one clip used to download the WHOLE source first: 1.1 GB for
// an 81-minute 1080p60 upload, to cut 30 seconds out of it. On Hostinger
// (20 MB/s I/O cap, 50 GB disk) that stalled past the download timeout and
// left full-size temp files behind (Sentry 2026-11-19). A re-render now hands
// ffmpeg the presigned S3 URL and lets its input seek fetch only the bytes
// the clip needs (see REMOTE_INPUT_OPTIONS in utils/ffmpeg-render.ts).
//
// Two cases still need the whole file on disk, and only those download it:
//   - the source's audio is corrupt: the repair (lib/audio-safe-source.ts)
//     rewrites the audio track of a local copy;
//   - reading over http failed (S3 refused, the link died past ffmpeg's own
//     reconnects): the resumable downloader (utils/download.ts) is the more
//     patient reader.

import { audioSafeSource, isCorruptAudioFailure } from "@/lib/audio-safe-source";
import { isRemoteInput } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";

/**
 * ffmpeg stderr of a run that died reading an http input, as opposed to one
 * the content or the filtergraph broke. Only these are worth a full download
 * and a second render: anything else would fail the same way from disk.
 */
export function isRemoteInputFailure(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /Server returned \d|HTTP error \d|Connection (?:timed out|reset|refused)|Operation timed out|Input\/output error|I\/O error|Error in the pull function|Failed to resolve hostname|Stream ends prematurely|End of file|Will reconnect at/i.test(text);
}

/**
 * Renders from `source`, falling back as needed:
 *   - remote source + corrupt audio → full download, audio repair, render;
 *   - remote source + http read failure → full download, render (and the
 *     audio repair after it, should the local render hit that too);
 *   - local source + corrupt audio → audio repair, render.
 * Anything else rethrows the render's own error. `localSource` downloads the
 * whole source and resolves to its path; it is only called on a fallback.
 * Without it, a remote source gets no fallback.
 */
export async function renderWithSourceFallbacks<T>(
  source: string,
  render: (source: string) => Promise<T>,
  localSource?: () => Promise<string>,
): Promise<T> {
  try {
    return await render(source);
  } catch (err) {
    const corrupt = isCorruptAudioFailure(err);
    if (!isRemoteInput(source)) {
      // A source whose AAC track is corrupt aborts every render on a frame
      // with an unconvertible channel count (CLIPIRO-WEB-14, 2026-11-19).
      // Rebuild the audio once and render from that copy.
      if (!corrupt) throw err;
      return render(await audioSafeSource(source));
    }
    if (!localSource || !(corrupt || isRemoteInputFailure(err))) throw err;
    logger.warn("auto-clip", corrupt
      ? "source audio is corrupt; downloading the whole source to repair it"
      : "reading the source over http failed; downloading the whole source instead", err);
    const local = await localSource();
    if (corrupt) return render(await audioSafeSource(local));
    return renderWithSourceFallbacks(local, render);
  }
}
