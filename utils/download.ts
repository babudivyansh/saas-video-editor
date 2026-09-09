import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

/** Redirect hops allowed before we assume a loop. */
const MAX_REDIRECTS = 5;

export interface DownloadLimits {
  /**
   * Hard ceiling on bytes written. The transfer is aborted and the partial file
   * deleted the moment it is exceeded.
   *
   * This matters for any URL we did not generate ourselves — a third-party
   * render provider's output URL, say. Content-Length is a claim, not a
   * guarantee, so the count is enforced against bytes actually received rather
   * than the advertised header (the header IS checked first, as a cheap
   * early-out before a single byte is transferred).
   *
   * Omitted = unbounded, the historical behaviour, which is fine for our own S3.
   */
  maxBytes?: number;
  /** Internal: remaining redirect budget. */
  redirectsLeft?: number;
}

// `timeoutMs` bounds socket idle time — it resets on every chunk received, so
// it catches both a server that never responds AND a download that stalls
// partway through, not just a slow-but-steady one. Without this, a single
// wedged download could block its render queue forever (queues run one job
// at a time with no other watchdog).
export function downloadFile(
  url: string,
  destPath: string,
  timeoutMs = 5 * 60 * 1000,
  limits: DownloadLimits = {},
): Promise<void> {
  const { maxBytes } = limits;
  const redirectsLeft = limits.redirectsLeft ?? MAX_REDIRECTS;

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;

    const cleanup = () => {
      file.close();
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch { /* best effort */ }
      }
    };

    const request = protocol.get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        cleanup();
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new Error(`Download failed: redirect with no location for ${url}`));
          return;
        }
        // Without a budget a redirect loop recurses until the process dies.
        if (redirectsLeft <= 0) {
          reject(new Error(`Download failed: too many redirects for ${url}`));
          return;
        }
        downloadFile(redirectUrl, destPath, timeoutMs, { maxBytes, redirectsLeft: redirectsLeft - 1 })
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        cleanup();
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }

      if (maxBytes !== undefined) {
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          request.destroy();
          cleanup();
          reject(new Error(`Download rejected: ${declared} bytes exceeds the ${maxBytes}-byte limit for ${url}`));
          return;
        }

        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            request.destroy();
            cleanup();
            reject(new Error(`Download aborted: exceeded the ${maxBytes}-byte limit for ${url}`));
          }
        });
      }

      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Download timed out after ${timeoutMs}ms for ${url}`));
    });

    request.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

export function getAudioDurationMs(_audioPath: string): number {
  // Parse duration from MP3 frame headers is complex — instead we track it
  // via ElevenLabs word timings. This helper returns 0 as a safe default
  // when called without timings context; callers should use wordTimings instead.
  return 0;
}
