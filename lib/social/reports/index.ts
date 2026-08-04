// buildReport(runId): load, render, upload, mark done.
//
// The one impure module in lib/social/reports. Everything it hands to a
// renderer has already been computed by lib/social/metrics, so a figure in a
// PDF and the same figure on the dashboard come from one implementation —
// "the report disagrees with the screen" is not a bug this can grow.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { uploadBufferToS3 } from "@/utils/s3-upload";
import type { MetricKey } from "../capabilities";
import {
  compareCompetitors, contentTypeBreakdown, goalProgress, postEngagementRate,
  rankByAudience, type Period, type SeriesPoint,
} from "../metrics";
import { comparePlatforms } from "../metrics/compare";
import { loadAccountKpis, loadAccounts, loadAudience, loadSeries } from "../queries";
import { renderCsv } from "./csv";
import { renderPdf } from "./pdf";
import { renderXlsx } from "./xlsx";
import {
  defaultTitle, type ReportAi, type ReportModel, type ReportSection,
} from "./data";

/** Metrics charted and tabulated in every report. */
const REPORT_METRICS: MetricKey[] = ["followers", "reach", "views", "engagementRate"];
const TOP_POSTS = 20;
const AUDIENCE_WINDOW_DAYS = 60;
const AUDIENCE_ROWS = 60;

export interface BuildResult {
  storageKey: string;
  sizeBytes: number;
}

/**
 * Build one queued run to completion.
 *
 * Marks running → done/failed as it goes, so a crashed worker leaves a run
 * visibly stuck rather than eternally "queued" with nothing working on it.
 */
export async function buildReport(runId: string): Promise<BuildResult> {
  const run = await prisma.socialReportRun.findUniqueOrThrow({ where: { id: runId } });
  await prisma.socialReportRun.update({ where: { id: runId }, data: { status: "running" } });

  try {
    const config = run.configId
      ? await prisma.socialReportConfig.findUnique({ where: { id: run.configId } })
      : null;

    const model = await assembleReport({
      userId: run.userId,
      accountIds: config?.accountIds ?? [],
      sections: (config?.sections as ReportSection[]) ?? ["kpis", "trends", "content", "ai"],
      period: (config?.period as Period) ?? "monthly",
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      title: config?.name,
    });

    const { buffer, contentType, extension } = await render(model, run.format);
    const storageKey = `social-reports/${run.userId}/${run.id}.${extension}`;
    await uploadBufferToS3(buffer, storageKey, contentType, `${slug(model.title)}.${extension}`);

    await prisma.socialReportRun.update({
      where: { id: runId },
      data: { status: "done", storageKey, sizeBytes: buffer.byteLength, completedAt: new Date() },
    });

    return { storageKey, sizeBytes: buffer.byteLength };
  } catch (e) {
    logger.error("social-reports", `run ${runId} failed`, e);
    await prisma.socialReportRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        // Truncated: a provider stack trace in a column the UI renders is how
        // internals end up on a user's screen.
        error: e instanceof Error ? e.message.slice(0, 500) : "Report generation failed",
        completedAt: new Date(),
      },
    });
    throw e;
  }
}

