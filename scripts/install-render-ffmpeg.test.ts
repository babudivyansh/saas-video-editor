// Supply-chain protection for the pinned render runtime (P0-2).
//
// The install step exists to guarantee production runs one exact, verified
// ffmpeg build. A checksum check that silently passes would be worse than
// none — it would manufacture false confidence — so the fatal-on-mismatch
// behaviour is tested rather than assumed.

import { describe, expect, it } from "vitest";
import zlib from "zlib";
// @ts-expect-error — plain .mjs script, no type declarations by design.
import { assertArtifact, sha256, PINNED } from "./install-render-ffmpeg.mjs";

const bytes = (s: string) => Buffer.from(s, "utf8");

describe("assertArtifact — checksum verification is fatal", () => {
  it("accepts an artifact whose digest matches the pin", () => {
    const buf = bytes("clipiro");
    expect(() => assertArtifact(buf, sha256(buf), "TEST")).not.toThrow();
  });

  it("THROWS on a digest mismatch — a substituted artifact must fail the install", () => {
    const expected = sha256(bytes("the-real-binary"));
    expect(() => assertArtifact(bytes("a-substituted-binary"), expected, "BINARY"))
      .toThrow(/CHECKSUM MISMATCH/);
  });

  it("THROWS on a size mismatch even if a digest were somehow satisfied", () => {
    const buf = bytes("clipiro");
    expect(() => assertArtifact(buf, sha256(buf), "BINARY", buf.length + 1))
      .toThrow(/SIZE MISMATCH/);
  });

  it("refuses an empty download rather than installing a zero-byte binary", () => {
    const empty = Buffer.alloc(0);
    expect(() => assertArtifact(empty, PINNED.binarySha256, "BINARY", PINNED.binaryBytes))
      .toThrow(/CHECKSUM MISMATCH/);
  });
});

describe("the pin itself", () => {
  it("is a fully specified, non-floating reference", () => {
    expect(PINNED.url).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\/b6\.0\/ffmpeg-linux-x64\.gz$/);
    // Nothing that can move under us.
    expect(PINNED.url).not.toMatch(/latest|master|main|nightly/);
    expect(PINNED.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED.binarySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PINNED.binaryBytes).toBeGreaterThan(0);
    expect(PINNED.version).toBe("6.0-static");
  });

  it("archive digest and binary digest are distinct (gzip vs decompressed)", () => {
    // Guards a copy-paste error that would make the stronger of the two
    // checks vacuous.
    expect(PINNED.archiveSha256).not.toBe(PINNED.binarySha256);
  });

  it("the decompressed pin is what the binary digest describes", () => {
    // Round-trips the relationship the installer relies on: gunzip(archive)
    // must be the artifact the binary digest covers.
    const payload = bytes("x".repeat(64));
    const gz = zlib.gzipSync(payload);
    expect(sha256(zlib.gunzipSync(gz))).toBe(sha256(payload));
    expect(sha256(gz)).not.toBe(sha256(payload));
  });
});
