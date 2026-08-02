// AI performance insights for a connected social account. Hard rule: the
// deterministic engine (analytics.ts) computes every number; Gemini only
// narrates what changed and recommends what to try — it is never asked to
// calculate. Follows the house LLM pattern (utils/gemini.ts).

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { withRetry as withHttpRetry } from "@/lib/with-retry";
import {
  computeAlerts, computeAnalytics, computeBestTimes, type AccountAnalytics, type AccountAlert, type BestTimeCell,
} from "./analytics";
import { PROVIDER_LABELS, type ProviderId } from "./types";

export interface InsightContent {
  summary: string;
  wins: string[];
  recommendations: string[];
}

const fmtNum = (n: number | null) =>
  n === null ? "unknown" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const fmtPct = (n: number | null) => (n === null ? "unknown" : `${n.toFixed(1)}%`);

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BLOCK_LABELS = ["12am–4am", "4am–8am", "8am–12pm", "12pm–4pm", "4pm–8pm", "8pm–12am"];

// Pure: renders the computed metrics into the compact factsheet the prompt
// embeds. Exported for tests — this is the part that must never lie.
export function buildInsightContext(
  provider: string,
  a: AccountAnalytics,
  alerts: AccountAlert[],
  best: BestTimeCell | null,
): string {
  const lines = [
    `Platform: ${PROVIDER_LABELS[provider as ProviderId] ?? provider}`,
    `Period: last ${a.rangeDays} days (each metric compared to the ${a.rangeDays} days before it)`,
    `Followers: ${fmtNum(a.followers.current)} (${a.followers.deltaPct === null ? "no comparison data" : `${a.followers.deltaPct >= 0 ? "+" : ""}${a.followers.deltaPct.toFixed(1)}% vs previous period`})`,
    `Average engagement rate: ${fmtPct(a.engagementRate.current)} (previous period: ${fmtPct(a.engagementRate.previous)})`,
    `Views gained: ${fmtNum(a.views.current)}`,
    `Posts published: ${a.postsInRange}${a.postsPerWeek !== null ? ` (~${a.postsPerWeek.toFixed(1)}/week)` : ""}`,
  ];
  if (a.contentTypes.length > 0) {
    lines.push(
      `Content mix: ${a.contentTypes
        .map((c) => `${c.type} ×${c.count}${c.avgEngagementRate !== null ? ` (avg ER ${c.avgEngagementRate.toFixed(1)}%)` : ""}`)
        .join(", ")}`,
    );
  }
  for (const [i, p] of a.topPosts.slice(0, 3).entries()) {
    lines.push(
      `Top post ${i + 1}: "${(p.caption ?? "untitled").slice(0, 80)}" — ${fmtNum(p.views ?? p.reach ?? null)} ${p.views != null ? "views" : "reach"}${p.engagementRate !== null ? `, ER ${p.engagementRate.toFixed(1)}%` : ""}`,
    );
  }
  if (best) {
    lines.push(`Best posting slot so far: ${DAY_LABELS[best.day]} ${BLOCK_LABELS[best.block]} (avg ER ${best.avgEngagementRate.toFixed(1)}% over ${best.count} posts)`);
  }
  for (const alert of alerts) lines.push(`Signal: ${alert.message}`);
  return lines.join("\n");
}

export async function generateInsight(accountId: string, provider: string): Promise<InsightContent> {
  const [snapshots, posts] = await Promise.all([
    prisma.socialAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
    }),
    prisma.socialPost.findMany({
      where: { accountId },
      select: {
        id: true, caption: true, mediaType: true, publishedAt: true, views: true, likes: true,
        comments: true, shares: true, saves: true, reach: true, watchTimeSec: true,
        permalink: true, thumbnailUrl: true,
      },
    }),
  ]);

  const now = new Date();
  const analytics = computeAnalytics(snapshots, posts, 7, now);
  const alerts = computeAlerts(snapshots, posts, now);
  const { best } = computeBestTimes(posts);
  const context = buildInsightContext(provider, analytics, alerts, best);

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `You are a social media growth coach. Below are this creator's REAL computed metrics for the last 7 days. Use ONLY these numbers — never invent, extrapolate, or recompute figures.

${context}

Return a JSON object with exactly these keys:
- "summary": 2-3 sentences on how the week went, referencing the numbers above
- "wins": array of 1-3 short bullet strings naming what worked (empty array if nothing stands out)
- "recommendations": array of 2-3 short, specific, actionable bullet strings for next week (grounded in the content mix, top posts, and best posting slot above)

Plain language, no hashtags-spam advice, no emoji. Return ONLY valid JSON, no markdown fences.`;

  const result = await withHttpRetry((signal) => model.generateContent(prompt, { signal }), { timeoutMs: 25_000 });
  const text = result.response.text().trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  const parsed = JSON.parse(text) as InsightContent;
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.recommendations)) {
    throw new Error("insight generation returned an unexpected shape");
  }
  return { summary: parsed.summary, wins: parsed.wins ?? [], recommendations: parsed.recommendations };
}
