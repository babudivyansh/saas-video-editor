// @vitest-environment jsdom
//
// Top clips play themselves: each card's clip loops, muted, while it is on
// screen and pauses when it scrolls away. jsdom has no IntersectionObserver
// or media playback, so both are stubbed and the observer is driven by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TopClips } from "./HomeSections";
import type { ClipRow } from "@/app/dashboard/projects/components/clipRow";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k, useFormatter: () => ({}) }));

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let observers: { cb: Callback; target: Element | null }[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private entry: { cb: Callback; target: Element | null };
      constructor(cb: Callback) {
        this.entry = { cb, target: null };
        observers.push(this.entry);
      }
      observe(el: Element) { this.entry.target = el; }
      // next/link observes its anchors for prefetching too.
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const clip = (over: Partial<ClipRow> = {}) =>
  ({
    id: "c1",
    projectId: "p1",
    index: 0,
    title: "Stranded",
    score: 84,
    durationSec: 27,
    thumbnailUrl: "https://example.test/c1.jpg",
    videoUrl: "https://example.test/c1.mp4",
    ...over,
  }) as ClipRow;

describe("TopClips", () => {
  it("renders each clip as a muted, looping, inline video over its thumbnail", () => {
    const { container } = render(<TopClips clips={[clip()]} />);
    const video = container.querySelector("video")!;
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("poster")).toBe("https://example.test/c1.jpg");
  });

  it("plays while on screen and pauses when scrolled away", () => {
    const { container } = render(<TopClips clips={[clip()]} />);
    const video = container.querySelector("video")!;
    const io = observers.find((o) => o.target === video)!;

    io.cb([{ isIntersecting: true }]);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

    io.cb([{ isIntersecting: false }]);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
  });

  it("falls back to the still thumbnail when a clip has no video", () => {
    const { container } = render(<TopClips clips={[clip({ videoUrl: null })]} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/c1.jpg");
  });
});
