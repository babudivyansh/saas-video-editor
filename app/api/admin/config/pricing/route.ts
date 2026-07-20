import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { getFxConfig, getUsdPriceBook, setFxConfig, setUsdPriceBook, FX_DEFAULTS, USD_PRICE_BOOK_DEFAULTS } from "@/lib/currency";

// Admin-adjustable FX rate + USD price-book overrides (2026-07 audit) — same
// Config-KV pattern as /api/admin/autoclip-pricing and /api/admin/tools.
export const GET = withAdmin(async () => {
  const [fx, priceBook] = await Promise.all([getFxConfig(), getUsdPriceBook()]);
  return NextResponse.json({ fx, priceBook, defaults: { fx: FX_DEFAULTS, priceBook: USD_PRICE_BOOK_DEFAULTS } });
});

const patchSchema = z
  .object({
    fx: z.object({ inrPerUsd: z.number().positive().max(1000) }).partial().optional(),
    priceBook: z.record(z.string(), z.number().int().min(0).max(1_000_000).nullable()).optional(),
  })
  .strict();

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, patchSchema);
  const before = { fx: await getFxConfig(), priceBook: await getUsdPriceBook() };

  const fx = body.fx ? await setFxConfig(body.fx) : before.fx;
  const priceBook = body.priceBook ? await setUsdPriceBook(body.priceBook) : before.priceBook;

  await auditAdminAction(admin.userId, "pricing_config.updated", undefined, {
    before,
    after: { fx, priceBook },
    ip: auditIp(req),
  });

  return NextResponse.json({ fx, priceBook });
});
