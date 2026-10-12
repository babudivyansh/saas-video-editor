import type { NextRequest } from "next/server";
import { buildPlans } from "@/lib/mobile/account";
import { mobileJson, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/plans → plans and packs with live USD and INR prices.
// Read-only: buying in the app is Phase 12 (BILLING.md).
export const GET = withMobileAuth(async (_req: NextRequest) => mobileJson(await buildPlans()));
