// @vitest-environment jsdom
//
// Stage 5b: ClipsResults is the credit-spending, render-polling core of
// AutoClip — the riskiest part of the page, deliberately left out of the
// Stage 5a React Query migration until it had real coverage. autoClipPollIntervalMs
// is extracted as a pure function specifically so the "when do we stop
// polling" decision is testable without fighting fake timers against React
// Query's own internal scheduling; the estimate-debounce and confirm-mutation
// behaviors are covered through the component with short real-time waits.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClipsResults, autoClipPollIntervalMs, type ClipItem, type ProjectMeta } from "./page";

// A queued/rendering project never "settles" (matches the original,
// unchanged shouldPoll semantics — this refactor preserves that, not
// something to fix here), so every render below polls on a real 2.5s
// interval unless explicitly torn down. Without an unmount + a cleared
// QueryClient between tests, those intervals accumulate across the whole
// file and can genuinely run the worker out of memory — this is a real
// test-hygiene requirement, not paranoia (it reproduced once already).
let activeQueryClient: QueryClient | null = null;
let activeUnmount: (() => void) | null = null;

afterEach(() => {
  activeUnmount?.();
  activeQueryClient?.clear();
  activeUnmount = null;
  activeQueryClient = null;
});

vi.mock("@/app/hooks/useVideoGenerate", () => ({
  getStoredToken: () => "test-token",
  useVideoGenerate: () => ({}),
}));

const openCreditModal = vi.fn();
vi.mock("@/app/components/billing/CreditModalContext", () => ({
  useInsufficientCredits: () => ({ open: openCreditModal }),
}));

vi.mock("@/app/components/reviews/ReviewPromptProvider", () => ({
  useReviewPromptTrigger: () => vi.fn(async () => {}),
}));

function makeClip(overrides: Partial<ClipItem> = {}): ClipItem {
  return {
    id: "clip-1", index: 0, title: "Clip", startSec: 0, endSec: 10, durationSec: 10,
    aspectRatio: "9:16", score: 80, scoreBreakdown: null, mood: null, status: "queued",
    progress: 0, videoUrl: null, thumbnailUrl: null, hasCaptions: true, captionStyleIndex: 0,
    brollQuery: null, subtitleStyleOverride: null, silenceSettings: null, liteEdits: null,
    audioPeaks: null, rerenderCount: 0,
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return { status: "queued", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null, ...overrides };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeQueryClient = queryClient;
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  activeUnmount = result.unmount;
  return result;
}

describe("autoClipPollIntervalMs — the polling stop condition", () => {
  it("polls again when there's no data yet", () => {
    expect(autoClipPollIntervalMs(undefined)).toBe(2500);
  });

  it("keeps polling while the project itself hasn't settled", () => {
    expect(autoClipPollIntervalMs({ project: makeProject({ status: "rendering" }), clips: [] })).toBe(2500);
  });

  it("keeps polling when the project is settled but a clip is still queued", () => {
    const data = { project: makeProject({ status: "completed" }), clips: [makeClip({ status: "queued" })] };
    expect(autoClipPollIntervalMs(data)).toBe(2500);
  });

  it("keeps polling when the project is settled but a clip is still rendering", () => {
    const data = { project: makeProject({ status: "completed" }), clips: [makeClip({ status: "rendering" })] };
    expect(autoClipPollIntervalMs(data)).toBe(2500);
  });

  it("stops polling once the project is settled and nothing is in flight", () => {
    const data = { project: makeProject({ status: "completed" }), clips: [makeClip({ status: "ready" })] };
    expect(autoClipPollIntervalMs(data)).toBe(false);
  });

  it("stops polling for a failed project with no in-flight clips", () => {
    const data = { project: makeProject({ status: "failed" }), clips: [makeClip({ status: "failed" })] };
    expect(autoClipPollIntervalMs(data)).toBe(false);
  });
});

// The 'ClipsResults — pending_review flow' suite lived here: estimate debounce,
// confirm-and-refetch, and the 402 -> insufficient-credits modal. The review
// step it exercised no longer exists — a run is priced and charged at Generate
// and renders straight through — so those tests were removed with it.
//
// The 402 case did NOT just disappear: it was the only coverage of AutoClip's
// insufficient-credits response, and it moved to the create route, which is
// where the charge now happens. See app/api/generate/auto-clip/route.test.ts.
