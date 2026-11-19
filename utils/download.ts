import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { isPrivateHostLiteral, publicOnlyLookup } from "@/utils/network-guard";

/** Redirect hops allowed before we assume a loop. */
const MAX_REDIRECTS = 5;

/**
 * Applied when a caller sets no maxBytes of its own. Generous enough for any
 * source video we accept, but it means no download can fill the disk just
 * because the far end keeps streaming.
 */
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

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
   * Omitted = DEFAULT_MAX_BYTES.
   */
  maxBytes?: number;
  /**
   * For a URL the CLIENT supplied: a predicate every hop's hostname must pass,
   * the first request AND each redirect. Checking only the URL you were handed
   * is not enough — an allowed host that redirects to 169.254.169.254 or an
   * internal service would still be followed. When set, plain http is refused
   * too. Omitted = any host, which is fine for URLs we generated ourselves.
   */
  allowHost?: (hostname: string) => boolean;
  /** Internal: remaining redirect budget. */
  redirectsLeft?: number;
}

/**
 * Socket idle time before a transfer counts as stalled. Each stall is resumed
 * (below), so this is how long a dead connection is waited on, not a cap on
 * the whole download.
 */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 90_000;
/** Stalls or resets a single download may resume from before it gives up. */
export const MAX_DOWNLOAD_RESUMES = 4;

export class DownloadStalledError extends Error {
  constructor(timeoutMs: number, url: string) {
    super(`Download timed out after ${timeoutMs}ms for ${url}`);
    this.name = "DownloadStalledError";
  }
}

const RESUMABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNABORTED", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN"]);

/** A dropped or stalled connection: worth resuming, unlike an HTTP error or a full disk. */
export function isResumableDownloadError(err: unknown): boolean {
  if (err instanceof DownloadStalledError) return true;
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code && RESUMABLE_CODES.has(code)) return true;
  return err instanceof Error && /socket hang up|aborted|premature close/i.test(err.message);
}

function checkHop(url: string, allowHost?: (hostname: string) => boolean): Error | null {
  let parsed: URL | null = null;
  try { parsed = new URL(url); } catch { /* handled below */ }
  if (allowHost && (!parsed || parsed.protocol !== "https:" || !allowHost(parsed.hostname))) {
    return new Error(`Download refused: ${parsed ? parsed.host : "unparseable URL"} is not an allowed source`);
  }
  if (!parsed) return new Error("Download refused: unparseable URL");
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Error(`Download refused: unsupported protocol ${parsed.protocol}`);
  }
  // Every hop, every caller: never connect to a private/internal address
  // (cloud metadata, localhost, the VPC). IP literals skip DNS, so they are
  // checked here; hostnames are checked on the resolved address by the lookup.
  if (isPrivateHostLiteral(parsed.hostname)) {
    return new Error(`Download refused: ${parsed.host} is not a public address`);
  }
  return null;
}

