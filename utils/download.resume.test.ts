// @vitest-environment node
//
// CLIPIRO-WEB-C/-1C (2026-11-19): an AutoClip run failed three times in a
// row on "Download timed out after 300000ms" for a 1.1 GB source, each retry
// starting the download from zero. A stalled or dropped transfer now resumes
// from the bytes already on disk with an HTTP Range request.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";

// The guard refuses loopback addresses; this test serves from one.
vi.mock("@/utils/network-guard", () => ({ isPrivateHostLiteral: () => false, publicOnlyLookup: undefined }));

const { downloadFile } = await import("./download");

const BODY = Buffer.from(Array.from({ length: 200_000 }, (_, i) => i % 251));
type Mode = "stall-once" | "drop-once" | "ignore-range" | "stall-before-bytes";

let server: http.Server;
let base = "";
let mode: Mode = "stall-once";
let requests: Array<string | undefined> = [];
let dir = "";

beforeEach(async () => {
  requests = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "download-resume-test-"));
  server = http.createServer((req, res) => {
    const range = req.headers.range;
    requests.push(range);
    const first = requests.length === 1;
    if (mode === "stall-before-bytes") return; // never answers
    const m = range ? /bytes=(\d+)-/.exec(range) : null;
    if (m && mode !== "ignore-range") {
      const from = Number(m[1]);
      res.writeHead(206, { "Content-Length": String(BODY.length - from), "Content-Range": `bytes ${from}-${BODY.length - 1}/${BODY.length}` });
      res.end(BODY.subarray(from));
      return;
    }
    res.writeHead(200, { "Content-Length": String(BODY.length) });
    if (!first) { res.end(BODY); return; }
    res.write(BODY.subarray(0, 70_000));
    if (mode === "drop-once") setTimeout(() => req.socket.destroy(), 20);
    // stall-once / ignore-range: hold the rest back until the client gives up.
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/video.mp4`;
});

afterEach(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const dest = () => path.join(dir, "out.mp4");

describe("downloadFile resume", () => {
  it("resumes a stalled transfer from the bytes on disk", async () => {
    mode = "stall-once";
    await downloadFile(base, dest(), 300);
    expect(fs.readFileSync(dest()).equals(BODY)).toBe(true);
    expect(requests).toEqual([undefined, "bytes=70000-"]);
  }, 15_000);

  it("resumes a dropped connection", async () => {
    mode = "drop-once";
    await downloadFile(base, dest(), 5_000);
    expect(fs.readFileSync(dest()).equals(BODY)).toBe(true);
    expect(requests[1]).toMatch(/^bytes=\d+-$/);
  }, 15_000);

  it("rewrites from the start when the server ignores the range", async () => {
    mode = "ignore-range";
    await downloadFile(base, dest(), 300);
    expect(fs.readFileSync(dest()).equals(BODY)).toBe(true);
  }, 15_000);

  it("fails, leaving no file, when nothing ever arrives", async () => {
    mode = "stall-before-bytes";
    await expect(downloadFile(base, dest(), 200)).rejects.toThrow(/timed out/);
    expect(fs.existsSync(dest())).toBe(false);
    expect(requests).toHaveLength(1);
  }, 15_000);
});
