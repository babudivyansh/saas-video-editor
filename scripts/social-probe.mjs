#!/usr/bin/env node
/**
 * Read-only capability probe for a connected social account.
 *
 * WHY THIS EXISTS. lib/social/capabilities.ts decides which KPI tiles render
 * live and which render greyed with an explanation. Authoring that matrix from
 * platform documentation is unreliable: Meta retires insight metrics
 * aggressively (`impressions` disappeared for Instagram media in Graph v22, and
 * several page_fans_* breakdowns have been retired), and YouTube's docs do not
 * distinguish "in the API" from "in Studio only". Getting it wrong means either
 * a permanently empty tile with no explanation, or a metric we could have shown
 * and didn't.
 *
 * So: run this against one real account per platform and author CAPABILITIES
 * from what actually came back.
 *
 * This script only ever issues GETs. It does not write to the database, does not
 * mutate anything at the provider, and prints no token material.
 *
 * MUST run under tsx, not bare node — it imports lib/social/service.ts to reuse
 * the app's own token decrypt/refresh path, so the probe exercises exactly what
 * production does:
 *
 *   npx tsx scripts/social-probe.mjs --list
 *   npx tsx scripts/social-probe.mjs <accountId>
 */

// Reuse the app's configured client (pg adapter, Supabase URL rewriting,
// logging) rather than constructing a bare one — Prisma 7 requires explicit
// options, and duplicating that setup here would drift.
const { prisma } = await import("../lib/prisma.ts");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const ok = (s) => `${GREEN}${s}${RESET}`;
const bad = (s) => `${RED}${s}${RESET}`;
const warn = (s) => `${YELLOW}${s}${RESET}`;
const dim = (s) => `${DIM}${s}${RESET}`;

