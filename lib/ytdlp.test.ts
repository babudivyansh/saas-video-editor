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

const { ytDlpCandidates, resolveYtDlpBin, runYtDlp, configuredCookies, ytDlpErrorText, YtDlpError, jsRuntimeFlag, ytDlpChildEnv } = await import("./ytdlp");

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
    expect(c[0]).toBe(path.join("/app", "vendor", "yt-dlp", "yt-dlp_linux"));
    expect(c[1]).toBe(path.join("/app", "node_modules", "youtube-dl-exec", "bin", "yt-dlp"));
  });

  it("uses youtube-dl-exec's own binary on Windows", () => {
    expect(ytDlpCandidates("C:/app", "win32")).toEqual([path.join("C:/app", "node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe")]);
  });

  it("picks the vendored binary when it exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytdlp-res-"));
    try {
      fs.mkdirSync(path.join(dir, "vendor", "yt-dlp"), { recursive: true });
      fs.writeFileSync(path.join(dir, "vendor", "yt-dlp", "yt-dlp_linux"), "");
      fs.mkdirSync(path.join(dir, "node_modules", "youtube-dl-exec", "bin"), { recursive: true });
      fs.writeFileSync(path.join(dir, "node_modules", "youtube-dl-exec", "bin", "yt-dlp"), "");
      expect(resolveYtDlpBin(dir, "linux")).toBe(path.join(dir, "vendor", "yt-dlp", "yt-dlp_linux"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("on Windows, avoids a whitespace path so youtube-dl-exec never goes through cmd.exe", () => {
    // cmd.exe read `<` in `bestvideo[height<=720]` as a redirect: every download
    // failed with "The system cannot find the file specified".
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytdlp space "));
    try {
      const bin = path.join(dir, "node_modules", "youtube-dl-exec", "bin");
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, "yt-dlp.exe"), "");
      const resolved = resolveYtDlpBin(dir, "win32");
      expect(resolved).toBe(path.join("node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe"));
      expect(resolved).not.toMatch(/\s/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to PATH when nothing is installed", () => {
    expect(resolveYtDlpBin(path.join(os.tmpdir(), "does-not-exist-ytdlp"), "linux")).toBe("yt-dlp");
  });
});

describe("JS runtime for YouTube's player challenge", () => {
  it("hands yt-dlp the node running the server", async () => {
    expect(jsRuntimeFlag("/usr/bin/node")).toBe("node:/usr/bin/node");
    expect(jsRuntimeFlag("C:\\Program Files\\nodejs\\node.exe")).toBe("node:C:\\Program Files\\nodejs\\node.exe");
    await runYtDlp("https://x", {});
    expect(calls[0].flags.jsRuntimes).toBe(`node:${process.execPath}`);
  });

  it("passes nothing when not running under node", () => {
    expect(jsRuntimeFlag("/usr/bin/bun")).toBeNull();
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

  it("not set → no proxy vars are added", async () => {
    await runYtDlp("https://x", {});
    expect(calls[0].opts.env?.HTTPS_PROXY).toBe(process.env.HTTPS_PROXY);
  });
});

describe("child environment", () => {
  it("drops NODE_OPTIONS so a host preload can't wrap the JS solver's stdout", () => {
    // Hostinger's console wrapper, inherited via NODE_OPTIONS, turned the
    // solver's JSON into {"level":"LOG","message":…} → KeyError('type').
    const env = ytDlpChildEnv({ PATH: "/bin", HOME: "/home/u", NODE_OPTIONS: "--require /opt/host/console-json.js" }, null);
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/home/u");
  });

  it("does not mutate the parent's environment", () => {
    const base = { NODE_OPTIONS: "--require x" };
    ytDlpChildEnv(base, null);
    expect(base.NODE_OPTIONS).toBe("--require x");
  });

  it("adds the proxy vars when a proxy is configured", () => {
    const env = ytDlpChildEnv({ NODE_OPTIONS: "--require x" }, "http://u:p@h:1");
    expect(env.HTTPS_PROXY).toBe("http://u:p@h:1");
    expect(env.NODE_OPTIONS).toBeUndefined();
  });

  it("is what runYtDlp hands the process", async () => {
    process.env.NODE_OPTIONS = "--require /opt/host/console-json.js";
    try {
      await runYtDlp("https://x", {});
      expect(calls[0].opts.env).toBeDefined();
      expect(calls[0].opts.env?.NODE_OPTIONS).toBeUndefined();
    } finally {
      delete process.env.NODE_OPTIONS;
    }
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

  it("reports the errno of a process that never started (youtube-dl-exec drops the message)", () => {
    // What youtube-dl-exec's parse() rethrows for a spawn failure: the
    // original's enumerable fields copied onto new Error(undefined).
    const original = Object.assign(new Error("spawn /x/yt-dlp_linux EAGAIN"), {
      errno: -11, code: "EAGAIN", syscall: "spawn /x/yt-dlp_linux", path: "/x/yt-dlp_linux",
      spawnargs: ["https://youtu.be/secret", "--cookies", "/tmp/c.txt"],
    });
    const { stdout, stderr, ...details } = original as unknown as { stdout?: string; stderr?: string };
    const rethrown = Object.assign(new Error(stderr), { stderr, stdout }, details);
    expect(rethrown.message).toBe("");
    const text = ytDlpErrorText(rethrown);
    expect(text).toBe("spawn /x/yt-dlp_linux EAGAIN");
    expect(text).not.toContain("youtu.be");
    expect(new YtDlpError("ctx", text).message).toBe("ctx: spawn /x/yt-dlp_linux EAGAIN");
  });

  it("reports a kill or exit code when yt-dlp died without stderr", () => {
    expect(ytDlpErrorText(Object.assign(new Error(""), { stderr: "", signalCode: "SIGKILL", exitCode: null })))
      .toBe("yt-dlp was killed by SIGKILL without output");
    expect(ytDlpErrorText(Object.assign(new Error(""), { stderr: "", exitCode: 137 })))
      .toBe("yt-dlp exited with code 137 without output");
  });

  it("YtDlpError carries the cause in its message, capped", () => {
    const e = new YtDlpError("ctx", "x".repeat(2000));
    expect(e.name).toBe("YtDlpError");
    expect(e.message.startsWith("ctx: x")).toBe(true);
    expect(e.message.length).toBeLessThan(520);
  });
});
