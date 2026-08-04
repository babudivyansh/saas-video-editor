// The original weekly AI insight, now a thin adapter over the v2 AI layer.
//
// Everything that used to live here — the hand-rolled factsheet, the prompt, the
// JSON parsing, the `typeof summary === "string"` shape check — has a stricter
// equivalent under lib/social/ai (factsheets.ts, executive-summary.ts,
// client.ts). What remains is the mapping to the older `InsightContent` shape,
// so app/api/social/insights/route.ts and anything already reading stored
// insights keep working unchanged until stage 10 retires them.

import { NotFoundError } from "./api";
import { assembleAccountFactsheet } from "./ai/assemble";
import { generateExecutiveSummary } from "./ai/executive-summary";
import { periodBounds } from "./metrics";
import { loadAccounts } from "./queries";

export interface InsightContent {
  summary: string;
  wins: string[];
  recommendations: string[];
}

export async function generateInsight(
  accountId: string,
  userId: string,
  tz = "UTC",
  now = new Date(),
): Promise<InsightContent> {
  const [account] = await loadAccounts(userId, [accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const { from, to } = periodBounds("weekly", now, tz);
  const { facts } = await assembleAccountFactsheet(account, "weekly", { from, to, tz }, now);
  const summary = await generateExecutiveSummary(facts, "weekly");

  return {
    summary: summary.summary,
    wins: summary.wins,
    // The old shape is a flat string list. The title carries the action; the
    // rationale is dropped rather than jammed in with a separator, which read
    // as one long unreadable bullet in the legacy UI.
    recommendations: summary.recommendations.map((r) => r.title),
  };
}
