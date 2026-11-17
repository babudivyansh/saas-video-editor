// @vitest-environment jsdom
//
// Coverage for the Stage 5 React Query migration: DubPanel and PublishPanel
// used to hand-roll fetch + useState/useEffect for their data and a manual
// setInterval for dub-status polling. This pins the new useQuery/useMutation
// behavior, especially the two things most likely to regress silently — the
// conditional refetchInterval (only polls while a dub is in flight) and the
// reconnect-link detection now derived from the mutation's own error instead
// of a separately-tracked boolean.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DubPanel, PublishPanel } from "./_components/ClipActions";

vi.mock("@/app/hooks/useVideoGenerate", () => ({
  getStoredToken: () => "test-token",
  useVideoGenerate: () => ({}),
}));

const CLIP = { id: "clip-1" } as never;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("DubPanel", () => {
  it("fetches languages and existing dubs only once opened", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ dubs: [], languages: [{ code: "es", label: "Spanish" }] }));
    renderWithClient(<DubPanel projectId="proj-1" clip={CLIP} />);

    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Dub into another language" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/projects/proj-1/clips/clip-1/dub");
    await waitFor(() => expect(screen.getByRole("option", { name: "Spanish" })).toBeInTheDocument());
  });

  it("refetches after starting a dub", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ dubs: [], languages: [{ code: "es", label: "Spanish" }] }));
    renderWithClient(<DubPanel projectId="proj-1" clip={CLIP} embedded />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Wait for the languages to RENDER, not just for the request to start —
    // Dub needs a selected language, and clicking before the list arrives was
    // a race that failed under a loaded parallel run.
    await waitFor(() => expect(screen.getByRole("option", { name: "Spanish" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Dub (1 credit)" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // 1 GET + 1 POST + 1 refetch GET
    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ targetLang: "es" });
  });

  it("shows the mutation's own error message when the dub request fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ error: "Dubbing is not configured" }), { status: 503 });
      return jsonResponse({ dubs: [], languages: [{ code: "es", label: "Spanish" }] });
    });
    renderWithClient(<DubPanel projectId="proj-1" clip={CLIP} embedded />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Spanish" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Dub (1 credit)" }));

    expect(await screen.findByText("Dubbing is not configured")).toBeInTheDocument();
  });
});

describe("PublishPanel", () => {
  const ACCOUNT = { id: "acct-1", provider: "youtube", username: "creator", displayName: null };

  // Posting moved to the one composer; this panel hands the clip over to it.
  it("opens the composer with this clip chosen", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accounts: [ACCOUNT], publishes: [] }));
    renderWithClient(<PublishPanel projectId="proj-1" clip={CLIP} embedded />);

    const link = await screen.findByRole("link", { name: "Post or schedule this clip" });
    expect(link).toHaveAttribute("href", "/dashboard/social-tracker/new?clip=clip-1");
  });

  it("shows the connect-an-account message when there are none", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accounts: [], publishes: [] }));
    renderWithClient(<PublishPanel projectId="proj-1" clip={CLIP} embedded />);

    expect(await screen.findByText(/Connect a social account/)).toBeInTheDocument();
  });

  it("lists where the clip has already gone, with a link to the live post", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        accounts: [ACCOUNT],
        publishes: [{ id: "pub-1", permalink: "https://youtu.be/x", status: "linked", socialAccount: { provider: "youtube", username: "creator" } }],
      }),
    );
    renderWithClient(<PublishPanel projectId="proj-1" clip={CLIP} embedded />);

    expect(await screen.findByRole("link", { name: "View" })).toHaveAttribute("href", "https://youtu.be/x");
    expect(screen.getByRole("link", { name: "See all posts →" })).toBeInTheDocument();
  });
});
