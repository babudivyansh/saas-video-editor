import type { NextRequest } from "next/server";
import { readJob } from "@/lib/mobile/jobs";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/jobs/:id → { id, type, status, progress, error, createdAt, result }.
// Poll every few seconds while it runs. It's read from the database, so it's
// right after a server restart too.
export const GET = withRateLimit(
  withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
    const job = await readJob(auth.userId, (await params).id);
    return job ? mobileJson(job) : mobileError(404, "Job not found");
  }),
  { limit: 240, windowSec: 60, keyBy: "user", name: "mobile:job-status" },
);