async function listAccounts() {
  const accounts = await prisma.socialAccount.findMany({
    select: {
      id: true, provider: true, username: true, displayName: true, providerAccountId: true,
      status: true, followers: true, lastSyncedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) {
    console.log("No connected accounts.");
    return;
  }
  console.log(`\n${accounts.length} connected account(s):\n`);
  for (const a of accounts) {
    const label = a.username || a.displayName || a.providerAccountId;
    const flag = a.status === "active" ? ok(a.status) : warn(a.status);
    console.log(`  ${a.id}  ${a.provider.padEnd(10)} ${String(label).padEnd(28)} ${flag}  ${a.followers ?? "?"} followers`);
  }
  console.log(`\nProbe one with:  npx tsx scripts/social-probe.mjs <accountId>\n`);
}

/** Report one probe result in a fixed-width row. */
function row(name, result) {
  const label = `  ${name}`.padEnd(38);
  if (result.status === "ok") {
    const sample = result.sample === undefined ? "" : dim(` → ${JSON.stringify(result.sample).slice(0, 60)}`);
    return `${label}${ok("NATIVE")}${sample}`;
  }
  if (result.status === "empty") {
    return `${label}${warn("EMPTY")}  ${dim(result.detail ?? "call succeeded, no data returned")}`;
  }
  return `${label}${bad("FAILED")} ${dim((result.detail ?? "").slice(0, 90))}`;
}

// ── YouTube ──────────────────────────────────────────────────────────────────

const YT_ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const LAG_DAYS = 2;
const isoDay = (d) => d.toISOString().slice(0, 10);

async function ytReport(token, params) {
  const q = new URLSearchParams({ ids: "channel==MINE", ...params });
  try {
    const res = await fetch(`${YT_ANALYTICS}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        detail = JSON.parse(text).error?.message ?? detail;
      } catch { /* keep raw */ }
      return { status: "failed", detail: `${res.status}: ${detail}` };
    }
    const json = JSON.parse(text);
    if (!json.rows || json.rows.length === 0) return { status: "empty" };
    const headers = (json.columnHeaders ?? []).map((h) => h.name);
    const first = {};
    headers.forEach((h, i) => { first[h] = json.rows[0][i]; });
    return { status: "ok", sample: first, rows: json.rows.length, headers };
  } catch (e) {
    return { status: "failed", detail: String(e.message ?? e) };
  }
}

async function probeYouTube(token) {
  const endDate = isoDay(new Date(Date.now() - LAG_DAYS * 86_400_000));
  const startDate = isoDay(new Date(Date.now() - 30 * 86_400_000));
  const base = { startDate, endDate };

  console.log(`\n${dim(`Analytics window ${startDate} → ${endDate} (2-day reporting lag)`)}\n`);
  console.log("Channel daily report — each metric probed separately, because one");
  console.log(`${dim("unsupported name fails the entire request rather than being ignored.")}\n`);

  const metrics = [
    "views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage",
    "subscribersGained", "subscribersLost", "likes", "dislikes", "comments", "shares",
    "videosAddedToPlaylists", "annotationClickThroughRate", "cardClickRate",
    "impressions", "impressionClickThroughRate",
  ];
  for (const metric of metrics) {
    console.log(row(metric, await ytReport(token, { ...base, metrics: metric, dimensions: "day" })));
  }

  console.log("\nBreakdowns\n");
  const breakdowns = [
    ["ageGroup,gender × viewerPercentage", { ...base, metrics: "viewerPercentage", dimensions: "ageGroup,gender" }],
    ["country × views", { ...base, metrics: "views", dimensions: "country" }],
    ["deviceType × views", { ...base, metrics: "views", dimensions: "deviceType" }],
    ["insightTrafficSourceType × views", { ...base, metrics: "views", dimensions: "insightTrafficSourceType" }],
    ["subscribedStatus × views", { ...base, metrics: "views", dimensions: "subscribedStatus" }],
  ];
  for (const [label, params] of breakdowns) {
    console.log(row(label, await ytReport(token, params)));
  }

  console.log(`\n${dim("Note: `impressions` and `impressionClickThroughRate` are expected to FAIL —")}`);
  console.log(`${dim("they are YouTube Studio-only. A failure there confirms the matrix is honest.")}\n`);
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const GRAPH = "https://graph.facebook.com/v22.0";

async function graphGet(path, token) {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        const e = JSON.parse(text).error;
        detail = e?.message ? `${e.message}${e.code ? ` (code ${e.code})` : ""}` : detail;
      } catch { /* keep raw */ }
      return { status: "failed", detail: `${res.status}: ${detail}` };
    }
    const json = JSON.parse(text);
    const data = json.data ?? json;
    if (Array.isArray(data) && data.length === 0) return { status: "empty" };
    return { status: "ok", sample: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { status: "failed", detail: String(e.message ?? e) };
  }
}

async function probeMeta(provider, providerAccountId, token) {
  const since = Math.floor((Date.now() - 30 * 86_400_000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  if (provider === "instagram") {
    console.log("\nAccount insights (period=day)\n");
    const dayMetrics = [
      "reach", "views", "profile_views", "website_clicks", "follower_count",
      "accounts_engaged", "total_interactions", "likes", "comments", "saves", "shares",
      "impressions", // expected to fail on v22 — retired
    ];
    for (const m of dayMetrics) {
      const res = await graphGet(
        `/${providerAccountId}/insights?metric=${m}&period=day&since=${since}&until=${until}&metric_type=total_value`,
        token,
      );
      console.log(row(m, res));
    }

    console.log("\nLifetime / demographics\n");
    console.log(row("online_followers (activeHour source)",
      await graphGet(`/${providerAccountId}/insights?metric=online_followers&period=lifetime`, token)));
    for (const audience of ["follower_demographics", "engaged_audience_demographics", "reached_audience_demographics"]) {
      for (const breakdown of ["age", "gender", "country", "city"]) {
        console.log(row(`${audience} / ${breakdown}`, await graphGet(
          `/${providerAccountId}/insights?metric=${audience}&period=lifetime&metric_type=total_value&breakdown=${breakdown}`,
          token,
        )));
      }
    }

    console.log("\nMedia insights (newest item)\n");
    const media = await graphGet(`/${providerAccountId}/media?fields=id,media_type,media_product_type&limit=1`, token);
    if (media.status === "ok" && media.sample?.id) {
      const isReel = (media.sample.media_product_type || "").toLowerCase() === "reels";
      console.log(dim(`  media ${media.sample.id} (${media.sample.media_product_type || media.sample.media_type})`));
      const mediaMetrics = [
        "reach", "saved", "shares", "views", "profile_visits", "follows",
        "total_interactions", "likes", "comments", "impressions",
        ...(isReel ? ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"] : []),
      ];
      for (const m of mediaMetrics) {
        console.log(row(m, await graphGet(`/${media.sample.id}/insights?metric=${m}`, token)));
      }
    } else {
      console.log(warn("  no media to probe"));
    }
    return;
  }

  // Facebook Page
  console.log("\nPage insights (period=day)\n");
  const pageMetrics = [
    "page_impressions", "page_impressions_unique", "page_post_engagements",
    "page_fans", "page_fan_adds", "page_fan_removes", "page_views_total",
    "page_video_views", "page_actions_post_reactions_total",
  ];
  for (const m of pageMetrics) {
    console.log(row(m, await graphGet(
      `/${providerAccountId}/insights?metric=${m}&period=day&since=${since}&until=${until}`, token)));
  }

  console.log("\nPost insights (newest post)\n");
  const feed = await graphGet(`/${providerAccountId}/posts?fields=id&limit=1`, token);
  if (feed.status === "ok" && feed.sample?.id) {
    console.log(dim(`  post ${feed.sample.id}`));
    for (const m of [
      "post_impressions", "post_impressions_unique", "post_clicks",
      "post_reactions_by_type_total", "post_video_views", "post_video_avg_time_watched",
      "post_engaged_users",
    ]) {
      console.log(row(m, await graphGet(`/${feed.sample.id}/insights?metric=${m}`, token)));
    }
  } else {
    console.log(warn("  no posts to probe"));
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "--list" || arg === "-l") {
    await listAccounts();
    return;
  }

  let account;
  try {
    account = await prisma.socialAccount.findUnique({ where: { id: arg } });
  } catch (e) {
    // Most commonly: this database has not had the social_tracker_v2 migration
    // applied, so columns the client expects do not exist yet.
    console.error(bad(`\nDatabase read failed: ${e.message ?? e}`));
    console.error(dim("If this mentions a missing column, run `npx prisma migrate deploy` first.\n"));
    process.exitCode = 1;
    return;
  }
  if (!account) {
    console.error(bad(`No account with id ${arg}. Run with --list to see connected accounts.`));
    process.exitCode = 1;
    return;
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`Probing ${account.provider}  ${account.username || account.displayName || account.providerAccountId}`);
  console.log(`status=${account.status}  followers=${account.followers ?? "?"}  lastSynced=${account.lastSyncedAt?.toISOString() ?? "never"}`);
  console.log(`${"=".repeat(78)}`);

  if (account.status !== "active") {
    console.log(warn(`\nAccount status is "${account.status}" — the token may be dead. Results below may all fail.\n`));
  }

  // Reuse the app's own token handling: decrypts, refreshes when inside the
  // provider's refresh window, and re-encrypts. Importing it means the probe
  // exercises the same path production does.
  const { getValidAccessToken } = await import("../lib/social/service.ts");
  let token;
  try {
    token = await getValidAccessToken(account);
  } catch (e) {
    console.error(bad(`\nCould not obtain an access token: ${e.message ?? e}`));
    console.error(dim("If this says the account needs re-auth, reconnect it in the dashboard first.\n"));
    process.exitCode = 1;
    return;
  }

  if (account.provider === "youtube") await probeYouTube(token);
  else await probeMeta(account.provider, account.providerAccountId, token);

  console.log(`${"=".repeat(78)}`);
  console.log("Author lib/social/capabilities.ts from the NATIVE rows above.");
  console.log("A FAILED row means the metric is genuinely unavailable — give the");
  console.log("capability entry a `reason` naming the limitation, so the greyed tile");
  console.log(`can explain itself.\n${"=".repeat(78)}\n`);
}

main()
  .catch((e) => {
    console.error(bad(`probe failed: ${e.stack ?? e}`));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
