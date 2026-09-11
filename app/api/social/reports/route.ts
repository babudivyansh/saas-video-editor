import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, assertOwnedAccounts, ok, parseBody, parseQuery, withSocial } from "@/lib/social/api";
import { periodSchema, reportConfigSchema, reportFormatSchema } from "@/lib/social/schemas";
import { periodBounds } from "@/lib/social/metrics";
import { enqueueReport } from "@/lib/social/reports/queue";

// GET  /api/social/reports        → recent runs and saved configs
// POST /api/social/reports        → queue a run, 202 with its id
//
// 202 and not 200: the response means "accepted", and the run row is how the
// client follows it. Building an annual multi-account PDF inside the request
// would block the event loop for every other request on the instance.
const RUN_PAGE = 20;

const runBodySchema = z.object({
  /** Reuse a saved config, or describe a one-off run inline. */
  configId: z.string().min(8).max(64).optional(),
  // `schedule` and `recipients` used to be stripped here and hardcoded below,
  // which made scheduled reports impossible BY CONSTRUCTION: no config could
  // ever have schedule !== "none", so runScheduledReports queried for weekly
  // and monthly configs and always found zero. The columns, the index serving
  // that query, and the ?job=reports cron all existed for a feature no request
  // could reach. lib/social/schemas.ts already defined both correctly.
  config: reportConfigSchema.omit({ name: true, recipients: true }).extend({
    name: z.string().trim().min(1).max(120).optional(),
    // A boolean, NOT a recipient list. The column holds addresses and the
    // schema validates up to ten of them, but accepting arbitrary ones here
    // would make this an open relay for report attachments — anyone could have
    // a private analytics PDF delivered to an address they do not control.
    // Refusing the input outright beats accepting it and quietly ignoring it.
    // Widen to a real list once addresses are verified per account.
    deliverToOwner: z.boolean().default(false),
  }).optional(),
  period: periodSchema.optional(),
  format: reportFormatSchema.optional(),
  tz: z.string().max(64).default("UTC"),
});

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(50).default(RUN_PAGE) }));

  const [runs, configs] = await Promise.all([
    prisma.socialReportRun.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: q.limit,
      // storageKey is deliberately not selected: it is an internal S3 path, and
      // downloads go through the presigned route rather than through the client
      // knowing where the object lives.
      select: {
        id: true, configId: true, periodStart: true, periodEnd: true, format: true,
        status: true, sizeBytes: true, error: true, createdAt: true, completedAt: true,
      },
    }),
    prisma.socialReportConfig.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: "asc" } }),
  ]);

  return ok({ runs, configs });
}, {
  rateLimit: { key: (auth) => `social:reports:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, runBodySchema);

  const config = body.configId
    ? await prisma.socialReportConfig.findFirst({ where: { id: body.configId, userId: auth.userId } })
    : null;
  // A configId that is not ours is indistinguishable from one that does not
  // exist, same rule as assertOwnedAccount.
  //
  // Thrown, not returned: ok() wraps its argument in { data }, so returning
  // here produced {"data":{"error":"Report not found"}} with a 404 status —
  // and useSocialApi reads body.error on a failure, so the client showed the
  // generic "Request failed (404)" instead of the message this line wrote.
  if (body.configId && !config) throw new NotFoundError("Report not found");

  const accountIds = config?.accountIds ?? body.config?.accountIds ?? [];
  if (accountIds.length > 0) await assertOwnedAccounts(auth.userId, accountIds);

  const period = (body.period ?? config?.period ?? body.config?.period ?? "monthly") as
    "weekly" | "monthly" | "quarterly" | "annual";
  const format = body.format ?? config?.format ?? body.config?.format ?? "pdf";
  const { from, to } = periodBounds(period, new Date(), body.tz);

  // An inline config is persisted so the run has something to describe itself
  // with later — a run whose parameters are gone cannot be re-run or explained.
  const runConfig =
    config ??
    (body.config
      ? await prisma.socialReportConfig.create({
          data: {
            userId: auth.userId,
            name: body.config.name ?? `${period} report`,
            accountIds: body.config.accountIds,
            period,
            sections: body.config.sections,
            format,
            schedule: body.config.schedule,
            recipients: body.config.deliverToOwner ? [auth.email] : [],
          },
        })
      : null);

  const run = await prisma.socialReportRun.create({
    data: {
      userId: auth.userId,
      configId: runConfig?.id ?? null,
      periodStart: from,
      periodEnd: to,
      format,
      status: "queued",
    },
  });

  const { driver } = await enqueueReport(run.id);
  return ok({ run, driver }, { status: 202 });
}, {
  // Report generation is the most expensive thing a user can ask for on this
  // surface, so the limit is per-hour rather than per-minute.
  rateLimit: { key: (auth) => `social:reports:create:${auth.userId}`, max: 10, windowSec: 3600 },
});
