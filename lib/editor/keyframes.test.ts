import { describe, expect, it } from "vitest";
import { validateDoc, DEFAULT_DOC, type TextClip } from "./types";
import { keyframeExpr, removeKeyframe, setKeyframe, stateAt, textAt } from "./keyframes";

const text = (over: Partial<TextClip> = {}): TextClip => ({
  id: "t", type: "text", text: "Hi", timelineStart: 10, duration: 4, fontFamily: "Poppins", fontSizePct: 0.05,
  color: "#ffffff", bold: false, align: "center", x: 0.5, y: 0.5, bgColor: null, ...over,
});
const kf = (t: number, x: number, scale = 1, opacity = 1) => ({ t, x, y: 0.5, scale, opacity });

describe("stateAt", () => {
  it("uses the static values with no keyframes", () => {
    expect(stateAt(text({ opacity: 0.4 }), 1)).toEqual({ x: 0.5, y: 0.5, scale: 1, opacity: 0.4 });
  });

  it("holds before the first and after the last keyframe, and interpolates between", () => {
    const c = text({ keyframes: [kf(1, 0.2), kf(3, 0.6, 2, 0)] });
    expect(stateAt(c, 0).x).toBe(0.2);
    expect(stateAt(c, 4).x).toBe(0.6);
    const mid = stateAt(c, 2);
    expect(mid.x).toBeCloseTo(0.4);
    expect(mid.scale).toBeCloseTo(1.5);
    expect(mid.opacity).toBeCloseTo(0.5);
  });
});

describe("textAt", () => {
  it("applies the state at timeline time, scaling the font size", () => {
    const out = textAt(text({ keyframes: [kf(0, 0.2, 1), kf(2, 0.6, 3)] }), 11);
    expect(out.x).toBeCloseTo(0.4);
    expect(out.fontSizePct).toBeCloseTo(0.1);
  });
});

describe("setKeyframe / removeKeyframe", () => {
  it("adds a keyframe capturing the current state, replacing one at the same time", () => {
    let c = text();
    c = { ...c, keyframes: setKeyframe(c, 1) };
    c = { ...c, keyframes: setKeyframe(c, 3, { x: 0.9 }) };
    c = { ...c, keyframes: setKeyframe(c, 3.01, { x: 0.8 }) };
    expect(c.keyframes!.map((k) => [k.t, k.x])).toEqual([[1, 0.5], [3.01, 0.8]]);
    expect(removeKeyframe(c, 1)!.length).toBe(1);
    expect(removeKeyframe({ ...c, keyframes: [kf(1, 0.5)] }, 1)).toBeUndefined();
  });
});

describe("keyframeExpr", () => {
  it("builds a piecewise-linear expression in absolute time", () => {
    const c = text({ keyframes: [kf(1, 0.2), kf(3, 0.6)] });
    expect(keyframeExpr(c, "x")).toBe("if(lt(t,11),0.2,if(lt(t,13),0.2+(0.4)*(t-11)/2,0.6))");
  });

  it("is the plain value with no keyframes", () => {
    expect(keyframeExpr(text(), "opacity")).toBe("1");
  });
});

describe("validateDoc", () => {
  it("accepts good keyframes and rejects out-of-range ones", () => {
    const docWith = (keyframes: unknown) => ({ ...structuredClone(DEFAULT_DOC), tracks: { ...structuredClone(DEFAULT_DOC).tracks, text: [text({ keyframes: keyframes as TextClip["keyframes"] })] } });
    expect(validateDoc(docWith([kf(0, 0.5)]))).toBeNull();
    expect(validateDoc(docWith([kf(0, 1.5)]))).toBe("text clip invalid keyframe");
  });
});
