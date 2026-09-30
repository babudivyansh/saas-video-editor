// Response shapes of /api/admin/audit, /stats, /verify and /[id] (see lib/admin/audit-query.ts).

export type AuditCategory = "accounts" | "billing" | "security" | "content" | "operations" | "config" | "reviews" | "affiliates" | "social";
export type AuditSeverity = "critical" | "destructive" | "money" | "security" | "change" | "view";

export interface AuditEvent {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  description: string;
  category: AuditCategory;
  severity: AuditSeverity;
  expectsReason: boolean;
  missingReason: boolean;
  actor: { id: string; email: string | null; type: "admin" | "user" | "system" };
  target: { id: string; type: string; label: string; href: string | null; deleted: boolean } | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  before: unknown;
  after: unknown;
  integrity: "verified" | "tampered" | "legacy";
}

export interface AuditStats {
  from: string;
  to: string | null;
  total: number;
  truncated: boolean;
  days: Array<{ day: string } & Partial<Record<AuditCategory, number>>>;
  bySeverity: Partial<Record<AuditSeverity, number>>;
  byCategory: Partial<Record<AuditCategory, number>>;
  topActions: Array<{ action: string; label: string; count: number }>;
  topActors: Array<{ id: string; email: string; type: string; count: number; lastAt: string }>;
  missingReason: number;
}

export interface AuditVerifyResult {
  ok: boolean;
  checkedAt: string;
  totalRows: number;
  legacyRows: number;
  verifiedRows: number;
  chainStartedAt: string | null;
  head: { id: string; createdAt: string } | null;
  tampered: Array<{ id: string; action: string; createdAt: string }>;
  broken: Array<{ id: string; action: string; createdAt: string; problem: string }>;
  headMissing: boolean;
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

export const SEVERITY_TONE = {
  critical: "error",
  destructive: "warning",
  money: "primary",
  security: "info",
  change: "neutral",
  view: "neutral",
} as const;

export interface AuditFilterState {
  q: string;
  category: string;
  severity: string;
  actorType: string;
  adminEmail: string;
  targetId: string;
  targetType: string;
  /** "Done to" — the target account's email. */
  targetEmail: string;
  missingReason: boolean;
  range: "24h" | "7d" | "30d" | "90d" | "all" | "custom";
  from: string; // yyyy-mm-dd, custom range only
  to: string;
}

export const EMPTY_FILTERS: AuditFilterState = {
  q: "", category: "", severity: "", actorType: "", adminEmail: "", targetId: "", targetType: "", targetEmail: "", missingReason: false, range: "30d", from: "", to: "",
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
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

const RANGE_LABEL: Record<AuditFilterState["range"], string> = {
  "24h": "the last 24 hours", "7d": "the last 7 days", "30d": "the last 30 days", "90d": "the last 90 days", all: "all time", custom: "the chosen dates",
};

/** The active filters in words — for the empty state ("no … matching …"). */
export function describeFilters(f: AuditFilterState): string[] {
  const out: string[] = [];
  if (f.q) out.push(`search “${f.q}”`);
  if (f.category) out.push(`category ${CATEGORY_LABEL[f.category as AuditCategory] ?? f.category}`);
  if (f.severity) out.push(`severity ${SEVERITY_LABEL[f.severity as AuditSeverity] ?? f.severity}`);
  if (f.targetType) out.push(`target ${TARGET_TYPE_LABEL[f.targetType] ?? f.targetType}`);
  if (f.actorType) out.push(`${f.actorType} actions only`);
  if (f.adminEmail) out.push(`done by “${f.adminEmail}”`);
  if (f.targetEmail) out.push(`done to “${f.targetEmail}”`);
  if (f.targetId) out.push("one target");
  if (f.missingReason) out.push("missing a reason");
  out.push(`in ${RANGE_LABEL[f.range]}`);
  return out;
}

/** Filter state → API query params. Dates go as ISO instants in the admin's own timezone. */
export function toParams(f: AuditFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.severity) p.set("severity", f.severity);
  if (f.actorType) p.set("actorType", f.actorType);
  if (f.adminEmail) p.set("adminEmail", f.adminEmail);
  if (f.targetId) p.set("targetId", f.targetId);
  if (f.targetType) p.set("targetType", f.targetType);
  if (f.targetEmail) p.set("targetEmail", f.targetEmail);
  if (f.missingReason) p.set("missingReason", "1");
  const hours = { "24h": 24, "7d": 168, "30d": 720, "90d": 2160 }[f.range as "24h"];
  if (hours) p.set("from", new Date(Date.now() - hours * 3600_000).toISOString());
  if (f.range === "custom") {
    if (f.from) p.set("from", new Date(`${f.from}T00:00:00`).toISOString());
    if (f.to) p.set("to", new Date(`${f.to}T23:59:59.999`).toISOString());
  }
  if (f.range === "all") p.set("from", "2000-01-01T00:00:00.000Z");
  p.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  return p;
}
