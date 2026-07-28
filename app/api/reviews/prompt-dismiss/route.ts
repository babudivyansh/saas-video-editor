import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { recordDismiss } from "@/lib/reviews/prompt-triggers";

const bodySchema = z.object({ permanent: z.boolean().optional() }).strict();

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  await recordDismiss(auth.userId, parsed.data.permanent ?? false);
  return NextResponse.json({ success: true });
}
