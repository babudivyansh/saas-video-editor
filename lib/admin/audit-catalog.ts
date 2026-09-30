// What every audit action MEANS — so the Audit Log can say "Deleted account
// pat@x.com" instead of `user.deleted 8339d930-…`, colour by real severity
// instead of guessing from the word "delete", and filter by category.
//
// lib/admin/audit-catalog.test.ts scans the codebase and fails when an action
// is written that isn't described here. Unknown actions (old rows from actions
// that no longer exist) still render through the fallback.

export type AuditCategory =
  | "accounts" | "billing" | "security" | "content" | "operations"
  | "config" | "reviews" | "affiliates" | "social";

/**
 * critical    — irreversible or platform-wide (hard delete, log everyone out, maintenance)
 * destructive — removes or disables something (suspend, delete a review, drain a queue)
 * money       — changes what someone pays or holds (credits, refunds, plans, payouts)
 * security    — authentication / access (2FA, sessions, elevation, sign-ins)
 * change      — an ordinary edit
 * view        — reading personal data (no change)
 */
export type AuditSeverity = "critical" | "destructive" | "money" | "security" | "change" | "view";

export type AuditTargetType =
  | "user" | "coupon" | "plan" | "review" | "affiliate" | "announcement" | "project"
  | "asset" | "purchase" | "commission" | "social_account" | "cron" | "queue_job"
  | "flag" | "tool" | "model" | "none";

export interface AuditActionInfo {
  /** Past-tense phrase that reads before the target: "Deleted account". */
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType: AuditTargetType;
  description: string;
  /** A reason is expected; the viewer flags rows that don't have one. */
  expectsReason?: boolean;
}

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  accounts: "Accounts",
  billing: "Billing",
  security: "Security",
  content: "Content",
  operations: "Operations",
  config: "Configuration",
  reviews: "Reviews",
  affiliates: "Affiliates",
  social: "Social",
};

export const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  critical: "Critical",
  destructive: "Destructive",
  money: "Money",
  security: "Security",
  change: "Change",
  view: "View",
};

type Row = [label: string, category: AuditCategory, severity: AuditSeverity, targetType: AuditTargetType, description: string, expectsReason?: boolean];

