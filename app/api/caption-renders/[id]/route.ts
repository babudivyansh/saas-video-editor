import { NextResponse } from "next/server";
import { withApi } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { serializeCaptionRenderJob } from "@/lib/captions/serialize";
import { getAssetReadUrl } from "@/utils/s3-upload";

// Status for one caption render, for the client to poll.
//
// Ownership is enforced through the clip's project, not a userId column on the
// job — a userId that could go stale is exactly the kind of second source of
// truth this schema avoids elsewhere, and the project relation is the real
// authority on who owns the clip.
export const GET = withApi<{ id: string }>(async (_req, { auth, params }) => {
  const job = await prisma.captionRenderJob.findFirst({
    where: { id: params.id, clip: { project: { userId: auth.userId } } },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Once ingested, the download URL is minted fresh from OUR key. The provider
  // URL is never handed to a client and never persisted (§28) — the whole point
  // of the download step is that Clipiro owns the final asset.
  let outputUrl: string | null = null;
  if (job.outputAssetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: job.outputAssetId, userId: auth.userId },
      select: { s3Key: true },
    });
    if (asset) outputUrl = await getAssetReadUrl(asset.s3Key);
  }

  return NextResponse.json({ job: serializeCaptionRenderJob(job), outputUrl });
});
