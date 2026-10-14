// @vitest-environment jsdom
//
// The project clips page's run states and polling. Ported from the AutoClip
// results page's tests (ClipsResults.component.test.tsx) when that page moved
// here, so the dead ends they guard — a failed run with no way back, a 404
// polled forever, a stalled analysis spinning silently — stay guarded.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ClipsView } from "./ClipsView";
import { autoClipPollIntervalMs } from "./poll";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/projects/p1",
  useSearchParams: () => new URLSearchParams(""),
}));
const fireReviewPrompt = vi.fn(async () => {});
vi.mock("@/app/components/reviews/ReviewPromptProvider", () => ({
  useReviewPromptTrigger: () => fireReviewPrompt,
}));
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: "u1" } }) }));
vi.mock("@/app/components/auto-clip/ScorePerformanceBanner", () => ({ ScorePerformanceBanner: () => null }));
// The dashboard's layout provides next-intl; ConfirmDialog (in each clip's
// collection actions) reads its button labels from it.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

let activeClient: QueryClient | null = null;
let activeUnmount: (() => void) | null = null;
afterEach(() => {
  // A live project polls every 2.5s; without this the intervals pile up.
  activeUnmount?.();
  activeClient?.clear();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const project = (over: Record<string, unknown> = {}) => ({
  status: "completed", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null,
  updatedAt: new Date().toISOString(), title: "talk.mp4", instructions: null, progress: 100, ...over,
});
const clip = (over: Record<string, unknown> = {}) => ({
  id: "c1", projectId: "p1", projectTitle: "talk.mp4", index: 0, title: "Clip", startSec: 0, endSec: 10, durationSec: 10,
  aspectRatio: "9:16", score: 80, scoreBreakdown: null, mood: null, status: "ready", progress: 100,
  videoUrl: "https://s3/ok.mp4", thumbnailUrl: null, hasCaptions: true, captionStyleIndex: 0, brollQuery: null,
  subtitleStyleOverride: null, silenceSettings: null, liteEdits: null, audioPeaks: null, rerenderCount: 0,
  failureReason: null, isFavorite: false, isDisliked: false, dubbed: false, edited: false, transcriptExcerpt: null, ...over,
});

function serve(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => json(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  activeClient = client;
  const r = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ClipsView source={{ kind: "project", id: "p1" }} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  activeUnmount = r.unmount;
  return r;
}

describe("autoClipPollIntervalMs — when the page stops polling", () => {
  const data = (status: string, clipStatuses: string[]) => ({ project: { status }, clips: clipStatuses.map((s) => ({ status: s })) });
  it("polls with no data yet, and while the run hasn't settled", () => {
    expect(autoClipPollIntervalMs(undefined)).toBe(2500);
    expect(autoClipPollIntervalMs(data("rendering", []))).toBe(2500);
  });
  it("keeps polling a settled run while a clip is queued or rendering", () => {
    expect(autoClipPollIntervalMs(data("completed", ["ready", "queued"]))).toBe(2500);
    expect(autoClipPollIntervalMs(data("completed", ["rendering"]))).toBe(2500);
  });
  it("stops once settled with nothing in flight", () => {
    expect(autoClipPollIntervalMs(data("completed", ["ready"]))).toBe(false);
    expect(autoClipPollIntervalMs(data("failed", ["failed"]))).toBe(false);
  });
});

describe("ClipsView — a project's run states", () => {
  it("offers Try again on a failed run, sending the same video back to the form", async () => {
    serve({ project: project({ status: "failed", failureReason: "Video is too short (4.0s)" }), clips: [] });
    renderView();
    expect(await screen.findByText(/Video is too short/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/dashboard/create/auto-clip?retry=p1&name=talk.mp4",
    );
  });

  it("says why a clip failed, and what retrying it costs", async () => {
    serve({
      project: project(),
      clips: [clip(), clip({ id: "bad", index: 1, status: "failed", videoUrl: null, failureReason: "The source video couldn't be read.", rerenderCount: 1 })],
    });
    renderView();
    expect(await screen.findByText("The source video couldn't be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry (1 credit)" })).toBeInTheDocument();
  });

  it("says a project is gone instead of polling a 404 forever", async () => {
    const fetchMock = serve({ error: "Not found" }, 404);
    renderView();
    expect(await screen.findByText(/isn.t here any more/)).toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 2800));
    expect(fetchMock.mock.calls.length).toBe(calls);
  }, 10_000);

  it("tells the user a stalled analysis will be stopped and refunded", async () => {
    serve({ project: project({ status: "analyzing", updatedAt: new Date(Date.now() - 45 * 60_000).toISOString() }), clips: [] });
    renderView();
    expect(await screen.findByText(/taking longer than usual/)).toBeInTheDocument();
    expect(screen.getByText(/every credit back/)).toBeInTheDocument();
  });

  it("does not warn about a run that only just started", async () => {
    serve({ project: project({ status: "analyzing" }), clips: [] });
    renderView();
    expect(await screen.findByText("Finding your strongest moments")).toBeInTheDocument();
    expect(screen.queryByText(/taking longer than usual/)).not.toBeInTheDocument();
  });

  it("asks for a review once a run has finished, and not before", async () => {
    serve({ project: project(), clips: [clip()] });
    renderView();
    expect(await screen.findByRole("heading", { name: /All clips \(1\)/ })).toBeInTheDocument();
    expect(fireReviewPrompt).toHaveBeenCalledWith("autoclips_milestone", { featureHint: "auto_clips" });
  });
});
