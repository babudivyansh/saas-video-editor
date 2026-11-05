// Supply-chain protection for the pinned yt-dlp. A checksum check that
// silently passes would be worse than none, so fatal-on-mismatch is tested.

import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script, no type declarations by design.
import { assertArtifact, sha256, PINNED, YTDLP_PATH } from "./install-ytdlp.mjs";

const bytes = (s: string) => Buffer.from(s, "utf8");

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

describe("the pin", () => {
  it("is the standalone yt-dlp_linux asset of one exact release — never the Python zipapp", () => {
    expect(PINNED.url).toBe(`https://github.com/yt-dlp/yt-dlp/releases/download/${PINNED.version}/yt-dlp_linux`);
    expect(PINNED.url).not.toMatch(/latest|nightly|master/);
    expect(PINNED.version).toMatch(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);
    expect(PINNED.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED.bytes).toBeGreaterThan(10_000_000); // the zipapp is ~3 MB; the standalone build ~40 MB
  });

  it("installs outside node_modules, where lib/ytdlp.ts looks first", () => {
    expect(YTDLP_PATH.replace(/\\/g, "/")).toMatch(/\/vendor\/yt-dlp\/yt-dlp$/);
  });
});
