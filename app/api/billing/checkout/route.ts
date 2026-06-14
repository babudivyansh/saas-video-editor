import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Amount in paise (INR). Adjust pricing or currency to match your Razorpay account.
const PACKS: Record<string, { amount: number; credits: number; name: string }> = {
  pack_starter:   { amount: 79900,  credits: 60,  name: "Starter Pack"  },
  pack_pro:       { amount: 159900, credits: 180, name: "Pro Pack"       },
  pack_studio:    { amount: 399900, credits: 600, name: "Studio Pack"    },
};

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packId } = await req.json();
  const pack = packId ? PACKS[packId] : null;
  if (!pack) return NextResponse.json({ error: "Invalid packId" }, { status: 400 });

  const order = await razorpay.orders.create({
    amount: pack.amount,
    currency: "INR",
    receipt: `order_${auth.userId.slice(0, 8)}_${Date.now()}`,
    notes: { userId: auth.userId, packId, credits: String(pack.credits) },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    packName: pack.name,
    credits: pack.credits,
  });
}
