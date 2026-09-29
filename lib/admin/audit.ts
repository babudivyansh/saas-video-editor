// The one audit-trail writer. Every admin action, and the handful of
// user-initiated events worth an audit record, goes through auditEvent (or
// its admin wrapper auditAdminAction) so every row gets the same fields and
// joins the same hash chain.
//
// Who / where: inside an admin request, withAdmin opens a request context
// (lib/admin/request-context.ts) and the IP, device and session land on the
// row without the caller passing them. An explicit `details.ip` still wins.
//
// Tamper evidence: each row stores hash = HMAC-SHA256(prevHash + canonical
// row). Writes are serialized with a Postgres advisory lock so the chain
// stays linear; the latest hash is mirrored to Redis so deleting the newest
// rows (which leaves no broken link behind) is detectable too. See
// lib/admin/audit-verify.ts.
//
// Never throws: an audit failure must not fail the action, but it IS logged
// at error level, where someone is watching.

import { createHash, createHmac, randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/rate-limit";
import { getAdminContext } from "@/lib/admin/request-context";

export type AuditActorType = "admin" | "user" | "system";

export interface AuditDetails {
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
}

export interface AuditEventInput extends AuditDetails {
  actorId: string;
  actorType: AuditActorType;
  action: string;
  targetId?: string;
  userAgent?: string;
  sessionId?: string;
}

/** Arbitrary constant: the advisory-lock id that serializes audit writes. */
const CHAIN_LOCK = 742_019_311;
export const CHAIN_GENESIS = "GENESIS";
export const CHAIN_HEAD_KEY = "audit:chain:head";

function chainKey(): string {
  return env.AUDIT_HMAC_KEY || createHash("sha256").update(`audit-chain:${env.JWT_SECRET}`).digest("hex");
}

export interface HashableRow {
  id: string;
  createdAt: Date;
  adminId: string;
  actorType: string | null;
  action: string;
  targetId: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  prevHash: string | null;
}

/** The row's chain hash. Field order is fixed — changing it invalidates every stored hash. */
export function hashAuditRow(row: HashableRow): string {
  const canonical = JSON.stringify([
    row.id, row.createdAt.toISOString(), row.adminId, row.actorType, row.action, row.targetId,
    row.before, row.after, row.reason, row.ip, row.userAgent, row.sessionId, row.prevHash,
  ]);
  return createHmac("sha256", chainKey()).update(canonical).digest("hex");
}

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
const clip = (s: string | undefined | null, n: number) => (s ? s.slice(0, n) : null);

export async function auditEvent(input: AuditEventInput): Promise<void> {
  try {
    const ctx = getAdminContext();
    // Only borrow the request's who/where when it's the same actor acting.
    const sameActor = ctx && ctx.adminId === input.actorId;
    const base = {
      id: randomUUID(),
      adminId: input.actorId,
      actorType: input.actorType,
      action: input.action,
      targetId: input.targetId ?? null,
      before: json(input.before),
      after: json(input.after),
      reason: clip(input.reason, 1000),
      ip: clip(input.ip ?? (sameActor ? ctx.ip : null), 100),
      userAgent: clip(input.userAgent ?? (sameActor ? ctx.userAgent : null), 400),
      sessionId: clip(input.sessionId ?? (sameActor ? ctx.sessionId : null), 100),
    };

    const hash = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${CHAIN_LOCK})) AS l`;
      const last = await tx.auditLog.findFirst({
        where: { hash: { not: null } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { hash: true, createdAt: true },
      });
      // Taken inside the lock so chain order and time order can never disagree.
      const now = new Date();
      const createdAt = last && last.createdAt >= now ? new Date(last.createdAt.getTime() + 1) : now;
      const prevHash = last?.hash ?? CHAIN_GENESIS;
      const row = { ...base, createdAt, prevHash };
      const rowHash = hashAuditRow(row);
      await tx.auditLog.create({ data: { ...row, hash: rowHash } });
      return rowHash;
    });
    await redis.set(CHAIN_HEAD_KEY, hash).catch(() => {});
  } catch (e) {
    // error, not warn: a lost audit row is invisible everywhere except
    // whatever the team already watches at error level.
    logger.error("audit-write-failure", `audit write failed for ${input.action} on ${input.targetId ?? "-"}`, {
      reason: (e as Error).message,
    });
  }
}

/**
 * True the first time `key` is seen within `ttlSeconds` — for audit events
 * that would otherwise repeat on every request (views, elevation prompts).
 * Redis unavailable → false: better to miss a duplicate-prone view record
 * than to fail or slow the request it rides on.
 */
export async function auditOnce(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    return await redis.setNx(key, "1", ttlSeconds);
  } catch {
    return false;
  }
}

/** An admin action. The admin is the actor; request who/where is filled in automatically. */
export async function auditAdminAction(
  adminId: string,
  action: string,
  targetId?: string,
  details?: AuditDetails,
): Promise<void> {
  await auditEvent({ actorId: adminId, actorType: "admin", action, targetId, ...details });
}

// Best-effort request IP. Kept for existing call sites; the request context
// now supplies the IP on its own inside withAdmin.
export function auditIp(req: NextRequest): string | undefined {
  const ip = getClientIp(req);
  return ip === "unknown" ? undefined : ip;
}
