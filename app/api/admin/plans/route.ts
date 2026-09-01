import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { planCreateSchema, validatePlanShape } from "@/lib/admin/schemas";

export const GET = withAdmin(async () => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ plans });
});

export const POST = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, planCreateSchema);

  const exists = await prisma.plan.findUnique({ where: { slug: body.slug } });
  if (exists) return NextResponse.json({ error: "A plan with that slug already exists" }, { status: 409 });

  const shapeError = validatePlanShape({
    kind: body.kind ?? "pack",
    intervalMonths: body.intervalMonths ?? null,
    monthlyCredits: body.monthlyCredits ?? null,
    credits: body.credits,
    tier: body.tier ?? null,
  });
  if (shapeError) return NextResponse.json({ error: shapeError }, { status: 400 });

  const plan = await prisma.plan.create({
    data: {
      slug: body.slug,
      name: body.name,
      priceInPaise: body.priceInPaise,
      credits: body.credits,
      currency: body.currency ?? "INR",
      features: body.features ?? [],
      active: body.active ?? true,
      sortOrder: body.sortOrder ?? 0,
      kind: body.kind ?? "pack",
      intervalMonths: body.intervalMonths ?? null,
      monthlyCredits: body.monthlyCredits ?? null,
      tier: body.tier ?? null,
    },
  });

  await auditAdminAction(admin.userId, "plan.created", plan.id, { after: plan, ip: auditIp(req) });

  return NextResponse.json({ plan }, { status: 201 });
});
