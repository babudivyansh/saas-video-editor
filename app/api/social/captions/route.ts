import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NotFoundError, assertOwnedAccount, ok, parseBody, withSocial } from "@/lib/social/api";
import { captionsBodySchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { rangeBounds } from "@/lib/social/metrics";
import { assembleAccountFactsheet } from "@/lib/social/ai/assemble";
import { generateCaptions } from "@/lib/social/ai/caption-hashtags";
import { runCharged } from "@/lib/social/ai/charge";

// POST /api/social/captions { accountId, brief, tone? }
//
// Not stored: a caption draft is a working artefact, not an insight, and
// persisting every attempt would fill AiInsight with noise the dashboard never
// reads. The idempotency key covers the retry case instead.
export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, captionsBodySchema);
  await assertOwnedAccount(auth.userId, body.accountId);

  const [account] = await loadAccounts(auth.userId, [body.accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const now = new Date();
  const { from, to } = rangeBounds(30, now);
  const { facts } = await assembleAccountFactsheet(account, "monthly", { from, to, tz: body.tz }, now);

  const captions = await runCharged(
    {
      userId: auth.userId,
      toolSlug: "social-caption",
      // Keyed on the brief itself: resubmitting the same brief is a retry, and
      // changing a word is a new request the user meant to make.
      idempotencyKey: `social-caption:${account.id}:${createHash("sha1")
        .update(`${body.brief}|${body.tone ?? ""}`)
        .digest("hex")}`,
      description: `caption drafts for ${account.provider} account`,
    },
    () => generateCaptions(facts, { brief: body.brief, tone: body.tone ?? null }),
  );

  return ok({ captions });
}, {
  rateLimit: { key: (auth) => `social:captions:${auth.userId}`, max: 20, windowSec: 3600 },
});
