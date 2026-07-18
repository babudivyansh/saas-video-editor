import { describe, expect, it } from "vitest";
import { crc32, ZipWriter } from "./zip-writer";

describe("crc32", () => {
  it("matches the standard CRC-32 check value for the ASCII digits '123456789'", () => {
    // The canonical test vector for the CRC-32 (IEEE 802.3) polynomial.
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("returns 0 for an empty buffer", () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("ZipWriter", () => {
  it("produces a buffer with a valid local file header signature per entry", () => {
    const zip = new ZipWriter();
    zip.addFile("hello.txt", Buffer.from("hello world"));
    const out = zip.toBuffer();

    expect(out.readUInt32LE(0)).toBe(0x04034b50); // local file header signature
  });

  it("ends with a valid End Of Central Directory record listing every entry", () => {
    const zip = new ZipWriter();
    zip.addFile("a.txt", Buffer.from("aaa"));
    zip.addFile("b.txt", Buffer.from("bbbbb"));
    const out = zip.toBuffer();

    const eocd = out.subarray(out.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50); // EOCD signature
    expect(eocd.readUInt16LE(8)).toBe(2); // entries on this disk
    expect(eocd.readUInt16LE(10)).toBe(2); // total entries

    const centralDirSize = eocd.readUInt32LE(12);
    const centralDirOffset = eocd.readUInt32LE(16);
    expect(out.readUInt32LE(centralDirOffset)).toBe(0x02014b50); // central directory header signature
    expect(centralDirOffset + centralDirSize + 22).toBe(out.length);
  });

  it("round-trips file contents unmodified (store method, no compression)", () => {
    const content = Buffer.from("The quick brown fox jumps over the lazy dog");
    const zip = new ZipWriter();
    zip.addFile("fox.txt", content);
    const out = zip.toBuffer();

    // Local file header is 30 bytes + filename ("fox.txt" = 7 bytes), then the raw data.
    const nameLen = out.readUInt16LE(26);
    const dataStart = 30 + nameLen;
    const storedSize = out.readUInt32LE(18); // uncompressed size field
    const stored = out.subarray(dataStart, dataStart + storedSize);
    expect(stored.equals(content)).toBe(true);
  });

  it("sanitizes unsafe entry names instead of allowing path traversal", () => {
    const zip = new ZipWriter();
    zip.addFile("../../etc/passwd", Buffer.from("x"));
    const out = zip.toBuffer();
    const nameLen = out.readUInt16LE(26);
    const name = out.subarray(30, 30 + nameLen).toString("utf8");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..\\");
  });
});
