import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStateCode, isValidGstin, isValidPincode } from "@/lib/invoice/gst";

// GET/PUT /api/billing/details — the optional billing details printed on the
// customer's GST tax invoices. Only invoices issued AFTER a save pick up the
// change; issued invoices are immutable snapshots.

const SELECT = {
  billingName: true, billingAddress: true, billingState: true, billingPincode: true, billingGstin: true,
} as const;

/** "" and whitespace clear a field; anything else is trimmed. */
const optional = (max: number) =>
  z.string().max(max).transform((s) => s.trim() || null).nullable().optional();

const schema = z
  .object({
    billingName: optional(120),
    billingAddress: optional(300),
    billingState: optional(2),
    billingPincode: optional(6),
    billingGstin: optional(15).transform((g) => g?.toUpperCase() ?? g),
  })
  .superRefine((d, ctx) => {
    if (d.billingState && !isStateCode(d.billingState)) {
      ctx.addIssue({ code: "custom", path: ["billingState"], message: "Choose a valid state." });
    }
    if (d.billingPincode && !isValidPincode(d.billingPincode)) {
      ctx.addIssue({ code: "custom", path: ["billingPincode"], message: "PIN code must be 6 digits." });
    }
    if (d.billingGstin) {
      if (!isValidGstin(d.billingGstin)) {
        ctx.addIssue({ code: "custom", path: ["billingGstin"], message: "That GSTIN isn't valid — check for a typo." });
      } else if (d.billingState && d.billingGstin.slice(0, 2) !== d.billingState) {
        // The GSTIN's first two digits ARE its state. A mismatch would print a
        // place of supply the customer's own registration contradicts.
        ctx.addIssue({ code: "custom", path: ["billingState"], message: "State doesn't match your GSTIN." });
      }
    }
  });

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const details = await prisma.user.findUnique({ where: { id: auth.userId }, select: SELECT });
  return NextResponse.json({ details });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid billing details", field: issue?.path[0] }, { status: 400 });
  }
  const data = { ...parsed.data };
  // A GSTIN fixes the state; fill it in when the customer left it blank.
  if (data.billingGstin && !data.billingState) data.billingState = data.billingGstin.slice(0, 2);

  const details = await prisma.user.update({ where: { id: auth.userId }, data, select: SELECT });
  return NextResponse.json({ details });
}
