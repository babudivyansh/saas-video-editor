import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { getEmailMessageDetail } from "@/lib/email/router/admin-queries";

// One message's sanitized timeline: attempts (provider, outcome, sanitized
// error) and delivery webhooks. Never the body, payload, or idempotency key.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const detail = await getEmailMessageDetail(params.id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
});
