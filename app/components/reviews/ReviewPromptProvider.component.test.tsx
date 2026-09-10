// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewPromptProvider } from "./ReviewPromptProvider";

let authState: { user: { id: string } | null; token: string | null; isLoading: boolean };
let search = "";

vi.mock("@/app/components/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(search),
}));

// The modal itself is covered elsewhere — here it's a probe for "did the deep
// link open anything, and in which mode".
vi.mock("./ReviewPromptModal", () => ({
  ReviewPromptModal: ({ mode }: { mode: string }) => <div data-testid="review-modal" data-mode={mode} />,
}));

let replaceState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  authState = { user: null, token: null, isLoading: false };
  search = "";
  replaceState = vi.fn();
  window.history.replaceState = replaceState as unknown as History["replaceState"];
});

describe("ReviewPromptProvider deep links", () => {
  it("opens the review form in auto mode for ?prompt=1", async () => {
    search = "prompt=1";
    authState = { user: { id: "u1" }, token: "t", isLoading: false };
    render(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    const modal = await screen.findByTestId("review-modal");
    expect(modal).toHaveAttribute("data-mode", "auto");
    expect(replaceState).toHaveBeenCalled();
  });

  it("opens the edit form for ?editReview=1", async () => {
    search = "editReview=1";
    authState = { user: { id: "u1" }, token: "t", isLoading: false };
    render(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    const modal = await screen.findByTestId("review-modal");
    expect(modal).toHaveAttribute("data-mode", "edit");
  });

  // The regression this component shipped with: the watcher fired and stripped
  // the param on mount regardless of auth, so it could open the form — and
  // burn the deep link, since handledRef then blocks the retry — during the
  // ticks before AuthProvider has a token to submit or load a review with.
  it("does nothing and leaves the URL alone while signed out", async () => {
    search = "prompt=1";
    render(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("review-modal")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("waits for auth to resolve rather than treating it as signed out", async () => {
    search = "prompt=1";
    authState = { user: null, token: null, isLoading: true };
    render(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("review-modal")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("opens once the user signs in on the same page", async () => {
    search = "prompt=1";
    const { rerender } = render(<ReviewPromptProvider><div /></ReviewPromptProvider>);
    expect(screen.queryByTestId("review-modal")).toBeNull();

    authState = { user: { id: "u1" }, token: "t", isLoading: false };
    rerender(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    await waitFor(() => expect(screen.getByTestId("review-modal")).toHaveAttribute("data-mode", "auto"));
  });

  it("ignores a page with no deep-link param", async () => {
    authState = { user: { id: "u1" }, token: "t", isLoading: false };
    render(<ReviewPromptProvider><div /></ReviewPromptProvider>);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("review-modal")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
