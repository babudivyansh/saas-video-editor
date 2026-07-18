// Minimal, dependency-free ZIP (store method — no compression) writer. Store
// mode is the deliberate choice here, not a shortcut: the bulk-download
// feature zips already-compressed media (MP4/JPEG/MP3), which barely shrinks
// under DEFLATE anyway, so skipping compression trades a few percent of
// archive size for zero CPU cost and a much smaller amount of code to get
// right versus a full DEFLATE implementation. Produces a standard PK ZIP
// file any unzip tool can open — verified against the APPNOTE.TXT layout
// (local file header, central directory, end-of-central-directory record).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  crc: number;
  offset: number;
}

// DOS date/time (both formats share the same bit-packing) for "now" — ZIP's
// timestamp precision (2-second granularity) is irrelevant for this use case.
function dosDateTime(): { time: number; date: number } {
  const d = new Date();
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export class ZipWriter {
  private chunks: Buffer[] = [];
  private entries: ZipEntry[] = [];
  private offset = 0;

  addFile(rawName: string, data: Buffer): void {
    // Sanitize to a safe, flat archive-relative name — no directory traversal,
    // no leading slash, ASCII-safe enough for the classic (non-UTF8) ZIP name field.
    const name = rawName.replace(/[/\\]/g, "_").replace(/[^\x20-\x7E]/g, "_").slice(0, 200) || "file";
    const crc = crc32(data);
    const { time, date } = dosDateTime();
    const nameBuf = Buffer.from(name, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method = 0 (store)
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size = size (store)
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    this.entries.push({ name, data, crc, offset: this.offset });
    this.chunks.push(localHeader, nameBuf, data);
    this.offset += localHeader.length + nameBuf.length + data.length;
  }

  toBuffer(): Buffer {
    const centralChunks: Buffer[] = [];
    const centralStart = this.offset;

    for (const e of this.entries) {
      const { time, date } = dosDateTime();
      const nameBuf = Buffer.from(e.name, "utf8");
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); // central directory header signature
      central.writeUInt16LE(20, 4); // version made by
      central.writeUInt16LE(20, 6); // version needed
      central.writeUInt16LE(0, 8); // flags
      central.writeUInt16LE(0, 10); // method
      central.writeUInt16LE(time, 12);
      central.writeUInt16LE(date, 14);
      central.writeUInt32LE(e.crc, 16);
      central.writeUInt32LE(e.data.length, 20);
      central.writeUInt32LE(e.data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt16LE(0, 30); // extra length
      central.writeUInt16LE(0, 32); // comment length
      central.writeUInt16LE(0, 34); // disk number start
      central.writeUInt16LE(0, 36); // internal attrs
      central.writeUInt32LE(0, 38); // external attrs
      central.writeUInt32LE(e.offset, 42); // local header offset
      centralChunks.push(central, nameBuf);
      this.offset += central.length + nameBuf.length;
    }

    const centralSize = this.offset - centralStart;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central dir
    eocd.writeUInt16LE(this.entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10); // total entries
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...this.chunks, ...centralChunks, eocd]);
  }
}
