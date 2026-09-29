import { describe, expect, it, vi } from "vitest";

// Regression for a production incident: an AutoClip pick failed three times
// with "Video is too short (0.0s)".
//
// Two separate bugs met there. This file covers the retry half — the
// in-process driver (which is what production actually runs) ignored
// NonRetryableError, so an unretryable job burned every attempt, each one
// re-downloading the entire source video to reach the identical verdict.
// NonRetryableError had only ever been wired into the BullMQ path.

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// render-queue is imported below purely to prove the two import paths yield
// the same class; these keep that import from dragging in real env/Redis.
vi.mock("@/lib/env", () => ({ env: { RENDER_QUEUE_DRIVER: "in-process" } }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import { InProcessQueue, NonRetryableError } from "./job-queue";

/** Let the queue's async drain loop run to completion. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("InProcessQueue retries", () => {
  it("retries an ordinary failure", async () => {
    const handler = vi.fn(async () => { throw new Error("transient"); });
    new InProcessQueue<{ projectId: string }>("test", handler).enqueue("j1", { projectId: "p" });
    await settle();
    // Initial attempt plus MAX_RETRIES.
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a NonRetryableError", async () => {
    const handler = vi.fn(async () => { throw new NonRetryableError("Video is too short"); });
    new InProcessQueue<{ projectId: string }>("test", handler).enqueue("j2", { projectId: "p" });
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps draining later jobs after one fails permanently", async () => {
    const seen: string[] = [];
    const handler = vi.fn(async (payload: { projectId: string }) => {
      seen.push(payload.projectId);
      if (payload.projectId === "bad") throw new NonRetryableError("nope");
    });
    const q = new InProcessQueue<{ projectId: string }>("test", handler);
    q.enqueue("j3", { projectId: "bad" });
    q.enqueue("j4", { projectId: "good" });
    await settle();
    expect(seen).toEqual(["bad", "good"]);
  });

  it("succeeds without retrying when the handler works", async () => {
    const handler = vi.fn(async () => {});
    new InProcessQueue<{ projectId: string }>("test", handler).enqueue("j5", { projectId: "p" });
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("InProcessQueue admin controls", () => {
  it("keeps a job that exhausted its attempts in the failed set, and retry re-runs it", async () => {
    let fail = true;
    const handler = vi.fn(async () => { if (fail) throw new Error("boom"); });
    const q = new InProcessQueue<{ projectId: string }>("admin-test-1", handler);
    q.enqueue("f1", { projectId: "p1" });
    await settle();
    const snap = q.snapshot();
    expect(snap.failed).toMatchObject([{ id: "f1", attempts: 3, error: "boom" }]);
    expect(snap.failedTotal).toBe(1);

    fail = false;
    expect(q.retryFailed("f1")).toBe(true);
    await settle();
    expect(q.snapshot().failed).toEqual([]);
    expect(q.snapshot().completedTotal).toBe(1);
    expect(q.retryFailed("f1")).toBe(false);
  });

  it("pause stops new jobs starting; resume drains them", async () => {
    const handler = vi.fn(async () => {});
    const q = new InProcessQueue<{ projectId: string }>("admin-test-2", handler);
    q.pause();
    q.enqueue("a", { projectId: "p" });
    q.enqueue("b", { projectId: "p" });
    await settle();
    expect(handler).not.toHaveBeenCalled();
    expect(q.snapshot().waiting.map((w) => w.id)).toEqual(["a", "b"]);
    expect(q.removeWaiting("a")).toBe(true);
    q.resume();
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("drainWaiting drops every waiting job without running it", async () => {
    const handler = vi.fn(async () => {});
    const q = new InProcessQueue<{ projectId: string }>("admin-test-3", handler);
    q.pause();
    q.enqueue("a", { projectId: "p" });
    q.enqueue("b", { projectId: "p" });
    expect(q.drainWaiting()).toBe(2);
    q.resume();
    await settle();
    expect(handler).not.toHaveBeenCalled();
  });

  it("registers itself by name for the admin Queues tab", async () => {
    const { inProcessQueues } = await import("./job-queue");
    const q = new InProcessQueue<{ projectId: string }>("admin-test-4", vi.fn(async () => {}));
    expect(inProcessQueues.get("admin-test-4")).toBe(q);
  });
});

describe("NonRetryableError", () => {
  // Both drivers must recognise the SAME class. Re-exporting it from
  // render-queue (rather than declaring a second one) is what guarantees an
  // instanceof check in job-queue matches an error thrown from a pipeline that
  // imported it from render-queue.
  it("is the same class whether imported from job-queue or render-queue", async () => {
    const { NonRetryableError: FromRenderQueue } = await import("./render-queue");
    expect(new NonRetryableError("x")).toBeInstanceOf(FromRenderQueue);
    expect(new FromRenderQueue("x")).toBeInstanceOf(NonRetryableError);
  });

  it("carries a message written for the user", () => {
    expect(new NonRetryableError("Video is too short (3.0s)").message).toBe("Video is too short (3.0s)");
  });
});
