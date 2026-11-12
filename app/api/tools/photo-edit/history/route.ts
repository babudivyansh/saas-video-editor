import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { resignMediaUrl } from "@/lib/signed-media";

// Photo Edit history, read from the Generation rows the edit route writes
// (toolSlug "photo-edit", result.chainId / sourceAssetId / images). The
// version strip is rebuilt from here after a reload, so it needs no table of
// its own.
//
//   ?chainId=…  every finished edit in one chain, oldest first
//   (none)      the latest edit of each of the user's recent chains

interface StoredResult {
  chainId?: string;
  sourceAssetId?: string;
  images?: { url?: string; assetId?: string | null }[];
  action?: string;
  model?: string;
  prompt?: string;
  resolvedPrompt?: string | null;
}

async function toItem(g: { id: string; createdAt: Date; result: unknown }) {
  const r = (g.result ?? {}) as StoredResult;
  const images = await Promise.all(
    (r.images ?? []).filter((i) => typeof i.url === "string").map(async (i) => ({
      url: (await resignMediaUrl(i.url!)) ?? i.url!,
      assetId: i.assetId ?? null,
    })),
  );
  return {
    id: g.id,
    createdAt: g.createdAt.toISOString(),
    chainId: r.chainId ?? null,
    sourceAssetId: r.sourceAssetId ?? null,
    action: r.action ?? "edit",
    model: r.model ?? null,
    prompt: r.prompt ?? "",
    resolvedPrompt: r.resolvedPrompt ?? null,
    images,
  };
}

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chainId = req.nextUrl.searchParams.get("chainId");
  const where = { userId: auth.userId, toolSlug: "photo-edit", status: "completed" };

  if (chainId) {
    if (!/^[\w-]{8,64}$/.test(chainId)) return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
    const rows = await prisma.generation.findMany({
      where: { ...where, result: { path: ["chainId"], equals: chainId } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, createdAt: true, result: true },
    });
    return NextResponse.json({ items: await Promise.all(rows.map(toItem)) });
  }

  const rows = await prisma.generation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { id: true, createdAt: true, result: true },
  });
  const latestPerChain = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const c = (row.result as StoredResult | null)?.chainId;
    if (c && !latestPerChain.has(c)) latestPerChain.set(c, row);
    if (latestPerChain.size >= 12) break;
  }
  return NextResponse.json({ chains: await Promise.all([...latestPerChain.values()].map(toItem)) });
}

export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "tools:photo-edit:history" });
