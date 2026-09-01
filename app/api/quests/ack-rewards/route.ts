import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { markRankRewardsSeen } from "@/lib/quest-rewards";

// Called by the dashboard once it has toasted the user's new rank rewards, so
// the same grant is never announced twice.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await markRankRewardsSeen(auth.userId);

  return NextResponse.json({ ok: true });
}
