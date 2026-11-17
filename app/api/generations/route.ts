import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { usageDisplayName, listCreditCost, netMinutesByRefId } from "@/lib/billing/usage";

// Cursor-paginated generation history — this is what fixes the old "−1 credit"
// display bug (the credits page hardcoded that string regardless of the
// tool's real cost); callers should read `creditsCost`/`status` per row.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
  const cursor = req.nextUrl.searchParams.get("cursor");
  const toolSlug = req.nextUrl.searchParams.get("toolSlug");

  const rows = await prisma.generation.findMany({
    where: { userId: auth.userId, ...(toolSlug ? { toolSlug } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      toolSlug: true,
      modelId: true,
      generationType: true,
      creditsCost: true,
      status: true,
      createdAt: true,
      // Only read to match minute-billed rows to their ledger refId (see
      // logToolGeneration) — never returned, since it can hold a user prompt.
      prompt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // A minute-billed run (Auto Clip) logs creditsCost 0 and its ledger refId,
  // "<toolSlug>:<id>", in `prompt`. Look up what it actually spent in minutes.
  const refIds = page
    .map(g => g.prompt)
    .filter((p, i): p is string => !!p && p.startsWith(`${page[i].toolSlug}:`));
  const minutes = await netMinutesByRefId(auth.userId, refIds);

  const generations = page.map(({ prompt, ...g }) => ({
    ...g,
    displayName: usageDisplayName(g.modelId, g.toolSlug),
    minutesCost: prompt ? minutes.get(prompt) ?? 0 : 0,
    listCreditCost: listCreditCost(g.toolSlug),
  }));

  return NextResponse.json({
    generations,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
