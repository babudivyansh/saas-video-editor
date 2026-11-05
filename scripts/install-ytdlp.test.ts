// Supply-chain protection for the pinned yt-dlp. A checksum check that
// silently passes would be worse than none, so fatal-on-mismatch is tested.

import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script, no type declarations by design.
import { assertArtifact, sha256, PINNED, YTDLP_PATH, extractZip } from "./install-ytdlp.mjs";

const bytes = (s: string) => Buffer.from(s, "utf8");

/** A minimal zip writer for the extractor's tests (stored or deflated entries). */
function makeZip(entries: Array<{ name: string; data?: string; mode?: number; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = bytes(e.name);
    const raw = bytes(e.data ?? "");
    const body = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const method = e.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.mode ?? 0o644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("assertArtifact", () => {
  it("accepts an artifact whose digest and size match", () => {
    const buf = bytes("clipiro");
    expect(() => assertArtifact(buf, sha256(buf), buf.length)).not.toThrow();
  });

  it("THROWS on a digest mismatch", () => {
    expect(() => assertArtifact(bytes("substituted"), sha256(bytes("real")))).toThrow(/CHECKSUM MISMATCH/);
  });

  it("THROWS on a size mismatch", () => {
    const buf = bytes("clipiro");
    expect(() => assertArtifact(buf, sha256(buf), buf.length + 1)).toThrow(/SIZE MISMATCH/);
  });

  it("refuses an empty download", () => {
    expect(() => assertArtifact(Buffer.alloc(0), PINNED.sha256, PINNED.bytes)).toThrow(/CHECKSUM MISMATCH/);
  });
});

describe("extractZip", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ytdlp-zip-"));

  it("extracts stored and deflated entries, directories and unix modes", () => {
    const dir = tmp();
    try {
      const files = extractZip(makeZip([
        { name: "_internal/", mode: 0o755 },
        { name: "_internal/lib.so", data: "x".repeat(5000), deflate: true },
        { name: "yt-dlp_linux", data: "#!bin", mode: 0o755 },
      ]), dir);
      expect(files).toEqual(["_internal/lib.so", "yt-dlp_linux"]);
      expect(fs.readFileSync(path.join(dir, "_internal", "lib.so"), "utf8")).toBe("x".repeat(5000));
      expect(fs.readFileSync(path.join(dir, "yt-dlp_linux"), "utf8")).toBe("#!bin");
      if (process.platform !== "win32") expect(fs.statSync(path.join(dir, "yt-dlp_linux")).mode & 0o777).toBe(0o755);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an entry that would land outside the target (zip slip)", () => {
    const dir = tmp();
    try {
      expect(() => extractZip(makeZip([{ name: "../escape.txt", data: "no" }]), dir)).toThrow(/escapes target/);
      expect(fs.existsSync(path.join(dir, "..", "escape.txt"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses something that isn't a zip", () => {
    expect(() => extractZip(bytes("not a zip at all, just text"), tmp())).toThrow(/not a zip/);
  });
});

describe("the pin", () => {
  it("is the one-directory yt-dlp_linux.zip of one exact release", () => {
    // Not the one-file yt-dlp_linux: it unpacks its libraries into /tmp on
    // every run, and Hostinger's /tmp is noexec ("failed to map segment").
    // Not the plain `yt-dlp`: that is a Python zipapp, and the host has 3.9.
    expect(PINNED.url).toBe(`https://github.com/yt-dlp/yt-dlp/releases/download/${PINNED.version}/yt-dlp_linux.zip`);
    expect(PINNED.url).not.toMatch(/latest|nightly|master/);
    expect(PINNED.version).toMatch(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);
    expect(PINNED.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED.bytes).toBeGreaterThan(10_000_000);
  });

  it("installs outside node_modules, where lib/ytdlp.ts looks first", () => {
    expect(YTDLP_PATH.replace(/\\/g, "/")).toMatch(/\/vendor\/yt-dlp\/yt-dlp_linux$/);
  });
});
