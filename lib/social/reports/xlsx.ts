// XLSX rendering of a report model, via exceljs.
//
// Unlike the CSV, this one DOES split into sheets — a workbook has tabs, so
// separation costs the reader nothing and gains them real column types. Numbers
// are written as numbers, not as pre-formatted strings, so the recipient can
// sort, chart and pivot without cleaning the file first. That is the entire
// reason to ship XLSX alongside CSV.

import ExcelJS from "exceljs";
import {
  formatDate, kpiRows, shortCaption, type ReportModel,
} from "./data";

/** Trim to Excel's 31-char sheet-name limit, and drop the characters it rejects. */
function sheetName(base: string, suffix: string): string {
  const cleaned = base.replace(/[\\/*?:[\]]/g, " ").trim();
  const room = 31 - suffix.length - 1;
  return `${cleaned.slice(0, Math.max(1, room))} ${suffix}`.trim().slice(0, 31);
}

function header(sheet: ExcelJS.Worksheet, columns: Array<{ header: string; key: string; width?: number }>) {
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function renderXlsx(model: ReportModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Clipiro";
  workbook.created = model.generatedAt;

  const overview = workbook.addWorksheet("Overview");
  header(overview, [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 48 },
  ]);
  overview.addRows([
    { field: "Report", value: model.title },
    { field: "Period start", value: formatDate(model.periodStart) },
    { field: "Period end", value: formatDate(model.periodEnd) },
    { field: "Generated", value: model.generatedAt.toISOString() },
    { field: "Accounts", value: model.accounts.map((a) => a.label).join(", ") },
  ]);

  if (model.sections.includes("kpis")) {
    const sheet = workbook.addWorksheet("Metrics");
    header(sheet, [
      { header: "Account", key: "account", width: 24 },
      { header: "Metric", key: "metric", width: 26 },
      { header: "Value", key: "value" },
      { header: "Change", key: "change" },
    ]);
    for (const account of model.accounts) {
      for (const row of kpiRows(account)) {
        sheet.addRow({ account: account.label, metric: row.metric, value: row.value, change: row.change });
      }
    }
  }

  if (model.sections.includes("trends")) {
    for (const account of model.accounts) {
      const withPoints = account.series.filter((s) => s.points.length > 0);
      if (withPoints.length === 0) continue;

      const sheet = workbook.addWorksheet(sheetName(account.label, "trend"));
      // Union of dates so a sparse metric still lines up with the others.
      const dates = [...new Set(withPoints.flatMap((s) => s.points.map((p) => p.date)))].sort();
      header(sheet, [
        { header: "Date", key: "date" },
        ...withPoints.map((s) => ({ header: s.metric, key: s.metric })),
      ]);

      const lookup = withPoints.map((s) => ({ metric: s.metric, byDate: new Map(s.points.map((p) => [p.date, p.value])) }));
      for (const date of dates) {
        const row: Record<string, string | number | null> = { date };
        // null, not 0: a gap in a spreadsheet must stay a blank cell or every
        // chart drawn from it dips to the floor on days nobody reported.
        for (const { metric, byDate } of lookup) row[metric] = byDate.get(date) ?? null;
        sheet.addRow(row);
      }
    }
  }

  if (model.sections.includes("content")) {
    const sheet = workbook.addWorksheet("Posts");
    header(sheet, [
      { header: "Account", key: "account", width: 20 },
      { header: "Published", key: "published" },
      { header: "Type", key: "type", width: 12 },
      { header: "Caption", key: "caption", width: 50 },
      { header: "Views", key: "views" },
      { header: "Reach", key: "reach" },
      { header: "Likes", key: "likes" },
      { header: "Comments", key: "comments" },
      { header: "Shares", key: "shares" },
      { header: "Saves", key: "saves" },
      { header: "Engagement rate %", key: "er" },
      { header: "Viral score", key: "score" },
      { header: "Link", key: "link", width: 40 },
    ]);
    for (const account of model.accounts) {
      for (const post of account.topPosts) {
        sheet.addRow({
          account: account.label,
          published: post.publishedAt ?? null,
          type: post.mediaType,
          caption: shortCaption(post.caption, 200),
          views: post.views,
          reach: post.reach,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          saves: post.saves,
          er: post.engagementRate,
          score: post.viralScore,
          link: post.permalink,
        });
      }
    }
    sheet.getColumn("published").numFmt = "yyyy-mm-dd";
    sheet.getColumn("er").numFmt = "0.00";
  }

  if (model.sections.includes("audience")) {
    const sheet = workbook.addWorksheet("Audience");
    header(sheet, [
      { header: "Account", key: "account", width: 20 },
      { header: "Population", key: "population" },
      { header: "Dimension", key: "dimension" },
      { header: "Bucket", key: "bucket" },
      { header: "Value", key: "value" },
      { header: "Unit", key: "unit" },
    ]);
    for (const account of model.accounts) {
      for (const row of account.audience) {
        sheet.addRow({
          account: account.label, population: row.audience, dimension: row.dimension,
          bucket: row.bucket, value: row.value, unit: row.unit,
        });
      }
    }
  }

  if (model.sections.includes("competitors") && model.competitors.length > 0) {
    const sheet = workbook.addWorksheet("Competitors");
    header(sheet, [
      { header: "Handle", key: "handle", width: 24 },
      { header: "Platform", key: "provider" },
      { header: "Followers", key: "followers" },
      { header: "Follower gap", key: "gap" },
      { header: "Engagement rate %", key: "er" },
      { header: "Posts/week", key: "ppw" },
    ]);
    for (const c of model.competitors) {
      sheet.addRow({
        handle: c.handle, provider: c.provider, followers: c.followers,
        gap: c.followerGap, er: c.engagementRate, ppw: c.postsPerWeek,
      });
    }
  }

  if (model.goals.length > 0) {
    const sheet = workbook.addWorksheet("Goals");
    header(sheet, [
      { header: "Metric", key: "metric", width: 22 },
      { header: "Current", key: "current" },
      { header: "Target", key: "target" },
      { header: "Progress %", key: "pct" },
      { header: "Days remaining", key: "days" },
      { header: "Status", key: "status" },
    ]);
    for (const g of model.goals) {
      sheet.addRow({
        metric: g.metric, current: g.current, target: g.target, pct: g.pct,
        days: g.daysRemaining,
        status: g.hit ? "hit" : g.onTrack === null ? "unknown" : g.onTrack ? "on track" : "behind",
      });
    }
  }

  if (model.sections.includes("ai") && model.ai) {
    const sheet = workbook.addWorksheet("Summary");
    header(sheet, [
      { header: "Kind", key: "kind", width: 18 },
      { header: "Detail", key: "detail", width: 90 },
    ]);
    sheet.addRow({ kind: "Summary", detail: model.ai.summary });
    for (const win of model.ai.wins) sheet.addRow({ kind: "Win", detail: win });
    for (const concern of model.ai.concerns) sheet.addRow({ kind: "Concern", detail: concern });
    for (const rec of model.ai.recommendations) {
      sheet.addRow({ kind: "Recommendation", detail: `${rec.title} — ${rec.rationale}` });
    }
    sheet.getColumn("detail").alignment = { wrapText: true, vertical: "top" };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
