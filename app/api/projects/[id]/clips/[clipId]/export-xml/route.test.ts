import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { inflateRawSync } from "zlib";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser), getServerAuthUser: vi.fn(async () => null) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

let clip: Record<string, unknown> | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clip: {
      findFirst: vi.fn(async (a: { where: { id: string; projectId: string; project: { userId: string } } }) =>
        a.where.id === "c1" && a.where.projectId === "p1" && a.where.project.userId === "u1" ? clip : null,
      ),
    },
  },
}));

const { GET } = await import("./route");
const ctx = (id: string, clipId: string) => ({ params: Promise.resolve({ id, clipId }) });
const req = () => new NextRequest("http://localhost/api/projects/p1/clips/c1/export-xml");

/** Names and contents of a zip's entries (stored or deflated). */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    i = start + size;
  }
  return out;
}

beforeEach(() => {
  authUser = { userId: "u1" };
  clip = {
    index: 2, title: "Sharp save", startSec: 10, endSec: 20, aspectRatio: "9:16",
    transcriptJson: [{ word: "Hello", start: 0, end: 400 }],
    project: { title: "vlog-final", sourceAsset: { name: "My Vlog.mp4", mimeType: "video/mp4", duration: 120 } },
  };
});

describe("GET .../clips/[clipId]/export-xml", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await GET(req(), ctx("p1", "c1"))).status).toBe(401);
  });

  it("404s a clip the caller doesn't own", async () => {
    authUser = { userId: "u2" };
    expect((await GET(req(), ctx("p1", "c1"))).status).toBe(404);
  });

  it("returns a zip of the XML, the captions and a README", async () => {
    const res = await GET(req(), ctx("p1", "c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain('filename="Sharp-save-xml.zip"');
    const files = unzip(Buffer.from(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "captions.srt", "clip.xml"]);
    expect(files["clip.xml"]).toContain("<pathurl>file://localhost/My%20Vlog.mp4</pathurl>");
    expect(files["captions.srt"]).toContain("00:00:00,000 --> 00:00:00,400");
    expect(files["README.txt"]).toContain('"My Vlog.mp4"');
  });

  it("leaves out the captions when nothing is said, and guesses an extension for the source", async () => {
    clip!.transcriptJson = null;
    clip!.project = { title: "vlog-final", sourceAsset: null };
    const files = unzip(Buffer.from(await (await GET(req(), ctx("p1", "c1"))).arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "clip.xml"]);
    expect(files["clip.xml"]).toContain("file://localhost/vlog-final.mp4");
  });
});
