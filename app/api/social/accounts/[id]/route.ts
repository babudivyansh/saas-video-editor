import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { invalidateAccount } from "@/lib/social/cache";
import { timezoneSchema } from "@/lib/social/schemas";
import { refreshAccount, disconnect } from "@/lib/social/service";

/** Settable account settings. `timezone` is validated against the runtime's own
 *  IANA list by timezoneSchema, so a typo fails here rather than at render. */
const accountPatchSchema = z.object({ timezone: timezoneSchema });

// A manual re-sync burns provider quota (YouTube: ~1 unit/call against a 10k/day
// app-wide budget), so allow one per account per window; the scheduled refresh
// keeps data ≤12h stale regardless.
const REFRESH_WINDOW_SECONDS = 600;

// POST = manually re-sync this account's analytics (subscriber-gated).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const { id } = await params;
  const { allowed } = await rateLimit(`social:refresh:${auth.userId}:${id}`, 1, REFRESH_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json(
      { error: "This account was refreshed recently. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(REFRESH_WINDOW_SECONDS) } },
    );
  }
  try {
    const ok = await refreshAccount(auth.userId, id);
    if (!ok) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

// PATCH = update this account's settings. Only the timezone so far.
//
// SocialAccount.timezone has existed since v2 and nothing ever wrote it, so it
// was null for every account and every time-of-day view silently fell back to
// UTC — including "Best time to post", whose entire job is telling you which
// hour to publish in. A recommendation in the wrong zone is worse than none.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = accountPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Scoped to the owner in the same statement as the write: a bare update by id
  // would let anyone with an account id retimezone someone else's channel.
  const { count } = await prisma.socialAccount.updateMany({
    where: { id, userId: auth.userId },
    data: { timezone: parsed.data.timezone },
  });
  if (count === 0) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Analytics payloads are bucketed by this zone, so every cached derivation for
  // the account is now wrong.
  await invalidateAccount(id, auth.userId);

  return NextResponse.json({ success: true });
}

// DELETE = disconnect (revoke + wipe tokens). Allowed for the owner regardless of
// subscription state — users can always remove their linked data.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await disconnect(auth.userId, id);
  if (!ok) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