async function render(
  model: ReportModel,
  format: string,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (format === "csv") {
    return { buffer: Buffer.from(renderCsv(model), "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  if (format === "xlsx") {
    return {
      buffer: await renderXlsx(model),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  return { buffer: await renderPdf(model), contentType: "application/pdf", extension: "pdf" };
}

export interface AssembleOptions {
  userId: string;
  accountIds: string[];
  sections: ReportSection[];
  period: Period | "custom";
  periodStart: Date;
  periodEnd: Date;
  title?: string | null;
  /** Pre-generated summary. Reports never call the model themselves — the
   *  charge happens once at enqueue, where the user can be told about it. */
  ai?: ReportAi | null;
}

export async function assembleReport(opts: AssembleOptions): Promise<ReportModel> {
  const accounts = await loadAccounts(opts.userId, opts.accountIds.length > 0 ? opts.accountIds : undefined);
  const now = new Date();

  const reportAccounts = await Promise.all(
    accounts.map(async (account) => {
      const tz = account.timezone ?? "UTC";
      const [{ kpis }, posts, audience, series] = await Promise.all([
        loadAccountKpis(account, opts.periodStart, opts.periodEnd, tz),
        prisma.socialPost.findMany({
          where: { accountId: account.id, publishedAt: { gte: opts.periodStart, lt: opts.periodEnd } },
          orderBy: { publishedAt: "desc" },
          take: 500,
          select: {
            id: true, caption: true, mediaType: true, publishedAt: true, views: true,
            reach: true, likes: true, comments: true, shares: true, saves: true,
            impressions: true, viralScore: true, permalink: true,
          },
        }),
        opts.sections.includes("audience")
          ? loadAudience(account.id, new Date(now.getTime() - AUDIENCE_WINDOW_DAYS * 86_400_000))
          : Promise.resolve({ accountId: account.id, rows: [], capturedAt: null }),
        opts.sections.includes("trends")
          ? Promise.all(
              REPORT_METRICS.map(async (metric) => ({
                metric,
                points: (await loadSeries(account, metric, opts.periodStart, opts.periodEnd, "day", tz)).points,
              })),
            )
          : Promise.resolve([] as Array<{ metric: MetricKey; points: SeriesPoint[] }>),
      ]);

      return {
        id: account.id,
        provider: account.provider,
        label: account.displayName ?? account.username ?? account.provider,
        followers: account.followers,
        healthScore: account.healthScore,
        kpis,
        series,
        contentMix: contentTypeBreakdown(posts),
        topPosts: rankByAudience(posts)
          .slice(0, TOP_POSTS)
          .map((p) => ({
            id: p.id,
            caption: p.caption,
            mediaType: p.mediaType,
            publishedAt: p.publishedAt,
            views: p.views,
            reach: p.reach,
            likes: p.likes,
            comments: p.comments,
            shares: p.shares,
            saves: p.saves,
            // Derived from the same pure function the charts use, so a post's
            // rate in a PDF never disagrees with the same post on screen.
            engagementRate: postEngagementRate(p),
            viralScore: p.viralScore,
            permalink: p.permalink,
          })),
        audience: audience.rows.slice(0, AUDIENCE_ROWS),
      };
    }),
  );

  const [competitorRows, goalRows] = await Promise.all([
    opts.sections.includes("competitors")
      ? prisma.competitorProfile.findMany({
          where: { userId: opts.userId },
          select: {
            id: true, provider: true, handle: true, displayName: true, followers: true,
            snapshots: {
              orderBy: { capturedAt: "desc" },
              take: 2,
              select: { followers: true, engagementRate: true, postsPerWeek: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.socialGoal.findMany({ where: { userId: opts.userId, status: "active" } }),
  ]);

  const goals = await Promise.all(
    goalRows.map(async (goal) => {
      const account = accounts.find((a) => a.id === goal.accountId) ?? accounts[0];
      const points = account
        ? (await loadSeries(account, goal.metric as MetricKey, opts.periodStart, opts.periodEnd, "day", account.timezone ?? "UTC")).points
        : [];
      return {
        metric: goal.metric,
        ...goalProgress(
          {
            id: goal.id, metric: goal.metric, target: goal.target, baseline: goal.baseline,
            startAt: goal.startAt, dueAt: goal.dueAt, status: goal.status,
          },
          points,
          now,
        ),
      };
    }),
  );

  return {
    title: opts.title || defaultTitle(opts.period, opts.periodStart, opts.periodEnd),
    period: opts.period,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    generatedAt: now,
    sections: opts.sections,
    accounts: reportAccounts,
    platforms: comparePlatforms(
      reportAccounts.map((a) => ({
        accountId: a.id,
        provider: a.provider,
        label: a.label,
        followers: a.followers,
        engagementRate: a.kpis.engagementRate.current,
      })),
    ),
    competitors: compareCompetitors(
      accounts.map((a) => ({ provider: a.provider, followers: a.followers })),
      competitorRows.map((c) => ({
        id: c.id,
        handle: c.displayName ?? c.handle,
        provider: c.provider,
        followers: c.snapshots[0]?.followers ?? c.followers,
        engagementRate: c.snapshots[0]?.engagementRate ?? null,
        postsPerWeek: c.snapshots[0]?.postsPerWeek ?? null,
        weekGrowth:
          c.snapshots[0]?.followers != null && c.snapshots[1]?.followers != null
            ? c.snapshots[0].followers - c.snapshots[1].followers
            : null,
      })),
    ),
    goals,
    ai: opts.ai ?? null,
  };
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}
