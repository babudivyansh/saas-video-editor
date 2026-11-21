import { describe, expect, it, vi } from "vitest";

// edit-plan reaches lib/env through the Gemini helper; no real key is needed.
vi.mock("@/lib/env", () => ({ env: {} }));
import { editPlanResponseSchema, formatIndexedTranscript, resolveEditPlan, PLAN_LIMITS, type EditAction } from "@/lib/autoclip-ai/edit-plan";
import type { WordTiming } from "@/utils/elevenlabs";

// One word every 0.5s: word i is spoken at [i*500, i*500+400] ms.
const words = (n: number): WordTiming[] =>
  Array.from({ length: n }, (_, i) => ({ word: `w${i}`, start: i * 500, end: i * 500 + 400 }));

describe("editPlanResponseSchema", () => {
  it("keeps valid actions and drops unknown or malformed ones one by one", () => {
    const parsed = editPlanResponseSchema.parse({
      actions: [
        { type: "punch_in", word: 4, strength: "high", holdSec: 2 },
        { type: "explode", word: 1 },
        { type: "broll", fromWord: 10, toWord: 14, queries: [] },
        { type: "reset_wide", word: 9 },
      ],
    });
    expect(parsed.actions.map((a) => a.type)).toEqual(["punch_in", "reset_wide"]);
  });

  it("degrades a bad strength or hold to the defaults instead of dropping the action", () => {
    const parsed = editPlanResponseSchema.parse({ actions: [{ type: "punch_in", word: 4, strength: "huge", holdSec: 99 }] });
    expect(parsed.actions[0]).toMatchObject({ strength: "medium", holdSec: 2 });
  });
});

describe("resolveEditPlan", () => {
  it("anchors a punch-in just before its word, inside the clip's body", () => {
    const plan = resolveEditPlan([{ type: "punch_in", word: 10, strength: "high", holdSec: 2 }], words(80), 40);
    expect(plan.zooms).toHaveLength(1);
    expect(plan.zooms[0].tSec).toBeCloseTo(5 - 0.15, 3);
    expect(plan.zooms[0].strength).toBe(1);
  });

  it("drops punch-ins in the lead-in and spaces the rest out", () => {
    const actions: EditAction[] = [
      { type: "punch_in", word: 0, strength: "medium", holdSec: 2 },  // 0s: lead-in
      { type: "punch_in", word: 10, strength: "medium", holdSec: 2 }, // 4.85s
      { type: "punch_in", word: 12, strength: "medium", holdSec: 2 }, // 5.85s: too close
      { type: "punch_in", word: 20, strength: "medium", holdSec: 2 }, // 9.85s
    ];
    const plan = resolveEditPlan(actions, words(80), 40);
    expect(plan.zooms.map((z) => Math.round(z.tSec))).toEqual([5, 10]);
    for (let i = 1; i < plan.zooms.length; i++) {
      expect(plan.zooms[i].tSec - plan.zooms[i - 1].tSec).toBeGreaterThanOrEqual(PLAN_LIMITS.minZoomSpacingSec);
    }
  });

  it("keeps a reset only while a punch-in is held, and ends that hold at the reset", () => {
    const plan = resolveEditPlan([
      { type: "punch_in", word: 10, strength: "low", holdSec: 4 },
      { type: "reset_wide", word: 14 }, // 7s, inside the hold
      { type: "reset_wide", word: 60 }, // 30s, nothing held
    ], words(80), 40);
    expect(plan.resets).toEqual([7]);
    expect(plan.zooms[0].holdSec).toBeCloseTo(7 - 4.85, 3);
  });

  it("keeps B-roll clear of the hook and the payoff, spaced, and at most three", () => {
    const b = (from: number) => ({ type: "broll" as const, fromWord: from, toWord: from + 4, queries: ["city at night"], reaction: false });
    const plan = resolveEditPlan([b(1), b(10), b(12), b(30), b(50), b(64), b(75)], words(80), 40);
    // Each starts just after its trigger word (word end + 0.15s). b(1) is in
    // the hook, b(12) too close to b(10), b(64) over the cap, b(75) in the payoff.
    expect(plan.broll.map((x) => Math.round(x.startSec))).toEqual([6, 16, 26]);
    for (const w of plan.broll) {
      expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(PLAN_LIMITS.brollMinSec - 1e-9);
      expect(w.endSec - w.startSec).toBeLessThanOrEqual(PLAN_LIMITS.brollMaxSec + 1e-9);
      expect(w.sentence.length).toBeGreaterThan(0);
    }
  });

  it("collapses layout ranges to the one covering most of the clip, or none", () => {
    const majority = resolveEditPlan([{ type: "layout", fromWord: 0, toWord: 60, layout: "split" }], words(80), 40);
    expect(majority.layout).toBe("split");
    const minority = resolveEditPlan([{ type: "layout", fromWord: 0, toWord: 20, layout: "split" }], words(80), 40);
    expect(minority.layout).toBeNull();
  });

  it("ignores anchors past the end of the transcript and returns an empty plan with no words", () => {
    expect(resolveEditPlan([{ type: "punch_in", word: 999, strength: "low", holdSec: 1 }], words(10), 5).zooms).toEqual([]);
    expect(resolveEditPlan([{ type: "punch_in", word: 1, strength: "low", holdSec: 1 }], [], 5)).toMatchObject({ zooms: [], broll: [], layout: null });
  });
});

describe("formatIndexedTranscript", () => {
  it("numbers every word with its index and starts each line with a time", () => {
    const text = formatIndexedTranscript(words(20), 14);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("[0.0s] (0)w0 (1)w1")).toBe(true);
    expect(lines[1].startsWith("[7.0s] (14)w14")).toBe(true);
  });
});
