// The audience shape, client-safe (no prisma): the campaign editor imports it.
// The option lists mirror lib/admin/user-filters.ts, which can't be imported
// here because it pulls in prisma; audience.test.ts fails if they drift.

import { z } from "zod";

export const PLAN_FILTERS = ["all", "free", "paid"] as const;
export const AUDIENCE_JOURNEYS = ["never_ran", "stuck", "ran", "paid", "free_after_run"] as const;
export const AUDIENCE_JOINED = ["1d", "7d", "30d", "90d"] as const;
export const AUDIENCE_ACTIVE = ["7d", "inactive_30d"] as const;
export const AUDIENCE_METHODS = ["google", "email"] as const;

export const campaignAudienceSchema = z
  .object({
    plan: z.enum(PLAN_FILTERS).default("all"),
    journey: z.enum(AUDIENCE_JOURNEYS).optional(),
    joined: z.enum(AUDIENCE_JOINED).optional(),
    active: z.enum(AUDIENCE_ACTIVE).optional(),
    method: z.enum(AUDIENCE_METHODS).optional(),
  })
  .strict();

export type CampaignAudience = z.infer<typeof campaignAudienceSchema>;

/** Labels for the editor and the campaign list. */
export const AUDIENCE_LABELS = {
  plan: { all: "Everyone", free: "Free users", paid: "Paying subscribers" },
  journey: {
    never_ran: "Never ran AutoClip",
    stuck: "Signed up 1d+ ago, never ran AutoClip",
    ran: "Ran AutoClip",
    paid: "Paid at least once",
    free_after_run: "Ran AutoClip, never paid",
  },
  joined: { "1d": "Joined last 24h", "7d": "Joined last 7 days", "30d": "Joined last 30 days", "90d": "Joined last 90 days" },
  active: { "7d": "Logged in last 7 days", inactive_30d: "No login for 30+ days" },
  method: { google: "Signed up with Google", email: "Signed up with email" },
} as const;

/** "Free users · Ran AutoClip, never paid" */
export function describeAudience(a: CampaignAudience): string {
  const parts: string[] = [AUDIENCE_LABELS.plan[a.plan]];
  if (a.journey) parts.push(AUDIENCE_LABELS.journey[a.journey]);
  if (a.joined) parts.push(AUDIENCE_LABELS.joined[a.joined]);
  if (a.active) parts.push(AUDIENCE_LABELS.active[a.active]);
  if (a.method) parts.push(AUDIENCE_LABELS.method[a.method]);
  return parts.join(" · ");
}
