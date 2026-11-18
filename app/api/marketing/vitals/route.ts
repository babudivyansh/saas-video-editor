import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordVital } from "@/lib/web-vitals-buffer";
import { WEB_VITAL_METRICS, bucketFor, normalizeVitalsPath } from "@/lib/web-vitals";
import { withRateLimit } from "@/lib/with-rate-limit";

const bodySchema = z
  .object({
    metric: z.enum(WEB_VITAL_METRICS),
    // Clamped: a negative or absurd value is a broken client, not a real
    // measurement, and would land in a bucket that misrepresents the page.
    value: z.number().nonnegative().finite().max(600_000),
    path: z
      .string()
      .max(256)
      .regex(/^\/[^\s]*$/),
  })
  .strict();

// POST /api/marketing/vitals — anonymous Core Web Vitals field data.
//
// Deliberately first-party rather than @vercel/speed-insights: this app is
// self-hosted, where Speed Insights collects nothing. Being same-origin also
// means no CSP connect-src entry is needed.
//
// The limit is higher than the CTA beacon's because a single page load reports
// several metrics, each as its own request.
async function handlePOST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { metric, value, path } = parsed.data;
  const key = {
    date: new Date().toISOString().slice(0, 10),
    metric,
    path: normalizeVitalsPath(path),
    bucket: bucketFor(metric, value),
  };

  // Buffered and written in batches (lib/web-vitals-buffer.ts): one upsert per
  // beacon used to exhaust the DB pooler under a burst (CLIPIRO-WEB-9).
  // Best-effort, like every other analytics write here.
  recordVital(key);

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handlePOST, {
  limit: 120,
  windowSec: 60,
  keyBy: "ip",
  name: "marketing:vitals",
});
