import type { NextRequest } from "next/server";
import { listAccounts } from "@/lib/mobile/social";
import { mobileJson, withMobileSubscriber } from "@/lib/mobile/http";
import { withRateLimit } from "@/lib/with-rate-limit";

// GET /api/mobile/v1/social/accounts → { accounts }: connected YouTube,
// Instagram and Facebook accounts with their health (healthy / syncing /
// reconnect). Connecting a new one is Phase 6 (in-app sign-in with the platform).
export const GET = withRateLimit(
  withMobileSubscriber(async (_req: NextRequest, auth) => mobileJson({ accounts: await listAccounts(auth.userId) })),
  { limit: 60, windowSec: 60, keyBy: "user", name: "mobile:social:accounts" },
);
