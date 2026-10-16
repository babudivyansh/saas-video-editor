import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

// Downloads used to be fs.readFileSync(outputPath) — the whole result held in
// memory per request (a 20-minute 4K YouTube download can pass 1 GB). They are
// streamed now; these pin that, and that delete-on-download still cleans up.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/credits", () => ({ refundCredits: vi.fn(), cancelGeneration: vi.fn(), markGenerationStatus: vi.fn() }));

const { createJobStatusHandler } = await import("./job-routes");

const tmpFiles: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true });
});

function makeOutput(bytes: number): string {
  const p = path.join(os.tmpdir(), `job-routes-dl-${process.pid}-${Math.random().toString(36).slice(2)}.bin`);
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = i % 251;
  fs.writeFileSync(p, buf);
  tmpFiles.push(p);
  return p;
}

const job = (outputPath: string) => ({
  progress: 100, status: "done" as const, outputPath, downloadName: "result.mp4", userId: "u1",
});

describe("createJobStatusHandler — download", () => {
  it("streams the file without reading it whole, with the right length and bytes", async () => {
    const outputPath = makeOutput(3 * 1024 * 1024);
    const jobs = new Map([["j1", job(outputPath)]]);
    const readSpy = vi.spyOn(fs, "readFileSync");

    const res = await createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: false })(
      new NextRequest("http://l/api/tools/x?jobId=j1&download=1"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(3 * 1024 * 1024));
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(fs.readFileSync(outputPath))).toBe(true);
    // Only the comparison read above — the handler itself never called it.
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(jobs.has("j1")).toBe(true);
  });

  it("delete-on-download removes the job at once and the file once the stream closes", async () => {
    const outputPath = makeOutput(64 * 1024);
    const jobs = new Map([["j1", job(outputPath)]]);

    const res = await createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true })(
      new NextRequest("http://l/api/tools/x?jobId=j1&download=1"),
    );
    expect(jobs.has("j1")).toBe(false);
    expect((await res.arrayBuffer()).byteLength).toBe(64 * 1024);

    await vi.waitFor(() => expect(fs.existsSync(outputPath)).toBe(false));
  });
});
