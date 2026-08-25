// SECURITY REGRESSION — the ASD / face-detection source path.
//
// `getFaceTimeline(userId, videoUrl)` spends Clipiro's credentials on whatever
// object `videoUrl` names, twice over:
//   • ASD mints a presigned GET (`getAssetReadUrl`) and hands it to the GPU
//     service;
//   • the Rekognition fallback hands bucket/key straight to our own IAM.
// `videoUrl` arrives as `project.uploadedVideoUrl`, which is CLIENT-SETTABLE.
//
// Before this fix the function performed no ownership check at all. It was not
// exploitable in practice only because AutoClip's ownership-gated source
// download runs earlier in the same try block and fails first on a foreign
// key. That is execution order, not authorization.
//
// So these tests deliberately call getFaceTimeline DIRECTLY. No AutoClip
// download runs before them — which is exactly the point: if the gate ever
// regresses to relying on the caller, this suite fails. Ownership is resolved
// against a REAL database with real two-tenant rows; there is no `isOwner`
// stub anywhere.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";

// Observe the two privileged operations. These are the things that must NOT
// happen for another tenant's media.
const runAsd = vi.hoisted(() => vi.fn(async () => ({ tracks: [] })));
vi.mock("@/lib/gpu-service", () => ({
  runAsd,
  GpuServiceError: class extends Error { errorClass = "input"; },
}));

const detectFaceTimeline = vi.hoisted(() => vi.fn(async () => ({ boxes: [] })));
vi.mock("@/lib/reframe", () => ({ detectFaceTimeline, parseS3Url: () => null }));

// ASD enabled for everyone, so the gate is the ONLY thing that can stop it.
const shouldUseAsd = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/render-target", () => ({ shouldUseAsd }));

// Real minting boundary — presigning is local, so a signature either genuinely
// gets issued or it does not.
const getAssetReadUrl = vi.hoisted(() =>
  vi.fn(async (key: string) => `https://signed.invalid/${key}?X-Amz-Signature=fresh`));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

const { prisma } = await import("@/lib/prisma");
const { env } = await import("@/lib/env");
const { getFaceTimeline } = await import("@/lib/asd");

const RUN = randomUUID().slice(0, 8);
const a = { id: "", email: `asd-a-${RUN}@test.invalid` };
const b = { id: "", email: `asd-b-${RUN}@test.invalid` };
let bKey = "";
let bUrl = "";
let aKey = "";
let aUrl = "";
let dbUp = true;

beforeAll(async () => {
  try {
    a.id = (await prisma.user.create({ data: { email: a.email, passwordHash: "x" }, select: { id: true } })).id;
    b.id = (await prisma.user.create({ data: { email: b.email, passwordHash: "x" }, select: { id: true } })).id;

    const url = (k: string) => `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${k}`;
    bKey = `uploads/${b.id}/tenant-b-private-${RUN}.mp4`;
    aKey = `uploads/${a.id}/tenant-a-own-${RUN}.mp4`;
    bUrl = url(bKey);
    aUrl = url(aKey);

    for (const [userId, s3Key] of [[b.id, bKey], [a.id, aKey]] as const) {
      await prisma.asset.create({
        data: { userId, name: "v.mp4", s3Key, url: url(s3Key), mimeType: "video/mp4", kind: "video", size: 32 },
      });
    }
  } catch (e) {
    dbUp = false;
    // eslint-disable-next-line no-console
    console.warn("asd tenant-isolation suite skipped — no database:", String(e).split("\n")[0]);
  }
}, 60_000);

afterAll(async () => {
  if (!dbUp) return;
  await prisma.user.deleteMany({ where: { email: { in: [a.email, b.email] } } });
});

