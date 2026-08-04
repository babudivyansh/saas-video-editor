// Deterministic weekly signals surfaced as chips on the dashboard and, later, in
// the email digest.
//
// Alerts now carry a structured {code, params} rather than only a baked English
// sentence. The app ships 13 locales; a pure module cannot know which one the
// reader wants, so formatting belongs in the presentation layer. `message` is
// retained as an English fallback for existing consumers and is deprecated —
// new code should render from `code` + `params` through next-intl.

import { within } from "./dates";
import { postEngagementRate } from "./posts";
import { latestValue, mean, type CumulativeRow } from "./series";
import type { PostRow, SnapshotRow } from "./types";

export type AlertCode =
  | "followerMilestone"
  | "followerDrop"
  | "engagementDrop"
  | "engagementSpike";

export interface AccountAlert {
  kind: "milestone" | "drop" | "spike";
  severity: "info" | "warning";
  code: AlertCode;
  /** Values for interpolation. Numbers are raw — the renderer formats them. */
  params: Record<string, number>;
  /**
   * @deprecated English fallback. Render from `code` + `params` instead so the
   * string can be translated.
   */
  message: string;
}

const MILESTONES = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];

/** Followers lost in a week beyond this fraction is worth flagging. */
const FOLLOWER_DROP_THRESHOLD = 0.01;
/** Week-over-week engagement change beyond these is worth flagging. */
const ER_DROP_THRESHOLD = -0.3;
const ER_SPIKE_THRESHOLD = 0.5;
/** Below this many rated posts a weekly average is noise, not signal. */
const MIN_POSTS_FOR_ER_SIGNAL = 2;

function compact(n: number): string {
  return Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

/**
 * `now` is required, not defaulted — a defaulted clock is how a pure function
 * quietly becomes time-dependent and a test becomes flaky.
 */
export function computeAlerts(snapshots: SnapshotRow[], posts: PostRow[], now: Date): AccountAlert[] {
  const alerts: AccountAlert[] = [];
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);

  const followerRows: CumulativeRow[] = snapshots
    .filter((s) => typeof s.followers === "number")
    .map((s) => ({ capturedAt: s.capturedAt, value: s.followers as number }));

  const followersNow = latestValue(followerRows, now);
  const followersWeekAgo = latestValue(followerRows, weekAgo);

  if (followersNow !== null && followersWeekAgo !== null) {
    // Highest milestone crossed this week — crossing two at once reports the bigger.
    const crossed = MILESTONES.filter((m) => followersWeekAgo < m && followersNow >= m).pop();
    if (crossed !== undefined) {
      alerts.push({
        kind: "milestone",
        severity: "info",
        code: "followerMilestone",
        params: { milestone: crossed },
        message: `Crossed ${compact(crossed)} followers this week 🎉`,
      });
    }

    const lost = followersWeekAgo - followersNow;
    if (lost > 0 && followersWeekAgo > 0 && lost / followersWeekAgo >= FOLLOWER_DROP_THRESHOLD) {
      alerts.push({
        kind: "drop",
        severity: "warning",
        code: "followerDrop",
        params: { lost, pct: (lost / followersWeekAgo) * 100 },
        message: `Lost ${lost.toLocaleString()} followers in the last 7 days`,
      });
    }
  }

  const erOf = (from: Date, to: Date) => {
    const rates = posts
      .filter((p) => within(p.publishedAt ?? null, from, to))
      .map(postEngagementRate)
      .filter((v): v is number => v !== null);
    return rates.length >= MIN_POSTS_FOR_ER_SIGNAL ? mean(rates) : null;
  };

  const erThisWeek = erOf(weekAgo, now);
  const erLastWeek = erOf(twoWeeksAgo, weekAgo);

  if (erThisWeek !== null && erLastWeek !== null && erLastWeek > 0) {
    const change = (erThisWeek - erLastWeek) / erLastWeek;
    if (change <= ER_DROP_THRESHOLD) {
      const pct = Math.round(Math.abs(change) * 100);
      alerts.push({
        kind: "drop",
        severity: "warning",
        code: "engagementDrop",
        params: { pct },
        message: `Engagement rate down ${pct}% vs last week`,
      });
    } else if (change >= ER_SPIKE_THRESHOLD) {
      const pct = Math.round(change * 100);
      alerts.push({
        kind: "spike",
        severity: "info",
        code: "engagementSpike",
        params: { pct },
        message: `Engagement rate up ${pct}% vs last week 🔥`,
      });
    }
  }

  return alerts;
}
