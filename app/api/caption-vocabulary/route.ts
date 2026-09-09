import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, parseBody } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { sanitizeDictionary } from "@/lib/captions/providers/submagic/SubmagicAdapter";

// The user's reusable caption vocabulary (§13) — proper nouns and jargon the
// speech model reliably mis-hears ("Clipiro", "Razorpay", "Next.js").
//
// Account-level rather than per-clip on purpose: the same handful of terms is
// wrong on every single clip a given creator makes, so re-entering them per
// render would be busywork that people simply wouldn't do.

const bodySchema = z
  .object({
    // Bounds mirror the provider cap enforced in sanitizeDictionary. Checked
    // here too so an oversized payload is rejected before it reaches the DB,
    // not silently truncated on the way out.
    terms: z.array(z.string().max(40)).max(100),
  })
  .strict();

export const GET = withApi(async (_req, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { captionVocabulary: true },
  });
  return NextResponse.json({ terms: user?.captionVocabulary ?? [] });
});

export const PUT = withApi(async (req, { auth }) => {
  const { terms } = await parseBody(req, bodySchema);

  // Same sanitizer the render path uses, so what is stored is exactly what
  // would be sent — no surprise divergence between the settings screen and
  // the wire.
  const clean = sanitizeDictionary(terms);

  await prisma.user.update({
    where: { id: auth.userId },
    data: { captionVocabulary: clean },
  });

  return NextResponse.json({ terms: clean });
});
