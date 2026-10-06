import type { NextRequest } from "next/server";
import { getDownloadLink } from "@/lib/mobile/projects";
import { mobileError, mobileJson, withMobileAuth } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/mobile/v1/clips/:id/download → { url, fileName, expiresAt }: a
// signed link the app saves the MP4 from directly (the web streams the file
// through the server instead; a phone doesn't need that).
export const GET = withRateLimit(
  withMobileAuth(async (_req: NextRequest, auth, { params }: Ctx) => {
    const link = await getDownloadLink(auth.userId, (await params).id);
    if (link === "not-found") return mobileError(404, "Clip not found");
    if (link === "not-ready") return mobileError(409, "This clip isn't ready yet", { code: "not_ready" });
    return mobileJson(link);
  }),
  { limit: 60, windowSec: 300, keyBy: "user", name: "mobile:clip-download" },
);
