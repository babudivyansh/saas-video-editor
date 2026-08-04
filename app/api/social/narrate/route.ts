import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, NotFoundError, assertOwnedAccount, ok, parseBody, withSocial } from "@/lib/social/api";
import { narrateBodySchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { assemblePostBatchFactsheet } from "@/lib/social/ai/assemble";
import { generatePostNarrations } from "@/lib/social/ai/post-narration";
import { runCharged } from "@/lib/social/ai/charge";

// POST /api/social/narrate { accountId, postIds[] }
//
// One batch of up to ten posts, one model call, one charge. Narrations are
// written back onto the posts themselves (aiScoreReason) rather than into
// AiInsight, because that is where the content table reads them from.
export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, narrateBodySchema);
  await assertOwnedAccount(auth.userId, body.accountId);

  const [account] = await loadAccounts(auth.userId, [body.accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const now = new Date();
  const { facts, postIds } = await assemblePostBatchFactsheet(account, body.postIds, now);
  // assemblePostBatchFactsheet filters by accountId as well as id, so a post id
  // belonging to someone else simply is not in the result.
  if (postIds.length === 0) throw new NotFoundError("No posts found");
  if (postIds.length !== body.postIds.length) throw new NotFoundError("Post not found");

  const narrations = await runCharged(
    {
      userId: auth.userId,
      toolSlug: "social-post-narration",
      idempotencyKey: `social-post-narration:${account.id}:${createHash("sha1")
        .update([...postIds].sort().join(","))
        .digest("hex")}`,
      description: `narration for ${postIds.length} posts`,
    },
    async () => {
      const result = await generatePostNarrations(facts, postIds);
      if (result.narrations.length === 0) {
        // Everything the model returned was for a post we did not send. That is
        // a failed generation, and runCharged's catch refunds it.
        throw new HttpError(502, "Narration returned nothing usable.", "generation_failed");
      }
      await prisma.$transaction(
        result.narrations.map((n) =>
          prisma.socialPost.update({
            where: { id: n.postId },
            data: { aiScoreReason: `${n.verdict}: ${n.narration}` },
          }),
        ),
      );
      return result.narrations;
    },
  );

  return ok({ narrations });
}, {
  rateLimit: { key: (auth) => `social:narrate:${auth.userId}`, max: 30, windowSec: 3600 },
});
