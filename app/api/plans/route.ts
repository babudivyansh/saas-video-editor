import { NextResponse } from "next/server";
import { getPublicPlans } from "@/lib/plans/public";

// Public: active plans for the pricing page and checkout UI. No auth required.
// See lib/plans/public.ts for the shape (INR + computed USD per plan).
export async function GET() {
  return NextResponse.json({ plans: await getPublicPlans() });
}
