import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { attachmentDisposition } from "@/utils/content-disposition";
import { refundCredits, cancelGeneration, markGenerationStatus } from "@/lib/credits";

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
      const buffer = fs.readFileSync(job.outputPath);
      if (opts.deleteOnDownload) {
        try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
        jobs.delete(jobId);
      }
      const contentType = typeof opts.contentType === "function" ? opts.contentType(job) : opts.contentType;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": attachmentDisposition(job.downloadName),
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      progress: Math.round(job.progress),
      status: job.status,
      error: job.error,
      ...(job.meta ? { meta: job.meta } : {}),
    });
  };
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
