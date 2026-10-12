import type { NextRequest } from "next/server";
import { SUMMARY_PERIODS, summaryRequest } from "@clipiro/shared";
import { POST as webGenerate } from "@/app/api/social/summary/route";
import { ownedAccount, toSummary } from "@/lib/mobile/social";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileSubscriber } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

// The AI executive summary for one account.

// GET /api/mobile/v1/social/summary?accountId=&period=weekly → { summary } (the latest, or null).
export const GET = withMobileSubscriber(async (req: NextRequest, auth) => {
  const q = req.nextUrl.searchParams;
  const accountId = q.get("accountId") ?? "";
  const period = (q.get("period") ?? "weekly") as (typeof SUMMARY_PERIODS)[number];
  if (!SUMMARY_PERIODS.includes(period)) return mobileError(400, "period must be weekly or monthly", { code: "invalid_request" });
  if (!(await ownedAccount(auth.userId, accountId))) return mobileError(404, "Account not found");
  const row = await prisma.aiInsight.findFirst({ where: { accountId, kind: `executive_summary_${period}` }, orderBy: { createdAt: "desc" } });
  return mobileJson({ summary: row ? toSummary(row) : null });
});

// POST /api/mobile/v1/social/summary { accountId, period? } → { summary }. Wraps
// the web route: WEEKLY_SUMMARY_CREDITS credits, and a recent summary for the
// period comes back free instead of being made again.
export const POST = withMobileSubscriber(async (req: NextRequest) => {
  const body = await parseBody(req, summaryRequest);
  if (!body.ok) return body.res;
  const r = await callWeb(webGenerate, req, { accountId: body.data.accountId, period: body.data.period });
  if (r.status >= 400) return webError(r);
  const row = (r.json.data as { summary?: Parameters<typeof toSummary>[0] & { createdAt: string; periodStart: string; periodEnd: string } } | undefined)?.summary;
  if (!row) return mobileError(500, "The summary was made but couldn't be read. Try again.");
  return mobileJson(
    { summary: toSummary({ ...row, createdAt: new Date(row.createdAt), periodStart: new Date(row.periodStart), periodEnd: new Date(row.periodEnd) }) },
    r.status,
  );
});
