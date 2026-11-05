// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The preview thumbnail only; the tool around it talks to auth and the API.
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ user: null, token: null }) }));
vi.mock("@/app/components/useJobPolling", () => ({ useJobPolling: () => ({}) }));
vi.mock("@/app/components/reviews/ReviewPromptProvider", () => ({ useReviewPromptTrigger: () => () => {} }));

const { VideoThumbnail } = await import("./DownloaderTool");

const SRC = "https://i.ytimg.com/vi_webp/BtQp2U6hJII/maxresdefault.webp";

describe("VideoThumbnail", () => {
  it("shows the video's thumbnail without sending a referrer to the CDN", () => {
    render(<VideoThumbnail src={SRC} title="White Brown Black" />);
    const img = screen.getByAltText("Thumbnail: White Brown Black");
    expect(img).toHaveAttribute("src", SRC);
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("fades the image in once it has loaded", () => {
    render(<VideoThumbnail src={SRC} title="t" />);
    const img = screen.getByAltText("Thumbnail: t");
    expect(img).toHaveClass("opacity-0");
    fireEvent.load(img);
    expect(img).toHaveClass("opacity-100");
  });

  it("shows a placeholder, not a broken-image icon, when the thumbnail can't load", () => {
    // What prod showed before the CSP fix: a broken image on every lookup.
    render(<VideoThumbnail src={SRC} title="t" />);
    fireEvent.error(screen.getByAltText("Thumbnail: t"));
    expect(screen.queryByAltText("Thumbnail: t")).toBeNull();
    expect(screen.getByRole("img", { name: "Preview unavailable" })).toBeInTheDocument();
  });

  it("shows the placeholder straight away when there is no thumbnail URL", () => {
    render(<VideoThumbnail src="" title="t" />);
    expect(screen.getByRole("img", { name: "Preview unavailable" })).toBeInTheDocument();
  });
});
