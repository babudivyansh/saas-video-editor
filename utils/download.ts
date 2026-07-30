import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

// `timeoutMs` bounds socket idle time — it resets on every chunk received, so
// it catches both a server that never responds AND a download that stalls
// partway through, not just a slow-but-steady one. Without this, a single
// wedged download could block its render queue forever (queues run one job
// at a time with no other watchdog).
export function downloadFile(url: string, destPath: string, timeoutMs = 5 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;

    const request = protocol.get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        file.close();
        fs.unlinkSync(destPath);
        const redirectUrl = res.headers.location!;
        downloadFile(redirectUrl, destPath, timeoutMs).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Download timed out after ${timeoutMs}ms for ${url}`));
    });

    request.on("error", (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
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
