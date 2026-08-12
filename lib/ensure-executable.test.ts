import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Regression for a production incident: clipiro.com's deploy landed the
// ffmpeg-static binary present-but-not-executable, so every spawn failed with
// EACCES and took down all rendering (AutoClip's probe surfaced it first).
// ensureExecutable restores the bit at runtime, after any copy/extract.

const chmodSync = vi.fn();
const statSync = vi.fn();
const existsSync = vi.fn();

vi.mock("fs", () => ({
  default: {
    chmodSync: (...a: unknown[]) => chmodSync(...a),
    statSync: (...a: unknown[]) => statSync(...a),
    existsSync: (...a: unknown[]) => existsSync(...a),
  },
}));

const realPlatform = process.platform;
function setPlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules(); // reset the module-level `ensured` cache between cases
  existsSync.mockReturnValue(true);
  statSync.mockReturnValue({ mode: 0o644 }); // present, NOT executable
});
afterEach(() => setPlatform(realPlatform));

async function load() {
  return (await import("./ensure-executable")).ensureExecutable;
}

describe("ensureExecutable", () => {
  it("restores the execute bit on a non-executable binary (POSIX)", async () => {
    setPlatform("linux");
    (await load())("/app/node_modules/ffmpeg-static/ffmpeg");
    expect(chmodSync).toHaveBeenCalledWith("/app/node_modules/ffmpeg-static/ffmpeg", 0o755);
  });

  it("does nothing on Windows (no POSIX exec bit)", async () => {
    setPlatform("win32");
    (await load())("C:/app/node_modules/ffmpeg-static/ffmpeg.exe");
    expect(chmodSync).not.toHaveBeenCalled();
  });

  it("leaves an already-executable binary alone", async () => {
    setPlatform("linux");
    statSync.mockReturnValue({ mode: 0o755 });
    (await load())("/app/bin/ffmpeg");
    expect(chmodSync).not.toHaveBeenCalled();
  });

  it("skips a bare PATH name rather than a real file path", async () => {
    setPlatform("linux");
    (await load())("ffmpeg");
    expect(existsSync).not.toHaveBeenCalled();
    expect(chmodSync).not.toHaveBeenCalled();
  });

  it("does not throw when the file is missing", async () => {
    setPlatform("linux");
    existsSync.mockReturnValue(false);
    expect(() => (undefined as never)).not.toThrow();
    const fn = await load();
    expect(() => fn("/app/bin/ffmpeg")).not.toThrow();
    expect(chmodSync).not.toHaveBeenCalled();
  });

  it("swallows a chmod failure (read-only FS) rather than crashing the spawn path", async () => {
    setPlatform("linux");
    chmodSync.mockImplementation(() => { throw new Error("EROFS"); });
    const fn = await load();
    expect(() => fn("/app/bin/ffmpeg")).not.toThrow();
  });

  it("only acts once per path per process", async () => {
    setPlatform("linux");
    const fn = await load();
    fn("/app/bin/ffmpeg");
    fn("/app/bin/ffmpeg");
    fn("/app/bin/ffmpeg");
    expect(chmodSync).toHaveBeenCalledTimes(1);
  });
});
