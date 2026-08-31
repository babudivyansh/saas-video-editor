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

// A pending_review project never "settles" (matches the original,
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
    aspectRatio: "9:16", score: 80, scoreBreakdown: null, mood: null, status: "pending_review",
    progress: 0, videoUrl: null, thumbnailUrl: null, hasCaptions: true, captionStyleIndex: 0,
    brollQuery: null, subtitleStyleOverride: null, silenceSettings: null, liteEdits: null,
    audioPeaks: null, rerenderCount: 0,
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return { status: "pending_review", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null, ...overrides };
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

describe("ClipsResults — pending_review flow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  // pending_review never "settles" (see the file header), so clipsQuery's
  // real 2.5s refetchInterval keeps running for as long as the component is
  // mounted. Do NOT globally speed up setTimeout to compensate (tried once —
  // it also hijacks React Query's own interval scheduling, turning a 2.5s
  // poll into a ~5ms one and triggering a genuine runaway-refetch OOM, which
  // is worse than the problem it was meant to fix). The 300ms estimate
  // debounce is comfortably inside RTL's default 1000ms waitFor/findBy
  // timeout, and unmounting between tests (below) stops the interval before
  // it can fire more than once or twice per test.
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("/clips/estimate") && method === "POST") {
        return jsonResponse({ clipCount: 1, totalDurationSec: 10, gross: 1, analysisCredit: 0, total: 1, balance: 10, sufficient: true });
      }
      if (url.includes("/clips/confirm") && method === "POST") {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith("/clips") && method === "GET") {
        return jsonResponse({ project: makeProject(), clips: [makeClip()] });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  function renderPendingReview() {
    return renderWithClient(
      <ClipsResults projectId="proj-1" status="rendering" error={null} expectedCount={1} fileName="video.mp4" onReset={vi.fn()} />,
    );
  }

  it("fetches the project's clips on mount", async () => {
    renderPendingReview();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/projects/proj-1/clips"), expect.anything()));
  });

  it("requests an estimate for the seeded review edits, debounced", async () => {
    renderPendingReview();
    await screen.findByRole("button", { name: /Confirm & render/ });

    await waitFor(
      () => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/clips/estimate"))).toBe(true),
    );
    const [, init] = fetchMock.mock.calls.find((c) => String(c[0]).includes("/clips/estimate"))!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.clips).toEqual([{ id: "clip-1", keep: true, startSec: 0, endSec: 10, aspectRatio: "9:16" }]);
  });

  it("confirms rendering and refetches the clip list on success", async () => {
    renderPendingReview();
    const confirmBtn = await screen.findByRole("button", { name: /Confirm & render/ });

    const clipsCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/clips") && (c[1] as RequestInit)?.method !== "POST").length;

    await userEvent.click(confirmBtn);

    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/clips/confirm"))).toBe(true));
    await waitFor(() => {
      const clipsCallsAfter = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/clips") && (c[1] as RequestInit)?.method !== "POST").length;
      expect(clipsCallsAfter).toBeGreaterThan(clipsCallsBefore);
    });
  });

  it("opens the insufficient-credits modal on a 402, without showing the generic error text", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("/clips/estimate")) return jsonResponse({ clipCount: 1, totalDurationSec: 10, gross: 1, analysisCredit: 0, total: 1, balance: 10, sufficient: true });
      if (url.includes("/clips/confirm")) return jsonResponse({ error: "Insufficient credits", required: 5, balance: 1 }, 402);
      if (url.endsWith("/clips") && method === "GET") return jsonResponse({ project: makeProject(), clips: [makeClip()] });
      return jsonResponse({}, 404);
    });

    renderPendingReview();
    const confirmBtn = await screen.findByRole("button", { name: /Confirm & render/ });
    await userEvent.click(confirmBtn);

    await waitFor(() => expect(openCreditModal).toHaveBeenCalledWith({ required: 5, balance: 1, action: "Auto Clips" }));
    expect(screen.queryByText("Failed to confirm")).not.toBeInTheDocument();
  });

  it("shows the generic error text for a non-402 confirm failure", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("/clips/estimate")) return jsonResponse({ clipCount: 1, totalDurationSec: 10, gross: 1, analysisCredit: 0, total: 1, balance: 10, sufficient: true });
      if (url.includes("/clips/confirm")) return jsonResponse({ error: "Render queue is down" }, 500);
      if (url.endsWith("/clips") && method === "GET") return jsonResponse({ project: makeProject(), clips: [makeClip()] });
      return jsonResponse({}, 404);
    });

    renderPendingReview();
    const confirmBtn = await screen.findByRole("button", { name: /Confirm & render/ });
    await userEvent.click(confirmBtn);

    expect(await screen.findByText("Render queue is down")).toBeInTheDocument();
    expect(openCreditModal).not.toHaveBeenCalled();
  });
});