describe("ASD face-timeline source authorization", () => {
  it.skipIf(!dbUp)("DENIES tenant A face detection on tenant B's object — called directly, with no prior download gate", async () => {
    runAsd.mockClear(); detectFaceTimeline.mockClear(); getAssetReadUrl.mockClear();

    const result = await getFaceTimeline(a.id, bUrl);

    // Degrades to "no timeline" (static centre crop), never an error.
    expect(result.boxes).toEqual([]);
    // No presigned GET minted for B's key…
    expect(getAssetReadUrl).not.toHaveBeenCalled();
    // …the GPU service never received a URL for it…
    expect(runAsd).not.toHaveBeenCalled();
    // …and Rekognition never got bucket/key on our IAM.
    expect(detectFaceTimeline).not.toHaveBeenCalled();
  }, 30_000);

  it.skipIf(!dbUp)("ALLOWS tenant A on tenant A's own object", async () => {
    runAsd.mockClear(); detectFaceTimeline.mockClear(); getAssetReadUrl.mockClear();

    await getFaceTimeline(a.id, aUrl);

    expect(getAssetReadUrl).toHaveBeenCalledWith(aKey, 60 * 60);
    expect(runAsd).toHaveBeenCalledTimes(1);
    expect(runAsd.mock.calls[0][0]).toContain("X-Amz-Signature=fresh");
    // ASD returned no tracks here, so the owned path still reaches Rekognition.
    expect(detectFaceTimeline).toHaveBeenCalledTimes(1);
  }, 30_000);

  it.skipIf(!dbUp)("the gate does NOT depend on AutoClip's earlier download — removing or reordering it cannot reopen this", async () => {
    // This is the whole point of the fix. The AutoClip pipeline is not involved
    // in this file at all: nothing has downloaded, probed, or validated the
    // source before the call below. The refusal therefore comes from
    // getFaceTimeline's own authorization check and from nothing else.
    runAsd.mockClear(); detectFaceTimeline.mockClear(); getAssetReadUrl.mockClear();

    // Hammer it the way a reordered pipeline or a new caller would.
    for (const attempt of [bUrl, `${bUrl}?X-Amz-Signature=stale`, bUrl]) {
      const r = await getFaceTimeline(a.id, attempt);
      expect(r.boxes).toEqual([]);
    }

    expect(getAssetReadUrl).not.toHaveBeenCalled();
    expect(runAsd).not.toHaveBeenCalled();
    expect(detectFaceTimeline).not.toHaveBeenCalled();
  }, 30_000);

  it.skipIf(!dbUp)("does not treat a third-party URL as Clipiro storage, and never spends our IAM on it", async () => {
    // Legitimate external media must keep working: ASD fetches it directly.
    runAsd.mockClear(); detectFaceTimeline.mockClear(); getAssetReadUrl.mockClear();

    await getFaceTimeline(a.id, "https://cdn.example.com/some/video.mp4");

    expect(getAssetReadUrl).not.toHaveBeenCalled();
    expect(runAsd).toHaveBeenCalledWith("https://cdn.example.com/some/video.mp4");
    // Rekognition takes an S3 object in our own account, so an external URL is
    // not an input for it — and we must not hand AWS an attacker-chosen bucket.
    expect(detectFaceTimeline).not.toHaveBeenCalled();
  }, 30_000);

  it.skipIf(!dbUp)("keeps the GPU grant at one hour — a shared-resolver default must not widen it", async () => {
    // Refactor hazard, caught during review and pinned here. The ASD path
    // deliberately mints a SHORTER grant than a same-process download needs,
    // because the URL leaves our infrastructure for a third-party GPU service.
    // Routing it through the shared resolver made it trivially easy to inherit
    // that helper's 6-hour default and silently sextuple a third party's access
    // window. This assertion fails if that ever happens.
    getAssetReadUrl.mockClear();

    await getFaceTimeline(a.id, aUrl);

    expect(getAssetReadUrl).toHaveBeenCalledTimes(1);
    const [, ttl] = getAssetReadUrl.mock.calls[0];
    expect(ttl).toBe(3600);
    expect(ttl).not.toBe(6 * 3600); // the shared default — must not leak in
  }, 30_000);

  it.skipIf(!dbUp)("refuses a prefix-lookalike segment", async () => {
    getAssetReadUrl.mockClear(); runAsd.mockClear();

    const forged = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/uploads/${b.id}x/forged.mp4`;
    const r = await getFaceTimeline(b.id, forged);

    expect(r.boxes).toEqual([]);
    expect(getAssetReadUrl).not.toHaveBeenCalled();
    expect(runAsd).not.toHaveBeenCalled();
  }, 30_000);
});
