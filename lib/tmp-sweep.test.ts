import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { isAppTempName, sweepAppTempFiles, TMP_MAX_AGE_MS } = await import("./tmp-sweep");

// Hostinger 2026-11-19: 24.2 GB of /tmp was left by jobs that died before
// their `finally` ran. The sweep must remove those and never touch anything
// it did not create (the account also hosts a PHP site).

describe("isAppTempName", () => {
  it.each([
    "import-692e7a11-0a0f-486e-a809-4feff901ff07-5b797b2b-a919-4c96-85c7-d4aea8256cc0.f399.mp4.part",
    "autoclip-cmwmby8up002a373m7oczx55c-ofiiCf",
    "a130c8ef-ac51-463e-b980-7e9f2e6b4645-src-rerender-cmwmby8up002a373m7oczx55c.mp4",
    "0f8fad5b-d9cb-469f-a165-70867728950e-output.mp3",
    "cmwmby8up002a373m7oczx55c-dub-audio.mp3",
    "ytdl_0f8fad5b-d9cb-469f-a165-70867728950e.f137.mp4.part",
    "editor-a130c8ef-ac51-463e-b980-7e9f2e6b4645-out.mp4",
    "captions-u1-1700000000000-src.mp4",
    "preview-cmwmby8up002a373m7oczx55c-1700000000.ass",
  ])("is ours: %s", (name) => expect(isAppTempName(name)).toBe(true));

  it.each(["sess_abc123", "systemd-private-1234", "php8.2-fpm.sock", "npm-12345-abcd", "random.txt", "importer.log"])(
    "is not ours: %s",
    (name) => expect(isAppTempName(name)).toBe(false),
  );
});

describe("sweepAppTempFiles", () => {
  let dir: string;
  const now = Date.now();
  const old = new Date(now - TMP_MAX_AGE_MS - 60_000);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmp-sweep-test-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function file(name: string, bytes: number, mtime?: Date) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.alloc(bytes));
    if (mtime) fs.utimesSync(p, mtime, mtime);
    return p;
  }

  it("removes old app files and directories, keeps fresh ones and foreign ones", () => {
    const stalePart = file("import-692e7a11-0a0f-486e-a809-4feff901ff07-x.f399.mp4.part", 2048, old);
    const fresh = file("0f8fad5b-d9cb-469f-a165-70867728950e-output.mp4", 10);
    const foreign = file("sess_abc", 10, old);
    const staleDir = path.join(dir, "autoclip-cmwmby8up002a373m7oczx55c-abc");
    fs.mkdirSync(staleDir);
    const inner = path.join(staleDir, "clip.mp4");
    fs.writeFileSync(inner, Buffer.alloc(512));
    fs.utimesSync(inner, old, old);
    fs.utimesSync(staleDir, old, old);

    const r = sweepAppTempFiles({ dir, now });
    expect(r).toEqual({ removed: 2, freedBytes: 2048 + 512, failed: 0 });
    expect(fs.existsSync(stalePart)).toBe(false);
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
  });

  it("keeps an old directory whose files are still being written", () => {
    const live = path.join(dir, "autoclip-cmwmby8up002a373m7oczx55c-live");
    fs.mkdirSync(live);
    fs.writeFileSync(path.join(live, "render.mp4"), "x");
    fs.utimesSync(live, old, old);
    expect(sweepAppTempFiles({ dir, now }).removed).toBe(0);
    expect(fs.existsSync(live)).toBe(true);
  });
});
