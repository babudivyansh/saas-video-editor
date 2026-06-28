import { NextRequest, NextResponse } from "next/server";
import { refreshStaleAccounts } from "@/lib/social/service";

// Scheduled refresh entrypoint for an external scheduler (cron-job.org, Vercel
// Cron, GitHub Actions, etc.). Protected by a shared secret in the
// Authorization header (`Bearer <SOCIAL_REFRESH_SECRET>`) or `?secret=`.
//
// Example crontab (every 6h):
//   0 */6 * * *  curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh
export async function GET(req: NextRequest) {
  const secret = process.env.SOCIAL_REFRESH_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await refreshStaleAccounts();
  return NextResponse.json({ ok: true, ...result });
}
