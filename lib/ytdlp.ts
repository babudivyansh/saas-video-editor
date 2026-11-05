import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { create as createYoutubeDl } from "youtube-dl-exec";
import { ensureExecutable } from "@/lib/ensure-executable";
import { logger } from "@/lib/logger";

// The one place yt-dlp is resolved and run. Used by the YouTube and Instagram
// downloaders (lib/downloader-route.ts) and AutoClip's import-from-URL
// (lib/url-import.ts), which each used to resolve the binary themselves.
//
// Binary: on Linux, prefer the pinned standalone build from
// scripts/install-ytdlp.mjs (vendor/yt-dlp/yt-dlp_linux, the one-directory build). youtube-dl-exec's own
// Linux `yt-dlp` is a Python zipapp that needs Python >= 3.11 on the host;
// clipiro.com has 3.9, so it crashed on every call. Windows/macOS dev keeps
// youtube-dl-exec's binary.
//
// Network (both optional, read per call so a restart is all a change needs):
//   YTDLP_COOKIES_B64  base64 of a Netscape-format cookies.txt. YouTube asks a
//                      datacenter IP to "sign in to confirm you're not a bot",
//                      and Instagram wants a login for most reels; cookies from
//                      a logged-in (throwaway) account get past both.
//   YTDLP_PROXY        proxy URL (http://user:pass@host:port, socks5://…).
//                      Handed to yt-dlp as HTTPS_PROXY in its environment, not
//                      as --proxy: youtube-dl-exec puts the whole command line
//                      into its error messages, which reach logs and Sentry.

export function ytDlpCandidates(cwd = process.cwd(), platform: NodeJS.Platform = process.platform): string[] {
  const pkgBin = path.join(cwd, "node_modules", "youtube-dl-exec", "bin", platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  return platform === "linux" ? [path.join(cwd, "vendor", "yt-dlp", "yt-dlp_linux"), pkgBin] : [pkgBin];
}

export function resolveYtDlpBin(cwd = process.cwd(), platform: NodeJS.Platform = process.platform): string {
  const found = ytDlpCandidates(cwd, platform).find((p) => fs.existsSync(p));
  if (!found) return "yt-dlp"; // PATH fallback; the build's verify:ytdlp step catches a deploy without one
  // Standalone deploys can strip the execute bit → spawn EACCES.
  ensureExecutable(found);
  // On Windows, youtube-dl-exec runs a binary whose path contains whitespace
  // through cmd.exe (shell: true). cmd then reads the `<` in a format string
  // like `bestvideo[height<=720]` as an input redirect, and every download
  // failed with "The system cannot find the file specified" (the info call
  // has no `<`, so it worked). A cwd-relative path has no whitespace — the
  // candidates all live under cwd — so no shell is involved; spawn resolves
  // it against the process cwd.
  if (platform === "win32" && /\s/.test(found)) {
    const rel = path.relative(cwd, found);
    if (!/\s/.test(rel) && !path.isAbsolute(rel)) return rel;
  }
  return found;
}

/** yt-dlp needs a JavaScript runtime to solve YouTube's player challenge
 *  ("YouTube extraction without a JS runtime has been deprecated, and some
 *  formats may be missing"). It only looks for deno by default; the node
 *  running this server is always there, so hand it that. */
export function jsRuntimeFlag(execPath = process.execPath): string | null {
  return /node(\.exe)?$/i.test(path.basename(execPath)) ? `node:${execPath}` : null;
}

export const YTDLP_BIN = resolveYtDlpBin();
const runner = createYoutubeDl(YTDLP_BIN);

const NETSCAPE_HEADER = /^#\s*(Netscape )?HTTP Cookie File/i;
let cookiesCache: { raw: string; text: string | null } | null = null;

/** The decoded cookies.txt, or null when unset or not a cookies file. */
export function configuredCookies(): string | null {
  const raw = process.env.YTDLP_COOKIES_B64?.trim() ?? "";
  if (cookiesCache?.raw === raw) return cookiesCache.text;
  let text: string | null = null;
  if (raw) {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const firstLine = decoded.split(/\r?\n/).find((l) => l.trim()) ?? "";
    if (NETSCAPE_HEADER.test(firstLine)) text = decoded;
    else logger.warn("ytdlp", "YTDLP_COOKIES_B64 is set but is not a base64 Netscape cookies.txt — ignoring it");
  }
  cookiesCache = { raw, text };
  return text;
}

export function configuredProxy(): string | null {
  return process.env.YTDLP_PROXY?.trim() || null;
}

export type YtDlpFlags = Record<string, unknown>;

/** Env vars that make every `node` started from this process load extra code. */
const NODE_PRELOAD_VARS = ["NODE_OPTIONS"] as const;
let preloadLogged = false;

/**
 * The environment yt-dlp runs with. yt-dlp starts `node` to solve YouTube's JS
 * challenge and parses its stdout as JSON. Hostinger preloads a console
 * wrapper into the app (its runtime logs are JSON lines), and a NODE_OPTIONS
 * preload is inherited by every child node — so the solver's answer came back
 * wrapped as {"level":"LOG","message":…}, and yt-dlp failed with
 * `[jsc] Unexpected error solving … using "node" provider: KeyError('type')`
 * (prod, 2026-11-05; reproduced with a console-wrapping --require preload).
 * The child gets the environment without those vars.
 */
export function ytDlpChildEnv(base: NodeJS.ProcessEnv = process.env, proxy: string | null = configuredProxy()): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  const stripped = NODE_PRELOAD_VARS.filter((k) => env[k] !== undefined);
  for (const k of stripped) delete env[k];
  if (stripped.length && !preloadLogged) {
    preloadLogged = true;
    // Names only: the values can carry paths or flags nobody needs in logs.
    logger.info("ytdlp", `not passing ${stripped.join(", ")} to yt-dlp's JS runtime`);
  }
  if (proxy) Object.assign(env, { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, https_proxy: proxy, http_proxy: proxy });
  return env;
}

