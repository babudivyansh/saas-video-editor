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
