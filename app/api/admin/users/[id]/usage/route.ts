import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { getUserUsage } from "@/lib/admin/user-usage";

// GET /api/admin/users/:id/usage?range=7|30|90|all
// What this account consumed per feature — credits AND Clip Minutes, net of
// refunds (lib/admin/user-usage.ts). Read-only; the detail page's own
// user.viewed audit already covers opening the account.
const RANGES: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, all: null };

export const GET = withAdmin<{ id: string }>(async (req, { params }) => {
  const range = new URL(req.url).searchParams.get("range") ?? "30";
  if (!(range in RANGES)) {
    return NextResponse.json({ error: "range must be 7, 30, 90 or all" }, { status: 400 });
  }
  return NextResponse.json(await getUserUsage(params.id, RANGES[range]));
});
