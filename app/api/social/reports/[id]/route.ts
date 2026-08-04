import { prisma } from "@/lib/prisma";
import { NotFoundError, ok, withSocial } from "@/lib/social/api";
import { getPresignedUrl } from "@/utils/s3-upload";

// GET    /api/social/reports/[id] → run status, and a download URL once done
// DELETE /api/social/reports/[id] → remove a run
//
// The download is a presigned URL minted per request rather than a stored
// public link: the object stays private, and a URL that leaks expires in
// minutes instead of living as long as the bucket does.
const DOWNLOAD_TTL_SECONDS = 300;

type Params = { id: string };

export const GET = withSocial<Params>(async (_req, { auth, params }) => {
  const run = await prisma.socialReportRun.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!run) throw new NotFoundError("Report not found");

  const downloadUrl =
    run.status === "done" && run.storageKey
      ? await getPresignedUrl(run.storageKey, DOWNLOAD_TTL_SECONDS)
      : null;

  return ok({
    run: {
      id: run.id,
      configId: run.configId,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      format: run.format,
      status: run.status,
      sizeBytes: run.sizeBytes,
      error: run.error,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    },
    downloadUrl,
    expiresInSeconds: downloadUrl ? DOWNLOAD_TTL_SECONDS : null,
  });
}, {
  // Polled while a report builds, so the limit has to allow a sane poll rate.
  rateLimit: { key: (auth, params) => `social:report:${auth.userId}:${params.id}`, max: 120, windowSec: 60 },
});

// Not subscriber-gated: removing your own data never requires an active plan.
export const DELETE = withSocial<Params>(async (_req, { auth, params }) => {
  const run = await prisma.socialReportRun.findFirst({
    where: { id: params.id, userId: auth.userId },
    select: { id: true },
  });
  if (!run) throw new NotFoundError("Report not found");

  // The S3 object is left to lifecycle expiry rather than deleted inline: a
  // failed delete must not block the user from clearing their own list, and
  // the key is unreachable the moment the row is gone.
  await prisma.socialReportRun.delete({ where: { id: run.id } });
  return ok({ deleted: true });
}, { subscriber: false });
