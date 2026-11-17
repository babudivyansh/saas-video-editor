// The web Social Tracker's side of posting: the same service the mobile app
// uses (lib/mobile/posts.ts), with its PostError mapped onto the web API's
// HttpError so withSocial answers { error, code } with the right status.

import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { HttpError } from "@/lib/social/api";
import { PostError } from "@/lib/mobile/posts";
import { prisma } from "@/lib/prisma";
import { AUTO_PUBLISH_PROVIDERS, POSTABLE_PROVIDERS } from "@/lib/social/publish";
import { computeBestTimes, HOUR_BLOCK, localHour, localWeekday, rankedTimeSlots } from "@/lib/social/metrics";

/** Runs `fn`, turning a PostError into the HttpError withSocial understands. */
export async function asHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PostError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }
}

/**
 * The JSON body, validated, with the first problem as the error message.
 * The composer and the post rows show `error` as-is, so "Paste the post's
 * link" beats the generic "Validation failed".
 */
export async function parsePostBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => {
    throw new HttpError(400, "Invalid request", "invalid_request");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request", "invalid_request");
  return parsed.data;
}

const DAY = 86_400_000;

/**
 * How many posts are waiting on the person: an Instagram/Facebook post that
 * is due (theirs to post), a failed upload, or one that was missed. Same
 * window as the Posts list (30 days back), so the badge and the list agree.
 */
export async function countNeedsYou(userId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY);
  return prisma.clipPublish.count({
    where: {
      userId,
      socialAccount: { userId, provider: { in: [...POSTABLE_PROVIDERS] } },
      AND: [
        { OR: [{ scheduledFor: { gte: since } }, { scheduledFor: null, createdAt: { gte: since } }] },
        {
          OR: [
            { status: { in: ["awaiting_manual", "failed", "expired"] } },
            {
              status: "pending",
              OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
              socialAccount: { provider: { notIn: [...AUTO_PUBLISH_PROVIDERS] } },
            },
          ],
        },
      ],
    },
  });
}

export interface BestSlot {
  /** When the post would go out: the next occurrence of the slot, mid-block. */
  at: string;
  /** "Tue 16:00–20:00", in the account's timezone. */
  label: string;
  /** Average engagement rate of past posts in this slot, 0–100. */
  engagementRate: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The account's best posting slots (from its own post history), each as the
 * next real time it comes round. Needs at least two posts in a slot, so one
 * lucky upload doesn't become advice. Walks forward hour by hour in the
 * account's timezone rather than doing offset arithmetic, so DST and
 * half-hour zones come out right.
 */
export function bestSlots(
  posts: Array<{ id: string; publishedAt: Date | null; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }>,
  tz: string,
  now = new Date(),
  limit = 3,
): BestSlot[] {
  const slots = rankedTimeSlots(computeBestTimes(posts, tz), limit, 2);
  const start = new Date(Math.ceil((now.getTime() + 60 * 60_000) / 3_600_000) * 3_600_000);
  return slots.flatMap((slot) => {
    const hour = slot.block * HOUR_BLOCK + HOUR_BLOCK / 2;
    for (let h = 0; h < 24 * 8; h++) {
      const t = new Date(start.getTime() + h * 3_600_000);
      if (localWeekday(t, tz) === slot.day && localHour(t, tz) === hour) {
        return [{
          at: t.toISOString(),
          label: `${DAYS[slot.day]} ${pad(slot.block * HOUR_BLOCK)}:00–${pad(slot.block * HOUR_BLOCK + HOUR_BLOCK)}:00`,
          engagementRate: slot.avgEngagementRate,
        }];
      }
    }
    return [];
  });
}