const EXACT: Record<string, Row> = {
  // ── Security ──
  "admin.signed_in": ["Admin signed in", "security", "security", "none", "An admin account signed in."],
  "admin.elevation_code_sent": ["Requested an admin verification code", "security", "security", "none", "An emailed code was requested to unlock the admin panel."],
  "admin.elevated": ["Unlocked the admin panel", "security", "security", "none", "The emailed code was entered correctly; this session can use admin tools for 8 hours."],
  "admin.elevation_failed": ["Failed admin verification", "security", "security", "none", "A wrong or expired code was entered, or too many attempts were made. Repeated failures can mean someone else is trying to get in."],
  "admin.elevation_required": ["Tried admin tools without verification", "security", "security", "none", "An admin session called an admin API before entering the emailed code."],
  "sessions.revoked_all_non_admin": ["Signed out every user", "security", "critical", "none", "Every non-admin session on the platform was revoked."],

  // ── Accounts ──
  "user.viewed": ["Viewed account", "accounts", "view", "user", "Opened this account's admin page (personal data)."],
  "user.updated": ["Edited account", "accounts", "change", "user", "Changed account fields — name, email, role, plan or subscription dates."],
  "user.notes_updated": ["Updated admin notes on", "accounts", "change", "user", "Changed the internal support notes."],
  "user.suspended": ["Suspended account", "accounts", "destructive", "user", "Sign-in was blocked and all sessions revoked.", true],
  "user.unsuspended": ["Unsuspended account", "accounts", "change", "user", "Sign-in was allowed again."],
  "user.sessions_revoked": ["Signed out account", "security", "security", "user", "Every session for this account was revoked."],
  "user.revoke_session": ["Signed out a device on", "security", "security", "user", "One signed-in device was revoked."],
  "user.reset_2fa": ["Reset two-factor on", "security", "critical", "user", "Two-factor authentication was turned off and recovery codes deleted.", true],
  "user.mark_email_verified": ["Marked email verified for", "security", "security", "user", "The email was treated as verified without a code.", true],
  "user.resend_verification": ["Resent verification code to", "accounts", "change", "user", "A new email-verification code was sent."],
  "user.send_password_reset": ["Sent a password reset to", "security", "security", "user", "A password-reset link was emailed."],
  "user.cancel_subscription": ["Cancelled renewal for", "billing", "money", "user", "Auto-renewal was stopped; access runs to the end of the period.", true],
  "user.hard_delete": ["Deleted account", "accounts", "critical", "user", "The account, its content and stored files were permanently deleted.", true],
  "user.deleted": ["Deleted account", "accounts", "critical", "user", "The account was permanently deleted.", true],
  "user.data_exported": ["Exported data of", "accounts", "view", "user", "A download of all data held about this account was built.", true],
  "user.data_export_downloaded": ["Downloaded data export of", "accounts", "view", "user", "The download link to this account's data export was handed out."],
  "user.bulk_suspend": ["Suspended accounts in bulk", "accounts", "destructive", "none", "Several accounts were suspended at once.", true],
  "user.bulk_unsuspend": ["Unsuspended accounts in bulk", "accounts", "change", "none", "Several accounts were unsuspended at once.", true],
  "user.bulk_revoke_sessions": ["Signed out accounts in bulk", "security", "security", "none", "Several accounts were signed out everywhere.", true],

  // ── Billing ──
  "credits.granted": ["Granted credits to", "billing", "money", "user", "Credits were added to this account.", true],
  "credits.deducted": ["Removed credits from", "billing", "money", "user", "Credits were taken off this account.", true],
  "minutes.granted": ["Granted Clip Minutes to", "billing", "money", "user", "Clip Minutes were added.", true],
  "minutes.deducted": ["Removed Clip Minutes from", "billing", "money", "user", "Clip Minutes were taken off.", true],
  "purchase.refunded": ["Refunded purchase", "billing", "money", "purchase", "The purchase was marked refunded (and credits clawed back if chosen).", true],
  "subscription.manual_refill": ["Refilled subscription credits for", "billing", "money", "user", "The monthly credit refill was run by hand."],
  "subscription.extended": ["Extended subscription of", "billing", "money", "user", "The subscription end date was moved later."],
  "subscription.expired": ["Expired subscription of", "billing", "destructive", "user", "The subscription was ended now."],
  "plan.created": ["Created plan", "billing", "money", "plan", "A new plan or credit pack was added."],
  "plan.updated": ["Edited plan", "billing", "money", "plan", "Price, credits or plan settings changed."],
  "plan.deactivated": ["Deactivated plan", "billing", "destructive", "plan", "The plan can no longer be bought."],
  "plan.razorpay_synced": ["Synced plan to Razorpay", "billing", "change", "plan", "The plan was created or updated at Razorpay."],
  "coupon.created": ["Created coupon", "billing", "money", "coupon", "A new discount code was added."],
  "coupon.updated": ["Edited coupon", "billing", "money", "coupon", "Discount, limits or dates changed."],
  "coupon.deactivated": ["Deactivated coupon", "billing", "destructive", "coupon", "The code no longer works."],
  "currency.updated": ["Changed currency settings", "config", "money", "none", "Exchange rate or USD price book changed."],
  "autoclip_pricing.updated": ["Changed AutoClip pricing", "config", "money", "none", "The per-minute AutoClip price changed."],

  // ── Affiliates ──
  "affiliate.updated": ["Edited affiliate", "affiliates", "change", "affiliate", "Status or commission rate changed."],
  "affiliate.paid": ["Paid out affiliate", "affiliates", "money", "affiliate", "Available commissions were marked paid."],
  "affiliate.payout_requested": ["Requested an affiliate payout", "affiliates", "money", "affiliate", "The affiliate asked to be paid their available balance."],
  "commission.released": ["Released commission", "affiliates", "money", "commission", "A pending commission became available for payout."],
  "commission.rejected": ["Rejected commission", "affiliates", "destructive", "commission", "A commission was cancelled.", true],
  "commission.payout_sweep_run": ["Ran the commission payout sweep", "affiliates", "money", "none", "Commissions past their hold were released."],

  // ── Content ──
  "content.project_deleted": ["Deleted projects of", "content", "critical", "user", "Projects, their clips and stored files were permanently deleted.", true],
  "content.asset_deleted": ["Deleted library files of", "content", "critical", "user", "Library assets and their stored files were permanently deleted.", true],
  "asset.moderation_approve": ["Approved flagged asset", "content", "change", "asset", "A moderation-flagged asset was returned to its owner.", true],
  "asset.moderation_remove": ["Removed flagged asset", "content", "destructive", "asset", "A moderation-flagged asset was deleted with its file.", true],
  "storage.orphans_previewed": ["Previewed orphaned-upload cleanup", "content", "view", "none", "Counted what the orphaned-upload sweep would remove."],
  "storage.orphans_run": ["Cleaned up orphaned uploads", "content", "destructive", "none", "Orphaned S3 uploads were deleted.", true],
  "storage.retention_previewed": ["Previewed archive clean-up", "content", "view", "none", "Counted archived assets past retention."],
  "storage.retention_run": ["Purged expired archives", "content", "critical", "none", "Archived assets past retention were permanently deleted.", true],
  "project.empty_draft_sweep_run": ["Ran the empty-draft clean-up", "content", "destructive", "user", "Empty draft projects were counted or deleted."],
  "announcement.created": ["Created announcement", "content", "change", "announcement", "A feature announcement draft was added."],
  "announcement.updated": ["Edited announcement", "content", "change", "announcement", "An announcement was changed."],
  "announcement.published": ["Published announcement", "content", "change", "announcement", "The announcement will be emailed to users."],
  "announcement.deleted": ["Deleted announcement", "content", "destructive", "announcement", "An announcement was removed."],

  // ── Reviews ──
  "review.approved": ["Approved review", "reviews", "change", "review", "The review is now public."],
  "review.rejected": ["Rejected review", "reviews", "destructive", "review", "The review won't be published.", true],
  "review.hidden": ["Hid review", "reviews", "destructive", "review", "The review was taken off the public page."],
  "review.unhidden": ["Unhid review", "reviews", "change", "review", "The review went back to pending."],
  "review.pinned": ["Pinned review", "reviews", "change", "review", "The review is featured at the top."],
  "review.unpinned": ["Unpinned review", "reviews", "change", "review", "The review is no longer featured."],
  "review.edited": ["Edited review", "reviews", "change", "review", "The review's text or rating was changed."],
  "review.deleted": ["Deleted review", "reviews", "destructive", "review", "The review was permanently deleted."],
  "review.reply_created": ["Replied to review", "reviews", "change", "review", "A public reply was added."],
  "review.reply_updated": ["Edited reply on review", "reviews", "change", "review", "The public reply was changed."],
  "review.reply_deleted": ["Deleted reply on review", "reviews", "destructive", "review", "The public reply was removed."],
  "review.report_resolved": ["Resolved a report on review", "reviews", "change", "review", "A user report was acted on."],
  "review.report_dismissed": ["Dismissed a report on review", "reviews", "change", "review", "A user report was dismissed."],
  "review.settings_updated": ["Changed review settings", "config", "change", "none", "Review-system settings changed."],

  // ── Operations ──
  "cron.run_manual": ["Ran scheduled job", "operations", "change", "cron", "A scheduled job was run by hand."],
  "cron.paused": ["Paused scheduled job", "operations", "destructive", "cron", "The scheduler will skip this job until resumed.", true],
  "cron.resumed": ["Resumed scheduled job", "operations", "change", "cron", "The job runs on schedule again."],
  "maintenance.enabled": ["Turned maintenance mode ON", "operations", "critical", "none", "All non-admin traffic was blocked with a 503."],
  "maintenance.disabled": ["Turned maintenance mode off", "operations", "change", "none", "Normal traffic was restored."],
  "clip.stale_sweep_run": ["Ran the stale AutoClip sweep", "operations", "change", "none", "Stuck clips were failed and refunded."],
  "clip.dub_sweep_run": ["Ran the dub sweep", "operations", "change", "none", "Pending dubbing jobs were checked."],
  "render.diagnostics_reproduce": ["Reproduced a render for diagnosis on", "operations", "change", "project", "A failed render was re-run in diagnostic mode."],
  "render_job.retry": ["Retried render job", "operations", "change", "queue_job", "A failed job was re-queued."],
  "render_job.remove": ["Removed render job", "operations", "destructive", "queue_job", "A failed job was discarded."],

  // ── Configuration ──
  "feature_flag.updated": ["Changed feature flag", "config", "change", "flag", "A feature flag was switched, added or deleted."],
  "tool.updated": ["Changed tool settings for", "config", "change", "tool", "Tool availability or cost changed."],
  "model.override_updated": ["Changed AI model settings for", "config", "money", "model", "Model availability or credit cost changed."],
  "autoclip_calibration.toggled": ["Toggled AutoClip calibration", "config", "change", "none", "Automatic virality-weight calibration was switched."],
  "autoclip_calibration.recalibrated": ["Recalibrated AutoClip virality weights", "config", "change", "none", "Scoring weights were recomputed from engagement."],

  // ── Social ──
  "social.connect": ["Connected a social account", "social", "security", "social_account", "The user linked a social account (OAuth tokens stored encrypted)."],
  "social.disconnect": ["Disconnected a social account", "social", "security", "social_account", "The user unlinked a social account."],
  "social.refresh": ["Refreshed a social account", "social", "change", "social_account", "The user refreshed a social account's data."],
  "social.revoked": ["Lost access to a social account", "social", "security", "social_account", "The provider reported the connection was revoked; the account must be reconnected."],
  "social.needs_reauth": ["Social account needs reconnecting", "social", "security", "social_account", "The provider rejected the stored token; the owner has to sign in to it again."],
};

