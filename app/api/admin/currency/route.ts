import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { currencyConfigSchema } from "@/lib/admin/schemas";
import { getFxConfig, getUsdPriceBook, setFxConfig, setUsdPriceBook } from "@/lib/currency";

// USD pricing had no admin surface at all. lib/currency.ts's setFxConfig and
// setUsdPriceBook existed and were unit-tested, but nothing in the app ever
// called them — so INR prices were editable at runtime in /admin/pricing while
// the USD prices every non-Indian customer actually pays were effectively
// hardcoded in source, and the FX rate behind the non-anchored SKUs (the credit
// packs) could only be changed by a deploy.

export const GET = withAdmin(async () => {
  const [fx, priceBook, plans] = await Promise.all([
    getFxConfig(),
    getUsdPriceBook(),
    prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, priceInPaise: true, kind: true },
    }),
  ]);

  // Show what each plan actually resolves to, and how: an explicit price-book
  // override, or an FX conversion rounded to .99. Without this an admin editing
  // the FX rate can't tell which plans it even affects.
  const resolved = plans.map((p) => ({
    ...p,
    usdPriceInCents: priceBook[p.slug] ?? Math.max(Math.round(p.priceInPaise / 100 / fx.inrPerUsd), 1) * 100 - 1,
    source: priceBook[p.slug] != null ? ("price_book" as const) : ("fx" as const),
  }));

  return NextResponse.json({ fx, priceBook, plans: resolved });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, currencyConfigSchema);

  const before = { fx: await getFxConfig(), priceBook: await getUsdPriceBook() };

  if (body.inrPerUsd !== undefined) {
    await setFxConfig({ inrPerUsd: body.inrPerUsd });
  }
  if (body.priceBook) {
    await setUsdPriceBook(body.priceBook);
  }

  const after = { fx: await getFxConfig(), priceBook: await getUsdPriceBook() };

  await auditAdminAction(admin.userId, "currency.updated", undefined, {
    before, after, ip: auditIp(req),
  });

  // NOTE: this changes what NEW checkouts are quoted and charged in USD. It does
  // NOT touch a plan's existing Razorpay Plan — those are immutable and priced at
  // creation — so after changing a USD price, re-sync the affected plans from
  // /admin/pricing or the recurring flow keeps charging the old amount.
  return NextResponse.json({ ...after, resyncRequired: body.priceBook != null || body.inrPerUsd !== undefined });
});
