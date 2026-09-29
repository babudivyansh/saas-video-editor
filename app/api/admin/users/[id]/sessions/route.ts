import { NextResponse } from "next/server";
import { listSessions } from "@/lib/auth";
import { withAdmin } from "@/lib/admin/api";

// GET /api/admin/users/[id]/sessions — every signed-in device, newest activity
// first (never the token hash). Revoke one with POST .../actions.
export const GET = withAdmin<{ id: string }>(async (_req, { params }) => {
  return NextResponse.json({ sessions: await listSessions(params.id) });
});
