// SECURITY REGRESSION — cross-tenant source re-minting.
//
// Before PR #181 the deployed helper was `freshSourceUrl(storedUrl)`: it minted
// a fresh presigned GET for whatever S3 key it could parse out of the stored
// URL, with no ownership context at all. `Project.uploadedVideoUrl` is
// CLIENT-SETTABLE — `POST /api/v1/projects` validates only that the value is a
// well-formed https URL, and the project PATCH allowlist includes the field
// with no ownership check. Together those turned an ordinary 403 dead end into
// privileged, server-mediated read access to another tenant's object:
//
//   Tenant A stores a URL naming Tenant B's key
//     → pipeline calls freshSourceUrl()
//     → server signs it with our own credentials
//     → B's private object becomes readable by A's job
//
// This suite runs against a REAL database with REAL Asset/Project rows for two
// real tenants, and calls the REAL resolver. Ownership is NOT mocked — no
// `isOwner = false` stub anywhere. The only thing not exercised end-to-end is
// the S3 network fetch itself; presigning is a local operation, so the mint
// either genuinely happens (signature present) or genuinely does not.
//
// The `documents the pre-fix behaviour` test pins the delta: the key IS
// recoverable from the hostile URL, so the old single-argument resolver would
// have signed it. That is precisely what the ownership gate now refuses.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { freshSourceUrl, s3KeyFromStoredUrl } from "@/lib/source-url";

const RUN = randomUUID().slice(0, 8);
const tenantA = { id: "", email: `iso-a-${RUN}@test.invalid` };
const tenantB = { id: "", email: `iso-b-${RUN}@test.invalid` };

// Tenant B's private media. The key is under B's own prefix, so it is owned by
// B under both proofs the resolver accepts.
let bKey = "";
let bStoredUrl = "";

let dbUp = true;

beforeAll(async () => {
  try {
    const a = await prisma.user.create({ data: { email: tenantA.email, passwordHash: "x" }, select: { id: true } });
    const b = await prisma.user.create({ data: { email: tenantB.email, passwordHash: "x" }, select: { id: true } });
    tenantA.id = a.id;
    tenantB.id = b.id;

    bKey = `uploads/${tenantB.id}/tenant-b-private-${RUN}.mp4`;
    bStoredUrl =
      `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${bKey}` +
      `?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260813T182724Z&X-Amz-Expires=21600&X-Amz-Signature=deadbeef`;

    // A real ownership record for B — the authoritative proof the gate uses.
    await prisma.asset.create({
      data: {
        userId: tenantB.id, name: "tenant-b-private.mp4", s3Key: bKey,
        url: `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${bKey}`,
        mimeType: "video/mp4", kind: "video", size: 1024,
      },
    });

    // The attack setup: Tenant A's project pointing at Tenant B's object, which
    // is exactly what the client-settable write surfaces permit today.
    await prisma.project.create({
      data: { userId: tenantA.id, title: `iso-attack-${RUN}`, uploadedVideoUrl: bStoredUrl },
    });
  } catch (e) {
    dbUp = false;
    // eslint-disable-next-line no-console
    console.warn("tenant-isolation suite skipped — no database:", String(e).split("\n")[0]);
  }
}, 60_000);

afterAll(async () => {
  if (!dbUp) return;
  // Delete only what this run created. Project/Asset cascade from User.
  await prisma.user.deleteMany({ where: { email: { in: [tenantA.email, tenantB.email] } } });
});

const signed = (url: string) => url.includes("X-Amz-Signature=") && !url.includes("X-Amz-Signature=deadbeef");

describe("cross-tenant source re-minting", () => {
  it.skipIf(!dbUp)("DENIES a fresh URL when tenant A references tenant B's object", async () => {
    const project = await prisma.project.findFirst({
      where: { userId: tenantA.id, title: `iso-attack-${RUN}` },
      select: { userId: true, uploadedVideoUrl: true },
    });
    expect(project?.uploadedVideoUrl).toBe(bStoredUrl);

    // The pipeline call, verbatim: owner id read server-side off the project.
    const resolved = await freshSourceUrl(project!.uploadedVideoUrl!, project!.userId);

    // No new signature was issued for B's key…
    expect(signed(resolved)).toBe(false);
    // …and the value is handed back untouched, i.e. the dead-signature URL S3
    // will reject on its own. No access the caller did not already have.
    expect(resolved).toBe(bStoredUrl);
  }, 30_000);

  it.skipIf(!dbUp)("documents the pre-fix behaviour: the key IS recoverable, so the old resolver would have signed it", () => {
    // The vulnerability was never about parsing — it was about minting without
    // asking who owns the result. This asserts the exact input the old
    // single-argument resolver would have happily signed.
    expect(s3KeyFromStoredUrl(bStoredUrl)).toBe(bKey);
    expect(bKey).toContain(tenantB.id);
  }, 30_000);

  it.skipIf(!dbUp)("ALLOWS the owner: tenant B re-minting its own object still works", async () => {
    const resolved = await freshSourceUrl(bStoredUrl, tenantB.id);

    expect(signed(resolved)).toBe(true);
    expect(resolved).toContain(encodeURI(bKey).replace(/:/g, "%3A"));
    // The expired signature must not survive into the fresh grant.
    expect(resolved).not.toContain("X-Amz-Signature=deadbeef");
  }, 30_000);

  it.skipIf(!dbUp)("refuses even when tenant A owns SOME media — ownership is per-object, not per-user", async () => {
    const aKey = `uploads/${tenantA.id}/a-own-${RUN}.mp4`;
    await prisma.asset.create({
      data: {
        userId: tenantA.id, name: "a.mp4", s3Key: aKey,
        url: `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${aKey}`,
        mimeType: "video/mp4", kind: "video", size: 10,
      },
    });

    // A's own object mints; B's still does not.
    const own = await freshSourceUrl(
      `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${aKey}`, tenantA.id);
    expect(signed(own)).toBe(true);

    const foreign = await freshSourceUrl(bStoredUrl, tenantA.id);
    expect(signed(foreign)).toBe(false);
  }, 30_000);

  it.skipIf(!dbUp)("refuses a prefix-lookalike: a userId that is a string prefix of another must not satisfy the path proof", async () => {
    // Guards the cheap `key.split("/").includes(userId)` proof against
    // `uploads/<victimId>x/...` style forgery.
    const lookalike = `uploads/${tenantB.id}x/forged-${RUN}.mp4`;
    const resolved = await freshSourceUrl(
      `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${lookalike}`, tenantB.id);
    expect(signed(resolved)).toBe(false);
  }, 30_000);

  it.skipIf(!dbUp)("refuses an Asset row that belongs to the other tenant", async () => {
    // B has a real Asset row for bKey; A does not. Same key, different caller.
    const asB = await freshSourceUrl(bStoredUrl, tenantB.id);
    const asA = await freshSourceUrl(bStoredUrl, tenantA.id);
    expect(signed(asB)).toBe(true);
    expect(signed(asA)).toBe(false);
  }, 30_000);
});
