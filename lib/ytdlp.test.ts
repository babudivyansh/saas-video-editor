import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What the yt-dlp runner hands the process: binary choice, cookies, proxy.

const calls: Array<{ url: string; flags: Record<string, unknown>; opts: { env?: NodeJS.ProcessEnv }; cookieFile?: string }> = [];
vi.mock("youtube-dl-exec", () => ({
  create: () => async (url: string, flags: Record<string, unknown>, opts: { env?: NodeJS.ProcessEnv }) => {
    const cookies = typeof flags.cookies === "string" ? flags.cookies : undefined;
    calls.push({ url, flags, opts, cookieFile: cookies ? fs.readFileSync(cookies, "utf8") : undefined });
    return { ok: true };
  },
}));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn() } }));
vi.mock("@/lib/ensure-executable", () => ({ ensureExecutable: vi.fn() }));

const { ytDlpCandidates, resolveYtDlpBin, runYtDlp, configuredCookies, ytDlpErrorText, YtDlpError } = await import("./ytdlp");

const COOKIES = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n";
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

beforeEach(() => {
  calls.length = 0;
  warn.mockClear();
  delete process.env.YTDLP_COOKIES_B64;
  delete process.env.YTDLP_PROXY;
});
afterEach(() => {
  delete process.env.YTDLP_COOKIES_B64;
  delete process.env.YTDLP_PROXY;
});

describe("binary resolution", () => {
  it("prefers the pinned standalone build on Linux, never the Python zipapp first", () => {
    const c = ytDlpCandidates("/app", "linux");
    expect(c[0]).toBe(path.join("/app", "vendor", "yt-dlp", "yt-dlp"));
    expect(c[1]).toBe(path.join("/app", "node_modules", "youtube-dl-exec", "bin", "yt-dlp"));
  });

  it("uses youtube-dl-exec's own binary on Windows", () => {
    expect(ytDlpCandidates("C:/app", "win32")).toEqual([path.join("C:/app", "node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe")]);
  });

  it("picks the vendored binary when it exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytdlp-res-"));
    try {
      fs.mkdirSync(path.join(dir, "vendor", "yt-dlp"), { recursive: true });
      fs.writeFileSync(path.join(dir, "vendor", "yt-dlp", "yt-dlp"), "");
      fs.mkdirSync(path.join(dir, "node_modules", "youtube-dl-exec", "bin"), { recursive: true });
      fs.writeFileSync(path.join(dir, "node_modules", "youtube-dl-exec", "bin", "yt-dlp"), "");
      expect(resolveYtDlpBin(dir, "linux")).toBe(path.join(dir, "vendor", "yt-dlp", "yt-dlp"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to PATH when nothing is installed", () => {
    expect(resolveYtDlpBin(path.join(os.tmpdir(), "does-not-exist-ytdlp"), "linux")).toBe("yt-dlp");
  });
});

describe("cookies (YTDLP_COOKIES_B64)", () => {
  it("not set → no --cookies", async () => {
    await runYtDlp("https://x", { dumpSingleJson: true });
    expect(calls[0].flags.cookies).toBeUndefined();
  });

  it("hands yt-dlp a private per-call copy, then deletes it", async () => {
    process.env.YTDLP_COOKIES_B64 = b64(COOKIES);
    await runYtDlp("https://x", { dumpSingleJson: true });
    await runYtDlp("https://y", { dumpSingleJson: true });
    expect(calls[0].cookieFile).toBe(COOKIES);
    expect(calls[0].flags.cookies).not.toBe(calls[1].flags.cookies); // no shared jar between concurrent jobs
    await new Promise((r) => setTimeout(r, 20)); // unlink is fire-and-forget
    expect(fs.existsSync(calls[0].flags.cookies as string)).toBe(false);
  });

  it("ignores a value that isn't a base64 Netscape cookies file, and says so", async () => {
    process.env.YTDLP_COOKIES_B64 = b64("SID=abc; HSID=def");
    expect(configuredCookies()).toBeNull();
    expect(warn).toHaveBeenCalled();
    await runYtDlp("https://x", {});
    expect(calls[0].flags.cookies).toBeUndefined();
  });
});

describe("proxy (YTDLP_PROXY)", () => {
  it("goes in the child's environment, never on the command line", async () => {
    // youtube-dl-exec copies the command line into its error messages,
    // which reach logs and Sentry — a --proxy flag would leak the password.
    process.env.YTDLP_PROXY = "http://user:secret@proxy.example:8080";
    await runYtDlp("https://x", { dumpSingleJson: true });
    expect(JSON.stringify(calls[0].flags)).not.toContain("secret");
    expect(calls[0].opts.env?.HTTPS_PROXY).toBe("http://user:secret@proxy.example:8080");
    expect(calls[0].opts.env?.HTTP_PROXY).toBe("http://user:secret@proxy.example:8080");
  });

  it("not set → the parent environment is inherited untouched", async () => {
    await runYtDlp("https://x", {});
    expect(calls[0].opts.env).toBeUndefined();
  });
});

describe("error text", () => {
  it("prefers yt-dlp's ERROR line", () => {
    expect(ytDlpErrorText({ stderr: "WARNING: x\nERROR: [youtube] abc: Sign in to confirm you're not a bot\n" }))
      .toBe("[youtube] abc: Sign in to confirm you're not a bot");
  });

  it("uses the last line of a Python traceback (the exception)", () => {
    expect(ytDlpErrorText({ stderr: "Traceback (most recent call last):\n  File \"runpy.py\"\nImportError: needs 3.10\n" }))
      .toBe("ImportError: needs 3.10");
  });

  it("falls back to the message (spawn ENOENT has no stderr)", () => {
    expect(ytDlpErrorText(new Error("spawn yt-dlp ENOENT"))).toBe("spawn yt-dlp ENOENT");
  });

  it("YtDlpError carries the cause in its message, capped", () => {
    const e = new YtDlpError("ctx", "x".repeat(2000));
    expect(e.name).toBe("YtDlpError");
    expect(e.message.startsWith("ctx: x")).toBe(true);
    expect(e.message.length).toBeLessThan(520);
  });
});
