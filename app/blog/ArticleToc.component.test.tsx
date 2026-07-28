// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ArticleToc from "./ArticleToc";

// jsdom has no IntersectionObserver; the component only uses it for the
// active-section highlight, so a no-op stub is enough to render.
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const items = [
  { id: "why-clips-fail", text: "Why most podcast clips fail" },
  { id: "let-the-ai-do-it", text: "Let the AI do the first pass" },
];

describe("ArticleToc", () => {
  it("renders one link per heading, pointing at its anchor", () => {
    render(<ArticleToc items={items} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "#why-clips-fail");
    expect(links[1]).toHaveAttribute("href", "#let-the-ai-do-it");
  });

  it("shows the heading text so the TOC is readable on its own", () => {
    render(<ArticleToc items={items} />);
    expect(screen.getByRole("link", { name: "Why most podcast clips fail" })).toBeInTheDocument();
  });

  // A second unlabelled <nav> would be noise for screen reader users
  // navigating by landmark, alongside the site nav and breadcrumbs.
  it("exposes itself as a labelled navigation landmark", () => {
    render(<ArticleToc items={items} />);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
  });

  it("renders nothing at all when the post has no headings", () => {
    const { container } = render(<ArticleToc items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps anchors distinct when headings repeat", () => {
    render(<ArticleToc items={[{ id: "recap", text: "Recap" }, { id: "recap-2", text: "Recap" }]} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(2);
  });
});
