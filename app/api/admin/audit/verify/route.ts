import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAuditChain } from "@/lib/admin/audit-verify";

// GET /api/admin/audit/verify — re-checks every hashed audit row and the links
// between them (lib/admin/audit-verify.ts). Read-only; reads the whole chain,
// so it is rate-limited.
export const GET = withAdmin(async (_req, { admin }) => {
  const { allowed } = await rateLimit(`admin-audit-verify:${admin.userId}`, 20, 600);
  if (!allowed) return NextResponse.json({ error: "Too many checks — wait a few minutes" }, { status: 429 });
  return NextResponse.json(await verifyAuditChain());
});
