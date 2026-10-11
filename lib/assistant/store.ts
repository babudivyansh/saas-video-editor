import { ASSISTANT_DAILY, ASSISTANT_KEEP_DAYS, assistantCardSchema, type AssistantCard, type AssistantMessage } from "@clipiro/shared";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Clipiro AI's conversation (one per person, decision A3) and its daily
// allowance (decision A2: 20 messages a day on Free, 200 on paid plans).

const DAY_MS = 86_400_000;
const HISTORY_LIMIT = 60;
const cardsSchema = z.array(assistantCardSchema);

type Row = { id: string; role: string; text: string; cards: Prisma.JsonValue; createdAt: Date };

export function toMessage(r: Row): AssistantMessage {
  const cards = cardsSchema.safeParse(r.cards ?? []);
  return {
    id: r.id,
    role: r.role === "user" ? "user" : "assistant",
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    ...(cards.success && cards.data.length ? { cards: cards.data } : {}),
  };
}

/** The conversation, oldest first: the last HISTORY_LIMIT messages within ASSISTANT_KEEP_DAYS. */
export async function history(userId: string): Promise<AssistantMessage[]> {
  const since = new Date(Date.now() - ASSISTANT_KEEP_DAYS * DAY_MS);
  const rows = await prisma.assistantMessage.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows.reverse().map(toMessage);
}

export async function save(userId: string, role: "user" | "assistant", text: string, cards: AssistantCard[] = []): Promise<AssistantMessage> {
  const row = await prisma.assistantMessage.create({
    data: { userId, role, text, ...(cards.length ? { cards: cards as unknown as Prisma.InputJsonValue } : {}) },
  });
  return toMessage(row);
}

/** "New chat". */
export async function clear(userId: string): Promise<void> {
  await prisma.assistantMessage.deleteMany({ where: { userId } });
}

/** Drops this person's messages past the keep window (cheap; run on send). */
export async function prune(userId: string): Promise<void> {
  await prisma.assistantMessage.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - ASSISTANT_KEEP_DAYS * DAY_MS) } } });
}

// ── Allowance ────────────────────────────────────────────────────────────────

const key = (userId: string) => `assistant:day:${userId}`;

export async function dailyLimit(userId: string): Promise<number> {
  return (await getUserTier(userId)) === "free" ? ASSISTANT_DAILY.free : ASSISTANT_DAILY.paid;
}

export async function remaining(userId: string, limit?: number): Promise<{ remaining: number; limit: number }> {
  const max = limit ?? (await dailyLimit(userId));
  const used = Number((await redis.get(key(userId))) ?? 0);
  return { remaining: Math.max(0, max - used), limit: max };
}

/** Takes one message from today's allowance; false when it's used up. The window is 24 h from the first message. */
export async function takeMessage(userId: string, limit: number): Promise<boolean> {
  const used = await redis.incrWithExpire(key(userId), DAY_MS / 1000);
  if (used <= limit) return true;
  await redis.decrFloor(key(userId));
  return false;
}

/** Gives a message back (the reply failed before anything was written). */
export async function giveBack(userId: string): Promise<void> {
  await redis.decrFloor(key(userId));
}
