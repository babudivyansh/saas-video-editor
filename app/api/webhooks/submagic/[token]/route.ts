import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  verifyWebhookToken,
  verifyWebhookSignature,
  extractProviderProjectId,
} from "@/lib/captions/providers/submagic/SubmagicWebhook";
import { enqueueSync } from "@/lib/caption-render-job";

// Caption-render completion callbacks (lib/caption-render-job.ts).
//
// Follows the one-route-per-service shape of the razorpay/resend/elevenlabs
// webhooks, with the same three rules, all of which matter here:
//
//   • Only the provider's project id is trusted from the body. Never a status,
//     never a URL, never a duration — the worker re-reads all of that from the
//     provider's own API, so a forged or merely malformed callback cannot
//     advance a job or fabricate an output.
//   • Nothing heavy happens inline. The handler claims and enqueues; the
//     download/upload/ingest runs on the queue's worker pool. Production runs
//     the in-process queue driver, so blocking here would stall the queue.
//   • Anything unrecognised gets 200, never 4xx/5xx. Providers back off or
//     auto-disable endpoints that error, and an event we simply don't act on is
//     not an error. The ONLY 4xx is a failed auth check.
//
// The token in the path is the primary authenticator — see SubmagicWebhook.ts
// for why, and for the signature path that switches on when/if Submagic ships
// signed webhooks.
//
// Idempotency: duplicate callbacks are free. The sync job is a read plus
// conditional writes, and the one step that must not run twice (download →
// upload → Asset) is guarded by an atomic status claim shared with the
// reconciliation sweep, so a redelivered webhook racing a sweep pass can't
// double-process.
// `params` is a Promise in Next 16 — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md.
// Spelled out rather than using the global RouteContext<'…'> helper, which is
// generated from existing routes and so can't type one that doesn't exist yet.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const tokenCheck = verifyWebhookToken(token);
  if (!tokenCheck.ok) {
    logger.warn("submagic-webhook", `token check failed: ${tokenCheck.reason}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read the raw body: a signature covers exact bytes, so re-serializing a
  // parsed object would invalidate it.
  const body = await req.text();

  const sigCheck = verifyWebhookSignature(body, req.headers.get("submagic-signature"));
  if (!sigCheck.ok) {
    logger.warn("submagic-webhook", `signature check failed: ${sigCheck.reason}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const providerProjectId = extractProviderProjectId(payload);
  if (!providerProjectId) {
    // A shape we don't recognise. 200 so the provider doesn't disable the
    // endpoint over an event we simply have no handler for.
    return NextResponse.json({ received: true });
  }

  const job = await prisma.captionRenderJob.findUnique({
    where: { providerProjectId },
    include: { clip: true },
  });
  if (!job) {
    logger.warn("submagic-webhook", `no CaptionRenderJob for provider project ${providerProjectId}`);
    return NextResponse.json({ received: true });
  }

  // Terminal jobs are done; a late or replayed callback must not reopen one.
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return NextResponse.json({ received: true });
  }

  await enqueueSync(job);

  return NextResponse.json({ received: true });
}
