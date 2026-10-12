import type { NextRequest } from "next/server";
import { PROVIDERS, type Provider } from "@clipiro/shared";
import { listAccounts } from "@/lib/mobile/social";
import { mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { availableProviders } from "@/lib/social/providers";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/social/accounts → { accounts, connectable }: connected
// YouTube, Instagram and Facebook accounts with their health (healthy /
// syncing / reconnect), and the platforms that can be connected right now
// (their OAuth app is set up on this server).
export const GET = withRateLimit(
  withMobileSubscriber(async (_req: NextRequest, auth) => {
    const ready = new Set<string>(availableProviders());
    const connectable = PROVIDERS.filter((p): p is Provider => ready.has(p));
    return mobileJson({ accounts: await listAccounts(auth.userId), connectable });
  }),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:accounts" },
);
