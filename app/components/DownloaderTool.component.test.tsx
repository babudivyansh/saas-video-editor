// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The preview thumbnail only; the tool around it talks to auth and the API.
vi.mock("@/app/components/AuthContext", () => ({ useAuth: () => ({ user: null, token: null, openAuthModal: vi.fn() }) }));
vi.mock("@/app/components/useJobPolling", () => ({
  useJobPolling: () => ({ status: "idle", progress: 0, error: null, jobId: null, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}));
vi.mock("@/app/components/reviews/ReviewPromptProvider", () => ({ useReviewPromptTrigger: () => () => {} }));

const { default: DownloaderTool, VideoThumbnail } = await import("./DownloaderTool");

describe("DownloaderTool cost copy", () => {
  // Free since 2026-10-30, but the UI still showed a "1 credit" badge,
  // "1 credit · refunded if it fails" and "same 1 credit".
  for (const slug of ["youtube-downloader", "instagram-downloader"] as const) {
    it(`${slug} says Free and never mentions credits being spent`, () => {
      const { container } = render(
        <DownloaderTool
          slug={slug}
          title="Downloader"
          formatsLine="MP4 & MP3"
          intro="intro"
          urlLabel="Link"
          placeholder="https://"
          examples={["https://example"]}
          icon={null}
          iconBackground="#000"
          footnote="footnote"
        />,
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\b1 credit\b/i);
      expect(text).not.toMatch(/credit (was )?refunded|before any credit/i);
      expect(screen.getAllByText("Free").length).toBeGreaterThanOrEqual(2); // header badge + cost row
      expect(text).toContain("Up to 25 a day");
    });
  }
});

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
