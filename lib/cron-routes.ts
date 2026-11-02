import type { NextRequest } from "next/server";
import type { CronName } from "@/lib/cron-tracking";

// Every /api/cron/* route's GET handler, by route name, loaded on demand.
//
// lib/cron-dispatch.ts runs scheduled jobs by calling these handlers directly
// instead of over HTTP: on Hostinger's managed Node hosting the app does not
// listen on 127.0.0.1:$PORT, so the loopback self-call (PR #390) got
// ECONNREFUSED on every tick and no job ran (Sentry CLIPIRO-WEB-4).
//
// Keyed by CronName, so adding a route to KNOWN_CRON_NAMES without adding it
// here is a type error, not a job that silently never runs.

export type CronRouteHandler = (req: NextRequest) => Promise<Response>;

export const CRON_ROUTES: Record<CronName, () => Promise<{ GET: CronRouteHandler }>> = {
  "refill-credits": () => import("@/app/api/cron/refill-credits/route"),
  "subscription-reminder": () => import("@/app/api/cron/subscription-reminder/route"),
  "review-drip": () => import("@/app/api/cron/review-drip/route"),
  "review-prompts": () => import("@/app/api/cron/review-prompts/route"),
  reengagement: () => import("@/app/api/cron/reengagement/route"),
  onboarding: () => import("@/app/api/cron/onboarding/route"),
  "asset-cleanup": () => import("@/app/api/cron/asset-cleanup/route"),
  "stale-clip-sweep": () => import("@/app/api/cron/stale-clip-sweep/route"),
  "dub-sweep": () => import("@/app/api/cron/dub-sweep/route"),
  "commission-payout": () => import("@/app/api/cron/commission-payout/route"),
  "account-purge": () => import("@/app/api/cron/account-purge/route"),
  "admin-digest": () => import("@/app/api/cron/admin-digest/route"),
  "clip-publish": () => import("@/app/api/cron/clip-publish/route"),
  "social-refresh": () => import("@/app/api/cron/social-refresh/route"),
  "feature-announcements": () => import("@/app/api/cron/feature-announcements/route"),
  "mrr-snapshot": () => import("@/app/api/cron/mrr-snapshot/route"),
  "voice-library-sync": () => import("@/app/api/cron/voice-library-sync/route"),
};
