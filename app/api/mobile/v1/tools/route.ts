import type { NextRequest } from "next/server";
import { buildTools } from "@/lib/mobile/account";
import { mobileJson, withMobileAuth } from "@/lib/mobile/http";

// GET /api/mobile/v1/tools → { tools }: the app's tool list with live prices
// and plan locks; tools an admin switched off are left out.
export const GET = withMobileAuth(async (_req: NextRequest) => mobileJson({ tools: await buildTools() }));