// Downloads `url` to `destPath`.
//
// `timeoutMs` bounds socket idle time: it resets on every chunk, so it catches
// a server that never answers AND a transfer that stalls partway, without
// limiting a slow-but-steady one.
//
// A stall or a dropped connection after some bytes have arrived is RESUMED
// with an HTTP Range request from what is already on disk, up to
// MAX_DOWNLOAD_RESUMES times. It used to fail outright after five idle
// minutes, and the caller's retry started the whole file again: an
// 81-minute, 1.1 GB source failed an AutoClip run three times in a row that
// way (CLIPIRO-WEB-C/-1C, 2026-11-19), each attempt re-downloading from zero.
export function downloadFile(
  url: string,
  destPath: string,
  timeoutMs = DOWNLOAD_IDLE_TIMEOUT_MS,
  limits: DownloadLimits = {},
): Promise<void> {
  const { allowHost } = limits;
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;

  const refused = checkHop(url, allowHost);
  if (refused) return Promise.reject(refused);

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let settled = false;
    let resumes = 0;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try { fs.rmSync(destPath, { force: true }); } catch { /* best effort */ }
      reject(err);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const onDisk = () => {
      try { return fs.statSync(destPath).size; } catch { return 0; }
    };

    const start = (currentUrl: string, redirectsLeft: number, offset: number) => {
      const protocol = currentUrl.startsWith("https") ? https : http;
      const options = offset > 0
        ? { lookup: publicOnlyLookup, headers: { Range: `bytes=${offset}-` } }
        : { lookup: publicOnlyLookup };
      let file: fs.WriteStream | null = null;
      let attemptOver = false;

      // Resume from what reached the disk, or give up.
      const interrupted = (err: unknown) => {
        if (attemptOver || settled) return;
        attemptOver = true;
        request.destroy();
        const decide = () => {
          const have = onDisk();
          if (have > 0 && resumes < MAX_DOWNLOAD_RESUMES && isResumableDownloadError(err)) {
            resumes++;
            setTimeout(() => start(currentUrl, redirectsLeft, have), 1000 * resumes);
          } else {
            fail(err);
          }
        };
        if (file) {
          const f = file;
          f.once("error", () => {});
          // Flush what was already received before measuring it.
          f.end(() => decide());
        } else {
          decide();
        }
      };

      const request = protocol.get(currentUrl, options, (res) => {
        if (settled || attemptOver) { res.resume?.(); return; }
        const status = res.statusCode ?? 0;

        if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
          res.resume?.();
          attemptOver = true;
          const location = res.headers.location;
          if (!location) return fail(new Error(`Download failed: redirect with no location for ${currentUrl}`));
          // Without a budget a redirect loop recurses until the process dies.
          if (redirectsLeft <= 0) return fail(new Error(`Download failed: too many redirects for ${url}`));
          // Resolved against the current URL: a relative Location is legal, and
          // `new URL(relative)` alone would throw.
          let next: string;
          try { next = new URL(location, currentUrl).toString(); } catch {
            return fail(new Error(`Download failed: invalid redirect location for ${currentUrl}`));
          }
          const hopRefused = checkHop(next, allowHost);
          if (hopRefused) return fail(hopRefused);
          start(next, redirectsLeft - 1, offset);
          return;
        }

        // A resume must come back as 206; a 200 means the server ignored the
        // range, so the file is written again from the start.
        const append = offset > 0 && status === 206;
        if (!append && status !== 200) {
          res.resume?.();
          attemptOver = true;
          return fail(new Error(`Download failed: HTTP ${status} for ${currentUrl}`));
        }
        const base = append ? offset : 0;

        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && base + declared > maxBytes) {
          attemptOver = true;
          request.destroy();
          return fail(new Error(`Download rejected: ${base + declared} bytes exceeds the ${maxBytes}-byte limit for ${url}`));
        }

        const out = fs.createWriteStream(destPath, { flags: append ? "a" : "w" });
        file = out;
        // A full disk or quota is not worth resuming: fail at once, instead of
        // leaving the socket paused until the idle timeout fires.
        out.on("error", (err) => {
          if (attemptOver) return;
          attemptOver = true;
          request.destroy();
          fail(err);
        });

        let received = base;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes && !attemptOver) {
            attemptOver = true;
            request.destroy();
            out.destroy();
            fail(new Error(`Download aborted: exceeded the ${maxBytes}-byte limit for ${url}`));
          }
        });
        res.on("error", interrupted);
        res.on("aborted", () => interrupted(new Error("aborted")));

        res.pipe(out);
        out.on("finish", () => {
          if (attemptOver) return;
          // A body that ends short of its Content-Length is a dropped connection.
          if (Number.isFinite(declared) && received < base + declared) {
            interrupted(new Error("premature close"));
            return;
          }
          attemptOver = true;
          out.close(() => succeed());
        });
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy(new DownloadStalledError(timeoutMs, url));
      });
      request.on("error", interrupted);
    };

    start(url, limits.redirectsLeft ?? MAX_REDIRECTS, 0);
  });
}
