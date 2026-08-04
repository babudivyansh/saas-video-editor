// CSV rendering of a report model.
//
// One file with labelled blocks rather than a zip of sheets: a CSV export is
// opened in a spreadsheet and skimmed, and a reader who has to open five files
// to compare two numbers will just not do it.

import { csvBody, type CsvRow } from "../csv";
import {
  formatDate, kpiRows, shortCaption, type ReportModel,
} from "./data";

export function renderCsv(model: ReportModel): string {
  const rows: CsvRow[] = [];

  rows.push([model.title]);
  rows.push(["Period", formatDate(model.periodStart), "to", formatDate(model.periodEnd)]);
  rows.push(["Generated", model.generatedAt.toISOString()]);
  rows.push([]);

  if (model.sections.includes("kpis")) {
    for (const account of model.accounts) {
      rows.push([`${account.label} (${account.provider}) — metrics`]);
      rows.push(["Metric", "Value", "Change vs previous period"]);
      for (const row of kpiRows(account)) rows.push([row.metric, row.value, row.change]);
      rows.push([]);
    }
  }

  if (model.sections.includes("trends")) {
    for (const account of model.accounts) {
      for (const series of account.series) {
        if (series.points.length === 0) continue;
        rows.push([`${account.label} — ${series.metric} over time`]);
        rows.push(["Date", series.metric]);
        for (const point of series.points) rows.push([point.date, point.value]);
        rows.push([]);
      }
    }
  }

  if (model.sections.includes("content")) {
    for (const account of model.accounts) {
      if (account.topPosts.length === 0) continue;
      rows.push([`${account.label} — top posts`]);
      rows.push([
        "Published", "Type", "Caption", "Views", "Reach", "Likes", "Comments",
        "Shares", "Saves", "Engagement rate %", "Viral score", "Link",
      ]);
      for (const post of account.topPosts) {
        rows.push([
          formatDate(post.publishedAt), post.mediaType, shortCaption(post.caption, 200),
          post.views, post.reach, post.likes, post.comments, post.shares, post.saves,
          post.engagementRate === null ? "" : post.engagementRate.toFixed(2),
          post.viralScore === null ? "" : post.viralScore.toFixed(1),
          post.permalink,
        ]);
      }
      rows.push([]);

      if (account.contentMix.length > 0) {
        rows.push([`${account.label} — content mix`]);
        rows.push(["Type", "Posts", "Average engagement rate %"]);
        for (const mix of account.contentMix) {
          rows.push([mix.type, mix.count, mix.avgEngagementRate?.toFixed(2) ?? ""]);
        }
        rows.push([]);
      }
    }
  }

  if (model.sections.includes("audience")) {
    for (const account of model.accounts) {
      if (account.audience.length === 0) continue;
      rows.push([`${account.label} — audience`]);
      rows.push(["Population", "Dimension", "Bucket", "Value", "Unit"]);
      for (const row of account.audience) {
        rows.push([row.audience, row.dimension, row.bucket, row.value, row.unit]);
      }
      rows.push([]);
    }
  }

  if (model.sections.includes("competitors") && model.competitors.length > 0) {
    rows.push(["Competitors"]);
    rows.push(["Handle", "Platform", "Followers", "Follower gap", "Engagement rate %", "Posts/week"]);
    for (const c of model.competitors) {
      rows.push([c.handle, c.provider, c.followers, c.followerGap, c.engagementRate, c.postsPerWeek]);
    }
    rows.push([]);
  }

  if (model.goals.length > 0) {
    rows.push(["Goals"]);
    rows.push(["Metric", "Current", "Target", "Progress %", "Days remaining", "On track"]);
    for (const g of model.goals) {
      rows.push([
        g.metric, g.current, g.target,
        g.pct === null ? "" : g.pct.toFixed(0),
        g.daysRemaining,
        g.hit ? "hit" : g.onTrack === null ? "unknown" : g.onTrack ? "yes" : "no",
      ]);
    }
    rows.push([]);
  }

  if (model.sections.includes("ai") && model.ai) {
    rows.push(["Summary"]);
    rows.push([model.ai.summary]);
    for (const win of model.ai.wins) rows.push(["Win", win]);
    for (const concern of model.ai.concerns) rows.push(["Concern", concern]);
    for (const rec of model.ai.recommendations) rows.push(["Recommendation", rec.title, rec.rationale]);
  }

  // csvBody carries the BOM and the formula-injection guard — captions and
  // competitor handles both land in this file and both are attacker text.
  return csvBody([], rows).replace(/^﻿\r\n/, "﻿");
}