// Actions built from a variable (queue.<action>) — matched by prefix.
const PATTERNS: Array<{ prefix: string; row: (rest: string) => Row }> = [
  {
    prefix: "queue.",
    row: (rest) => {
      const destructive = rest === "drain-waiting" || rest === "clean-failed" || rest === "remove";
      const words: Record<string, string> = {
        retry: "Retried queue job", remove: "Removed queue job", "retry-all-failed": "Retried all failed jobs on",
        "clean-failed": "Cleared failed jobs on", "clean-completed": "Cleared completed jobs on",
        pause: "Paused queue", resume: "Resumed queue", "drain-waiting": "Drained waiting jobs on",
      };
      return [words[rest] ?? `Queue action ${rest} on`, "operations", destructive ? "destructive" : "change", "queue_job", "A render-queue action from the Queues tab.", rest === "drain-waiting" || rest === "clean-failed"];
    },
  },
];

function humanize(action: string): string {
  const [, verb = action] = action.split(".");
  const s = verb.replace(/[_-]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PREFIX_CATEGORY: Record<string, AuditCategory> = {
  user: "accounts", admin: "security", sessions: "security", credits: "billing", minutes: "billing",
  purchase: "billing", subscription: "billing", plan: "billing", coupon: "billing", affiliate: "affiliates",
  commission: "affiliates", content: "content", asset: "content", storage: "content", review: "reviews",
  cron: "operations", queue: "operations", render: "operations", clip: "operations", social: "social",
};

export function describeAction(action: string): AuditActionInfo {
  const exact = EXACT[action];
  const pattern = exact ? null : PATTERNS.find((p) => action.startsWith(p.prefix));
  const row = exact ?? pattern?.row(action.slice(pattern.prefix.length));
  if (row) {
    const [label, category, severity, targetType, description, expectsReason] = row;
    return { label, category, severity, targetType, description, expectsReason: !!expectsReason };
  }
  // Unknown (an action from an older version): still readable.
  const prefix = action.split(".")[0];
  return {
    label: humanize(action),
    category: PREFIX_CATEGORY[prefix] ?? "config",
    severity: /delete|remove|purge|revok|suspend/.test(action) ? "destructive" : "change",
    targetType: prefix === "user" ? "user" : "none",
    description: `Recorded as “${action}”.`,
  };
}

/** Whether the catalogue knows this action (exactly or by pattern). */
export function isCataloguedAction(action: string): boolean {
  return action in EXACT || PATTERNS.some((p) => action.startsWith(p.prefix));
}

/** Whether a dynamic `prefix${...}` action family is covered. */
export function isCataloguedPrefix(prefix: string): boolean {
  return PATTERNS.some((p) => p.prefix === prefix) || Object.keys(EXACT).some((a) => a.startsWith(prefix));
}

/** Every exact action in a category — for the category filter. */
export function actionsInCategory(category: AuditCategory): string[] {
  return Object.entries(EXACT).filter(([, r]) => r[1] === category).map(([a]) => a);
}

export function actionsWithSeverity(severity: AuditSeverity): string[] {
  return Object.entries(EXACT).filter(([, r]) => r[2] === severity).map(([a]) => a);
}

/** Every exact action whose target is this kind of thing — for the target-type filter. */
export function actionsWithTargetType(targetType: AuditTargetType): string[] {
  return Object.entries(EXACT).filter(([, r]) => r[3] === targetType).map(([a]) => a);
}

export function patternPrefixesIn(filter: { category?: AuditCategory; severity?: AuditSeverity; targetType?: AuditTargetType }): string[] {
  return PATTERNS.filter((p) => {
    const sample = p.row("retry");
    return (
      (!filter.category || sample[1] === filter.category) &&
      (!filter.severity || sample[2] === filter.severity) &&
      (!filter.targetType || sample[3] === filter.targetType)
    );
  }).map((p) => p.prefix);
}

export const TARGET_TYPE_LABEL: Record<Exclude<AuditTargetType, "none">, string> = {
  user: "Accounts",
  coupon: "Coupons",
  plan: "Plans",
  review: "Reviews",
  affiliate: "Affiliates",
  announcement: "Announcements",
  project: "Projects",
  asset: "Library assets",
  purchase: "Purchases",
  commission: "Commissions",
  social_account: "Social accounts",
  cron: "Scheduled jobs",
  queue_job: "Queue jobs",
  flag: "Feature flags",
  tool: "Tools",
  model: "AI models",
};

export function actionsExpectingReason(): string[] {
  return Object.entries(EXACT).filter(([, r]) => r[5]).map(([a]) => a);
}
