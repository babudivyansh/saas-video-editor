// @vitest-environment node
//
// Every enqueue id shape used across the codebase, run through BullMQ's own
// validator. Two shipped bugs came from ids BullMQ rejects (`${id}:export`)
// or silently dedupes (a reused project id) — and render-queue.ts was only
// ever mocked in tests, so nothing caught either.
import { describe, expect, it } from "vitest";
import { Job } from "bullmq";
import { toBullJobId } from "./render-queue";

const uuid = "3f1c2a9e-8b7d-4c1e-9a2b-5d6e7f8a9b0c";
const t = Date.now().toString(36);

// One entry per enqueue call site (grep "\.enqueue(" in lib/ and app/api/).
const CALL_SITE_IDS = {
  "caption-render submit": uuid,
  "caption-render export": `${uuid}-export-${t}`,
  "caption-render download": `${uuid}-download-${t}`,
  "caption-render sync": `${uuid}:sync:${Date.now()}`,
  "editor render": `${uuid}-${t}`,
  "autoclip pick": `${uuid}-${t}`,
  "autoclip rerender": `${uuid}-2-${t}`,
  "legacy export shape": `${uuid}:export`,
};

function bullAccepts(jobId: string): boolean {
  const validate = (Job.prototype as unknown as { validateOptions: (d: unknown) => void }).validateOptions;
  try {
    validate.call({ opts: { jobId }, name: "test" }, { data: "{}" });
    return true;
  } catch {
    return false;
  }
}

describe("render queue job ids", () => {
  it.each(Object.entries(CALL_SITE_IDS))("%s id is accepted by BullMQ after normalisation", (_name, id) => {
    expect(bullAccepts(toBullJobId(id))).toBe(true);
  });

  it("the old single-colon shape really was rejected (guards the test itself)", () => {
    expect(bullAccepts(`${uuid}:export`)).toBe(false);
  });
});
