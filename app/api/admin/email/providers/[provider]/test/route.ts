import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rateLimit } from "@/lib/rate-limit";
import { PROVIDERS } from "@/lib/email/router/deliver";
import { probeProvider } from "@/lib/email/router/maintenance";
import { isKnownProvider } from "@/lib/email/router/admin-queries";

// Safe connectivity test: a READ-ONLY call (account / sender / domain lookup)
// that proves the key works and says whether the sender is verified. It sends
// no email and takes no recipient or body — there is deliberately no
// "send a test email to any address" endpoint here.
export const POST = withAdmin<{ provider: string }>(async (req, { admin, params }) => {
  if (!isKnownProvider(params.provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const limit = await rateLimit(`admin:email-test:${admin.userId}`, 20, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checks — try again in a few minutes" }, { status: 429 });

  const r = await probeProvider(PROVIDERS[params.provider]);
  await auditAdminAction(admin.userId, "email_provider.tested", undefined, {
    after: { provider: params.provider, ok: r.ok, code: r.code ?? null },
    ip: auditIp(req),
  });
  return NextResponse.json({
    ok: r.ok,
    senderVerified: r.senderVerified ?? null,
    reportedRemaining: r.reportedRemaining ?? null,
    errorClass: r.errorClass ?? null,
    code: r.code ?? null,
    message: r.message ?? null,
  });
});
