import { describe, expect, it, vi } from "vitest";

const audioSafeSource = vi.fn(async (p: string) => `${p}.audiofix.mp4`);
vi.mock("@/lib/audio-safe-source", () => ({
  audioSafeSource: (p: string) => audioSafeSource(p),
  isCorruptAudioFailure: (err: unknown) => /Rematrix is needed/.test(String((err as Error).message)),
}));

const { renderWithSourceFallbacks, isRemoteInputFailure } = await import("./clip-source");
const { ffmpegInputArgs, redactUrlQueries, REMOTE_INPUT_OPTIONS } = await import("@/utils/ffmpeg-render");

const URL_SRC = "https://bucket.s3.ap-south-1.amazonaws.com/uploads/u/src.mp4?X-Amz-Signature=abc";
const CORRUPT = new Error("FFmpeg exited 1:\nRematrix is needed between 9 channels and stereo");
const FORBIDDEN = new Error("FFmpeg exited 1:\nhttps://bucket/src.mp4?[redacted]: Server returned 403 Forbidden (access denied)");
const FILTER = new Error("FFmpeg exited 8:\nError parsing filterchain");

function renderer(failures: Record<string, Error>) {
  const calls: string[] = [];
  const render = vi.fn(async (src: string) => {
    calls.push(src);
    if (failures[src]) throw failures[src];
    return src;
  });
  return { render, calls };
}

describe("renderWithSourceFallbacks", () => {
  it("renders straight from the URL when that works, never downloading", async () => {
    const { render } = renderer({});
    const local = vi.fn(async () => "/tmp/src.mp4");
    await expect(renderWithSourceFallbacks(URL_SRC, render, local)).resolves.toBe(URL_SRC);
    expect(local).not.toHaveBeenCalled();
  });

  it("downloads and renders locally when the http read fails", async () => {
    const { render, calls } = renderer({ [URL_SRC]: FORBIDDEN });
    const local = vi.fn(async () => "/tmp/src.mp4");
    await expect(renderWithSourceFallbacks(URL_SRC, render, local)).resolves.toBe("/tmp/src.mp4");
    expect(calls).toEqual([URL_SRC, "/tmp/src.mp4"]);
  });

  it("downloads then repairs the audio, in one step, when the URL render hits corrupt audio", async () => {
    const { render, calls } = renderer({ [URL_SRC]: CORRUPT });
    const local = vi.fn(async () => "/tmp/src.mp4");
    await renderWithSourceFallbacks(URL_SRC, render, local);
    expect(calls).toEqual([URL_SRC, "/tmp/src.mp4.audiofix.mp4"]);
  });

  it("repairs the audio when the local fallback hits corrupt audio too", async () => {
    const { render, calls } = renderer({ [URL_SRC]: FORBIDDEN, "/tmp/src.mp4": CORRUPT });
    await renderWithSourceFallbacks(URL_SRC, render, async () => "/tmp/src.mp4");
    expect(calls).toEqual([URL_SRC, "/tmp/src.mp4", "/tmp/src.mp4.audiofix.mp4"]);
  });

  it("does not download for a failure a local file would repeat", async () => {
    const { render } = renderer({ [URL_SRC]: FILTER });
    const local = vi.fn(async () => "/tmp/src.mp4");
    await expect(renderWithSourceFallbacks(URL_SRC, render, local)).rejects.toBe(FILTER);
    expect(local).not.toHaveBeenCalled();
  });

  it("keeps the local-source behaviour: repair corrupt audio, rethrow anything else", async () => {
    const corrupt = renderer({ "/tmp/a.mp4": CORRUPT });
    await expect(renderWithSourceFallbacks("/tmp/a.mp4", corrupt.render)).resolves.toBe("/tmp/a.mp4.audiofix.mp4");
    const broken = renderer({ "/tmp/a.mp4": FILTER });
    await expect(renderWithSourceFallbacks("/tmp/a.mp4", broken.render)).rejects.toBe(FILTER);
  });

  it("rethrows a URL failure when there is no local fallback", async () => {
    const { render } = renderer({ [URL_SRC]: FORBIDDEN });
    await expect(renderWithSourceFallbacks(URL_SRC, render)).rejects.toBe(FORBIDDEN);
  });
});

describe("isRemoteInputFailure", () => {
  it.each([
    "Server returned 403 Forbidden (access denied)",
    "Server returned 5XX Server Error reply",
    "Connection timed out",
    "Connection reset by peer",
    "Error in the pull function",
    "Input/output error",
  ])("treats %s as an http read failure", (msg) => {
    expect(isRemoteInputFailure(new Error(msg))).toBe(true);
  });

  it("does not treat a filtergraph error as one", () => {
    expect(isRemoteInputFailure(FILTER)).toBe(false);
  });
});

describe("ffmpegInputArgs / redactUrlQueries", () => {
  it("puts the reconnect options before an http(s) input only", () => {
    expect(ffmpegInputArgs(URL_SRC)).toEqual([...REMOTE_INPUT_OPTIONS, "-i", URL_SRC]);
    expect(ffmpegInputArgs("/tmp/src.mp4")).toEqual(["-i", "/tmp/src.mp4"]);
    expect(REMOTE_INPUT_OPTIONS).toEqual(expect.arrayContaining(["-reconnect", "-reconnect_on_network_error", "-reconnect_delay_max", "-rw_timeout"]));
  });

  it("strips every presigned query string from ffmpeg output", () => {
    const stderr = `Input #0, mov,mp4, from '${URL_SRC}&X-Amz-Credential=AKIA':\n[https @ 0x1] ${URL_SRC}: Server returned 403`;
    const out = redactUrlQueries(stderr);
    expect(out).not.toMatch(/X-Amz|abc|AKIA/);
    expect(out).toContain("https://bucket.s3.ap-south-1.amazonaws.com/uploads/u/src.mp4?[redacted]");
  });
});
