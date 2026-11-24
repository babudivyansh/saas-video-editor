import { NextResponse } from "next/server";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { subscriptionsQuerySchema } from "@/lib/admin/schemas";
import { listSubscribers, listTrialsFiltered } from "@/lib/admin/subscriptions-admin";
import { BILLING_STATUS_LABEL, TRIAL_OUTCOME_LABEL } from "@/lib/billing/billing-status";
import { csvBody, csvFilename, type CsvRow } from "@/lib/social/csv";

// GET /api/admin/subscriptions/export?<same params as the list> — the current
// Subscriptions view as CSV. Personal data leaving the panel, so rate-limited
// and audited like the Accounts export.

const MAX_ROWS = 10_000;

export const GET = withAdmin(async (req, { admin }) => {
  const limit = await rateLimit(`admin-subscriptions-export:${admin.userId}`, 5, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many exports. Try again in a few minutes." }, { status: 429 });
  }
  const q = parseQuery(req, subscriptionsQuerySchema);
  const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

  let header: string[];
  let rows: CsvRow[];
  if (q.view === "trials") {
    const t = await listTrialsFiltered({ outcome: q.outcome, search: q.search, page: 1, limit: MAX_ROWS });
    header = ["user_id", "email", "name", "subscription_id", "trial_started_at", "trial_ends_at", "outcome", "outcome_at", "detail"];
    rows = t.rows.map((r) => [
      r.userId, r.email, r.name, r.subscriptionId, iso(r.startedAt), iso(r.endsAt),
      TRIAL_OUTCOME_LABEL[r.outcome], iso(r.outcomeAt), r.detail,
    ]);
  } else {
    const s = await listSubscribers({ status: q.status, search: q.search, page: 1, limit: MAX_ROWS });
    header = [
      "user_id", "email", "name", "plan", "billing_status", "recurring", "access_until", "trial_ends_at",
      "cancelled_at", "cancelled_how", "payment_failed_at", "minutes_balance", "credits_balance",
    ];
    rows = s.rows.map((r) => [
      r.id, r.email, r.name, r.plan?.name ?? null, BILLING_STATUS_LABEL[r.billingStatus], r.recurring ? "yes" : "no",
      r.subscriptionEndsAt, r.trialEndsAt, r.cancelledAt,
      r.cancelSource === "external" ? "outside Clipiro (mandate revoked)" : r.cancelDetail ?? (r.cancelSource ? "in Clipiro" : null),
      r.paymentFailedAt, r.minutes, r.credits,
    ]);
  }

  await auditAdminAction(admin.userId, "subscriptions.exported", undefined, {
    after: { view: q.view, rows: rows.length, truncated: rows.length === MAX_ROWS, status: q.status ?? null, outcome: q.outcome ?? null },
    ip: auditIp(req),
  });

  return new NextResponse(csvBody(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(["clipiro", q.view, new Date().toISOString().slice(0, 10)])}"`,
      "Cache-Control": "no-store",
    },
  });
});
