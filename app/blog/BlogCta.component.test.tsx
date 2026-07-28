// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.hoisted because vi.mock's factory is lifted above ordinary top-level
// declarations, so referencing a plain const here throws at import time.
const { trackMarketingEvent } = vi.hoisted(() => ({ trackMarketingEvent: vi.fn() }));
vi.mock("@/app/components/analytics/track", () => ({ trackMarketingEvent }));

import BlogCta from "./BlogCta";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BlogCta", () => {
  it("renders a working link to pricing by default", () => {
    render(<BlogCta placement="article_footer" path="/blog/x" />);
    expect(screen.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/pricing");
  });

  /**
   * This is the whole point of the component. Before it existed the blog CTA
   * was a bare next/link with no instrumentation, so blog-to-trial conversion
   * could not be measured even in principle.
   */
  it("reports the click with the placement it was rendered at", async () => {
    render(<BlogCta placement="mid_article" path="/blog/hooks-that-stop-the-scroll" />);
    await userEvent.click(screen.getByRole("link", { name: "Get started free" }));

    expect(trackMarketingEvent).toHaveBeenCalledWith("cta_click", {
      path: "/blog/hooks-that-stop-the-scroll",
      placement: "mid_article",
    });
  });

  it("distinguishes placements so the two CTAs on one article don't merge", async () => {
    const { unmount } = render(<BlogCta placement="mid_article" path="/blog/x" />);
    await userEvent.click(screen.getByRole("link", { name: "Get started free" }));
    unmount();

    render(<BlogCta placement="article_footer" path="/blog/x" />);
    await userEvent.click(screen.getByRole("link", { name: "Get started free" }));

    expect(trackMarketingEvent.mock.calls.map(([, dims]) => dims.placement)).toEqual([
      "mid_article",
      "article_footer",
    ]);
  });

  it("still navigates when overridden to a custom destination", () => {
    render(<BlogCta placement="listing" path="/blog" href="/register" label="Try it free" />);
    expect(screen.getByRole("link", { name: "Try it free" })).toHaveAttribute("href", "/register");
  });

  it("uses per-post copy when the CTA block supplies it", () => {
    render(<BlogCta placement="mid_article" path="/blog/x" heading="Clip your next episode" body="Custom body." />);
    expect(screen.getByText("Clip your next episode")).toBeInTheDocument();
    expect(screen.getByText("Custom body.")).toBeInTheDocument();
  });

  // The CTA heading is not article content; promoting it to a heading would
  // put "Ready to put this into practice?" into the document outline.
  it("does not add a heading to the article outline", () => {
    render(<BlogCta placement="article_footer" path="/blog/x" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
