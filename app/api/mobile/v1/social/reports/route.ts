import type { NextRequest } from "next/server";
import { reportRequest } from "@clipiro/shared";
import { POST as webRun } from "@/app/api/social/reports/route";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";
import { listReports, toReportFile } from "@/lib/mobile/social";

// GET /api/mobile/v1/social/reports → { saved, files, links }: report setups,
// the files made from them (newest first) and active share links.
export const GET = withMobileSubscriber(async (_req: NextRequest, auth) => mobileJson(await listReports(auth.userId)));

type WebRun = { id: string; format: string; status: string; sizeBytes: number | null; createdAt: string; periodStart: string; periodEnd: string };

// POST /api/mobile/v1/social/reports?tz= { name, accountIds, sections, format, schedule }
// → 202 { file }. The web's own report run (its limits, its queue): the setup
// is saved, and a scheduled one is emailed to the owner every week or month,
// covering that week or month (a manual one covers the last month).
export const POST = withMobileSubscriber(async (req: NextRequest) => {
  const body = await parseBody(req, reportRequest);
  if (!body.ok) return body.res;
  const b = body.data;
  const period = b.schedule === "weekly" ? "weekly" : "monthly";
  const r = await callWeb(webRun, req, {
    config: { name: b.name, accountIds: b.accountIds, sections: b.sections, format: b.format, schedule: b.schedule, period, deliverToOwner: b.schedule !== "none" },
    format: b.format,
    period,
    tz: req.nextUrl.searchParams.get("tz") ?? "UTC",
  });
  if (r.status >= 400) return webError(r);
  const run = (r.json.data as { run?: WebRun } | undefined)?.run;
  if (!run) return mobileError(500, "The report started but can't be followed. Pull to refresh.");
  const file = toReportFile({ ...run, createdAt: new Date(run.createdAt), periodStart: new Date(run.periodStart), periodEnd: new Date(run.periodEnd) }, b.name);
  return mobileJson({ file }, 202);
});
