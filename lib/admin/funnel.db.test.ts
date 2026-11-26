// The funnel's raw SQL against a REAL database — a mocked prisma would only
// test the mock. Rows are dated in 2030 so nothing else in the database falls
// inside the window. Skips cleanly when no database is reachable.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

const { prisma } = await import("@/lib/prisma");
const { getFunnelReport } = await import("./funnel");

const RUN = randomUUID().slice(0, 8);
const NOW = new Date("2030-06-30T12:00:00Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const ids: string[] = [];
let dbUp = true;

beforeAll(async () => {
  try {
    const mk = (tag: string, joined: Date) =>
      prisma.user.create({ data: { email: `funnel-${tag}-${RUN}@test.invalid`, passwordHash: "x", createdAt: joined } });
    // Paid: ran AutoClip, got clips, downloaded, came back 10 days later, paid.
    const a = await mk("a", daysBefore(20));
    await prisma.project.create({ data: { userId: a.id, title: "a", productType: "auto-clip", status: "ready", createdAt: daysBefore(20) } });
    await prisma.userEvent.create({ data: { userId: a.id, type: "download", meta: { name: "c.mp4", area: "clips" } } });
    await prisma.loginEvent.create({ data: { userId: a.id, createdAt: daysBefore(10) } });
    await prisma.purchase.create({ data: { id: `pay_${RUN}`, userId: a.id, amountInPaise: 79900, credits: 0, createdAt: daysBefore(10) } });
    // Ran AutoClip and it failed.
    const b = await mk("b", daysBefore(19));
    await prisma.project.create({
      data: { userId: b.id, title: "b", productType: "auto-clip", status: "failed", failureReason: `boom-${RUN}`, createdAt: daysBefore(19), updatedAt: daysBefore(19) },
    });
    // Signed up and never came back.
    const c = await mk("c", daysBefore(18));
    ids.push(a.id, b.id, c.id);
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (!dbUp) return;
  await prisma.purchase.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("getFunnelReport (database)", () => {
  it("counts each signup's furthest steps, retention and failures", async (ctx) => {
    if (!dbUp) ctx.skip();
    const r = await getFunnelReport(30, NOW);
    expect(Object.fromEntries(r.steps.map((s) => [s.key, s.users]))).toEqual({
      signed_up: 3, uploaded: 2, ran_autoclip: 2, got_clips: 1, downloaded: 1,
      saw_upgrade: 0, opened_plans: 0, started_checkout: 0, trial: 0, paid: 1,
    });
    // The paywall sections load (no upgrade events in this fixture).
    expect(r.placements).toEqual([]);
    expect(r.trialToPaid).toEqual({ trials: 0, paid: 0 });
    expect(r.medianHoursToFirstRun).toBe(0);
    expect(r.retention.reduce((n, w) => n + w.signups, 0)).toBe(3);
    // Only A came back, 10 days after joining: counted at day 1 and 7, not 30.
    const back = r.retention.reduce((n, w) => n + ((w.d7 ?? 0) * w.signups) / 100, 0);
    expect(Math.round(back)).toBe(1);
    expect(r.autoClipFailures).toContainEqual({ reason: `boom-${RUN}`, count: 1 });
  });
});
