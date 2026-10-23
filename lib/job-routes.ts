import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { getAuthUser } from "@/lib/auth";
import { attachmentDisposition } from "@/utils/content-disposition";
import { resignMediaUrl } from "@/lib/signed-media";
import { refundCredits, cancelGeneration, markGenerationStatus, type ChargeCreditsResult } from "@/lib/credits";

// Shared GET (poll/download) handler for the ~12 tool routes that each run
// a background job in a `globalThis` Map and let the client poll/download
// it. Every one of these routes hand-rolled its own copy of this handler;
// only 2 of them (face-swap, background-remover) actually checked that the
// caller owns the job. This factory replaces all of them with one
//auth-checked, ownership-checked, consistently-shaped implementation.
//
// Deliberately NOT changed here: each route's own POST handler, Job
// interface, Map, and background-processing logic are untouched — this
// only standardizes the read side (poll + download).

export interface PollableJob {
  progress: number;
  status: "processing" | "done" | "error" | "cancelled";
  error?: string;
  outputPath: string;
  downloadName: string;
  /** Present for jobs that accept unauthenticated requests (the 3 free
   * utility tools) — when absent, ownership is not enforced (there is
   * nothing to compare against), matching those tools' existing
   * logged-out-friendly behavior. */
  userId?: string;
  /** Optional route-specific informational payload passed through the poll
   * response as-is (e.g. AI Creator's "your video was trimmed to fit your
   * plan" notice) — most routes never set this. */
  meta?: Record<string, unknown>;
}

export interface JobStatusHandlerOptions<J = never> {
  /** MIME type of the downloaded file, e.g. "video/mp4", "image/jpeg". Pass a
   * function instead of a fixed string for a tool whose output type varies
   * per job (e.g. YouTube Downloader producing either video/mp4 or
   * audio/mpeg depending on what quality was requested at submit time). */
  contentType: string | ((job: J) => string);
  /** Whether to delete the output file + job entry once served. Set this
   * to match each route's EXISTING behavior (most delete-on-download;
   * face-swap/background-remover currently don't) to avoid changing
   * behavior as part of this security fix. */
  deleteOnDownload: boolean;
  /** If true, an unauthenticated request is allowed through (ownership is
   * only enforced when the job itself has a userId) — for the 3 free
   * tools that have no auth concept at all. Defaults to false (auth
   * required), matching every credit-charging tool. */
  allowAnonymous?: boolean;
}

export function createJobStatusHandler<J extends PollableJob>(
  jobs: Map<string, J>,
  opts: JobStatusHandlerOptions<J>,
): (req: NextRequest) => Promise<NextResponse> {
  return async function GET(req: NextRequest): Promise<NextResponse> {
    const auth = await getAuthUser(req);
    if (!auth && !opts.allowAnonymous) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const download = searchParams.get("download");
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const job = jobs.get(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (job.userId && job.userId !== auth?.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (download) {
      if (job.status !== "done") return NextResponse.json({ error: "Not ready" }, { status: 409 });
      if (!fs.existsSync(job.outputPath)) {
        return NextResponse.json({ error: "Output file missing" }, { status: 404 });
      }
      // Streamed, never read whole: outputs run to hundreds of MB (a 20-minute
      // 4K YouTube download can pass 1 GB) and readFileSync held each one in
      // memory per request — past ~2 GB it could not be held at all.
      const outputPath = job.outputPath;
      const size = fs.statSync(outputPath).size;
      const stream = fs.createReadStream(outputPath);
      if (opts.deleteOnDownload) {
        jobs.delete(jobId);
        // After the stream closes (finished OR aborted by the client) — an
        // open file can't be unlinked on Windows, and deleting it first would
        // truncate the download on Linux.
        stream.on("close", () => { fs.unlink(outputPath, () => { /* ignore */ }); });
      }
      const contentType = typeof opts.contentType === "function" ? opts.contentType(job) : opts.contentType;
      return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": attachmentDisposition(job.downloadName),
          "Content-Length": String(size),
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      progress: Math.round(job.progress),
      status: job.status,
      error: job.error,
      ...(job.meta ? { meta: await signMetaUrls(job.meta) } : {}),
    });
  };
}

// Routes put the S3 URL of a saved result in meta (voiceover's audioUrl, …).
// That is the stored, unsigned form, and the bucket is private: sign every
// top-level value that points at our bucket. meta is server-written, never
// client input, so no ownership check is needed.
async function signMetaUrls(meta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(meta).map(async ([k, v]) => [k, typeof v === "string" ? await resignMediaUrl(v) : v] as const),
  );
  return Object.fromEntries(entries);
}

export interface CancellableJob extends PollableJob {
  generationId?: string;
  creditCost: number;
  refunded: boolean;
}

/**
 * Best-effort cancellation: marks the job (and its Generation row, if any)
 * cancelled and refunds immediately, so the user isn't left waiting for the
 * job's own next checkpoint just to get their credits back. This does NOT
 * kill an in-flight FFmpeg/provider call — each route's own background work
 * checks `job.status === "cancelled"` at its own natural checkpoints (e.g.
 * between processing stages) and simply stops finalizing/refunding again
 * (the `refunded` flag it already checks prevents a double refund).
 */
export function createJobCancelHandler<J extends CancellableJob>(
  jobs: Map<string, J>,
): (req: NextRequest) => Promise<NextResponse> {
  return async function DELETE(req: NextRequest): Promise<NextResponse> {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const job = jobs.get(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.userId !== auth.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (job.status !== "processing") {
      return NextResponse.json({ error: "Job already finished" }, { status: 409 });
    }

    job.status = "cancelled";

    if (!job.refunded) {
      job.refunded = true;
      await refundCredits({ userId: auth.userId, amount: job.creditCost, generationId: job.generationId });
      if (job.generationId) {
        await cancelGeneration(job.generationId);
        await markGenerationStatus(job.generationId, "cancelled");
      }
    }

    return NextResponse.json({ ok: true });
  };
}

/**
 * What a job route returns when chargeCredits did NOT make a fresh charge
 * for this request's idempotency key, or null to carry on normally.
 *
 * A replay (same user, same key — a double-click or a network retry) gets the
 * job that key already started, so the client simply keeps polling it. It must
 * never start a second job: nothing was charged for one, and a failing second
 * job would refund the FIRST job's charge. If that job is gone (finished and
 * swept, or lost to a restart) the answer is a 409 pointing at the durable
 * Generation instead. A key that belongs to another user is refused outright.
 */
export function idempotencyResponse<J extends { generationId?: string }>(
  charge: ChargeCreditsResult,
  jobs: Map<string, J>,
): NextResponse | null {
  if (!charge.ok) {
    return charge.reason === "idempotency_conflict"
      ? NextResponse.json({ error: "This request could not be accepted. Please try again." }, { status: 409 })
      : null;
  }
  if (!charge.replay) return null;
  for (const [jobId, job] of jobs) {
    if (charge.generationId && job.generationId === charge.generationId) {
      return NextResponse.json({ jobId, generationId: charge.generationId, replayed: true }, { status: 202 });
    }
  }
  return NextResponse.json(
    { error: "This request was already submitted — check your Assets for the result.", generationId: charge.generationId },
    { status: 409 },
  );
}