/**
 * Run yt-dlp on one URL. Returns parsed JSON for --dump-single-json, stdout
 * otherwise; rejects with youtube-dl-exec's error (stderr on `.stderr`).
 */
export async function runYtDlp(url: string, flags: YtDlpFlags): Promise<unknown> {
  // yt-dlp writes the cookie jar back on exit, so each call gets its own copy:
  // concurrent jobs sharing one file could corrupt it.
  const cookies = configuredCookies();
  const cookiesPath = cookies ? path.join(os.tmpdir(), `ytdlp-cookies-${randomUUID()}.txt`) : null;
  if (cookiesPath) fs.writeFileSync(cookiesPath, cookies!, { mode: 0o600 });

  const opts = { env: ytDlpChildEnv() };

  try {
    // youtube-dl-exec's Flags type predates several yt-dlp options this code
    // uses (useExtractors, …); it forwards every key as a --flag regardless.
    const jsRuntime = jsRuntimeFlag();
    return await runner(
      url,
      { ...flags, ...(jsRuntime ? { jsRuntimes: jsRuntime } : {}), ...(cookiesPath ? { cookies: cookiesPath } : {}) } as never,
      opts as never,
    );
  } finally {
    if (cookiesPath) fs.promises.unlink(cookiesPath).catch(() => {});
  }
}

/**
 * The useful line of a yt-dlp failure: its `ERROR:` line, else the last line
 * of stderr (a Python traceback ends with the exception), else the message.
 */
export function ytDlpErrorText(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const lines = (e.stderr ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errorLine = lines.find((l) => l.startsWith("ERROR"));
  if (errorLine) return errorLine.replace(/^ERROR:\s*/, "");
  if (lines.length) return lines[lines.length - 1];
  return e.message ?? String(err);
}

/** An Error carrying the yt-dlp failure text, so Sentry shows the real cause
 *  instead of only the log line ("info fetch failed"). */
export class YtDlpError extends Error {
  constructor(context: string, raw: string) {
    super(`${context}: ${raw.slice(0, 500) || "unknown yt-dlp failure"}`);
    this.name = "YtDlpError";
  }
}
