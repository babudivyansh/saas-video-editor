// @vitest-environment jsdom
//
// Keep-or-skip review (ReviewDeck) and the share page's clip picking
// (pickShareClips). The promises these guard: Keep hearts a clip, Skip never
// writes a dislike, best clips come first, and the share page acts on exactly
// the clips the user kept.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/app/components/ui/Toast";
import { ReviewDeck, shareHref } from "./ReviewDeck";
import { pickShareClips } from "./SharePanel";
import type { ViewClip } from "./model";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/projects/p1/review",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

let client: QueryClient | null = null;
afterEach(() => {
  client?.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clip = (over: Partial<ViewClip> & { id: string }): ViewClip => ({
  projectId: "p1", projectTitle: "talk.mp4", index: 0, title: `Clip ${over.id}`, startSec: 0, endSec: 10, durationSec: 10,
  aspectRatio: "9:16", score: 80, scoreBreakdown: null, mood: null, status: "ready", progress: 100,
  videoUrl: "https://s3/ok.mp4", thumbnailUrl: null, hasCaptions: true, captionStyleIndex: 0, brollQuery: null,
  subtitleStyleOverride: null, silenceSettings: null, liteEdits: null, audioPeaks: null, rerenderCount: 0,
  failureReason: null, isFavorite: false, isDisliked: false, dubbed: false, edited: false, transcriptExcerpt: null,
  ...over,
} as ViewClip);

const project = { status: "completed", warnings: null, failureReason: null, captionStyleIndex: null, uploadedVideoUrl: null, title: "talk.mp4", instructions: null, progress: 100 };

function renderDeck(clips: ViewClip[]) {
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patches.push({ url, body: JSON.parse(init.body as string) });
      return json({ ok: true });
    }
    return json({ project, clips });
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider><ReviewDeck projectId="p1" /></ToastProvider>
    </QueryClientProvider>,
  );
  return patches;
}

describe("ReviewDeck", () => {
  it("shows the best clip first and hearts it on Keep", async () => {
    const patches = renderDeck([clip({ id: "low", score: 40 }), clip({ id: "high", score: 95 })]);
    expect(await screen.findByText("Clip high")).toBeInTheDocument();
    expect(screen.getByText(/Clip 1 of 2/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep this clip" }));
    await waitFor(() => expect(patches).toEqual([{ url: "/api/projects/p1/clips/high", body: { isFavorite: true } }]));
    expect(await screen.findByText("Clip low")).toBeInTheDocument();
  });

  it("never writes a dislike on Skip, and only un-hearts a kept clip", async () => {
    const patches = renderDeck([clip({ id: "a", score: 90 }), clip({ id: "b", score: 80, isFavorite: true })]);
    await screen.findByText("Clip a");
    await userEvent.click(screen.getByRole("button", { name: "Skip this clip" }));
    await screen.findByText("Clip b");
    await userEvent.click(screen.getByRole("button", { name: "Skip this clip" }));

    await waitFor(() => expect(patches).toEqual([{ url: "/api/projects/p1/clips/b", body: { isFavorite: false } }]));
    expect(patches.some((p) => "isDisliked" in p.body)).toBe(false);
  });

  it("ends on a count and links the kept clips to the share page", async () => {
    renderDeck([clip({ id: "a", score: 90 }), clip({ id: "b", score: 80 })]);
    await screen.findByText("Clip a");
    await userEvent.click(screen.getByRole("button", { name: "Keep this clip" }));
    await screen.findByText("Clip b");
    await userEvent.click(screen.getByRole("button", { name: "Skip this clip" }));

    expect(await screen.findByText("clip kept")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post or download/ })).toHaveAttribute("href", "/dashboard/projects/p1/share?clips=a");
  });

  it("skips clips that haven't finished rendering", async () => {
    renderDeck([clip({ id: "done", score: 50 }), clip({ id: "busy", score: 99, status: "rendering", videoUrl: null })]);
    expect(await screen.findByText("Clip done")).toBeInTheDocument();
    expect(screen.getByText(/Clip 1 of 1/)).toBeInTheDocument();
  });

  it("keeps and skips from the keyboard when the card is focused", async () => {
    const patches = renderDeck([clip({ id: "a", score: 90 }), clip({ id: "b", score: 80 })]);
    await screen.findByText("Clip a");
    const card = screen.getByLabelText(/Right arrow keeps it/);
    act(() => card.focus());
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ isFavorite: true });
  });
});

describe("pickShareClips", () => {
  const all = [
    clip({ id: "a", score: 60 }),
    clip({ id: "b", score: 90, isFavorite: true }),
    clip({ id: "c", score: 70 }),
    clip({ id: "r", score: 99, status: "rendering", videoUrl: null }),
  ];

  it("uses ?clips= in the order given, dropping unknown and unfinished ids", () => {
    expect(pickShareClips(all, "c,zzz,a,r").map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("falls back to the hearted clips", () => {
    expect(pickShareClips(all, null).map((c) => c.id)).toEqual(["b"]);
  });

  it("falls back to every finished clip, best first, when none are hearted", () => {
    const none = all.map((c) => ({ ...c, isFavorite: false }));
    expect(pickShareClips(none, "").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("builds the share link", () => {
    expect(shareHref("p1", ["a", "b"])).toBe("/dashboard/projects/p1/share?clips=a,b");
    expect(shareHref("p1", [])).toBe("/dashboard/projects/p1/share");
  });
});
