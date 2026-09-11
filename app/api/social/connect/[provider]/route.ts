import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/social/service";
import { availableProviders } from "@/lib/social/providers";
import type { ProviderId } from "@/lib/social/types";
import { withRateLimit } from "@/lib/with-rate-limit";

// Returns the provider's OAuth authorize URL for the (subscribed) caller to
// redirect to. Subscriber-gated — Social Tracker is a paid feature.
async function handleGET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const { provider } = await params;
  if (!availableProviders().includes(provider as ProviderId)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  try {
    const url = await buildAuthUrl(auth.userId, provider as ProviderId);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// Rate limited, which it was not. Each call mints a signed state JWT and writes
// a PKCE verifier into Redis under a 10-minute TTL, so an unbounded caller can
// fill Redis with pending verifiers without ever completing a single OAuth
// flow. Generous enough that a user retrying a flaky provider redirect never
// notices.
export const GET = withRateLimit(handleGET, {
  limit: 20,
  windowSec: 600,
  keyBy: "user",
  name: "social:connect",
});
