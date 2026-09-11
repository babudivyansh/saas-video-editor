// @vitest-environment jsdom
//
// This kit was lifted verbatim out of app/admin/dashboard/ui.tsx and
// app/admin/page.tsx, and the move is supposed to be a ZERO visual diff on the
// admin dashboard. These assertions pin the exact class strings the originals
// rendered, so "I moved it and nothing changed" is a checked claim rather than
// a hopeful one — which matters because the admin dashboard is not the surface
// being reworked, and a previous refactor of it shipped with every lazy section
// permanently blank.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Band, LAZY_GROUP, SPAN, Panel, Kpi, MiniKpi, PlaceholderKpi, DeltaChip, ErrorCard, Skeleton, HealthDot } from "./index";

describe("Band", () => {
  it("renders an eyebrow label over a 12-column grid", () => {
    render(
      <Band ariaLabel="Revenue" label="REVENUE">
        <div>card</div>
      </Band>,
    );
    const section = screen.getByRole("region", { name: "Revenue" });
    expect(section).toHaveClass("mb-4");
    expect(screen.getByText("REVENUE")).toHaveClass(
      "text-[10.5px]", "font-bold", "uppercase", "tracking-[0.14em]", "text-fg-subtle",
    );
    expect(section.querySelector(".grid.grid-cols-12.gap-4")).not.toBeNull();
  });

  it("omits the label row entirely when unlabelled", () => {
    render(<Band ariaLabel="Plain"><div>card</div></Band>);
    expect(screen.getByRole("region", { name: "Plain" }).querySelector(".h-px")).toBeNull();
  });
});

describe("SPAN / LAZY_GROUP", () => {
  // The whole responsive system. Tailwind needs literal strings, so a typo here
  // is a silently full-width card rather than a build error.
  it("is the exact span map the admin dashboard was built on", () => {
    expect(SPAN).toEqual({
      2: "col-span-6 sm:col-span-4 xl:col-span-2",
      3: "col-span-12 sm:col-span-6 xl:col-span-3",
      4: "col-span-12 lg:col-span-6 xl:col-span-4",
      5: "col-span-12 xl:col-span-5",
      6: "col-span-12 lg:col-span-6",
      8: "col-span-12 xl:col-span-8",
      12: "col-span-12",
    });
  });

  // Regression: this was `display: contents`, which generates NO BOX, so the
  // IntersectionObserver measuring it never fired and every lazy section stayed
  // on its skeleton forever in production.
  it("is a real, measurable grid box rather than display:contents", () => {
    expect(LAZY_GROUP).toBe("col-span-12 grid grid-cols-12 gap-4");
    expect(LAZY_GROUP).not.toContain("contents");
  });
});

describe("Panel", () => {
  it("renders title, subtitle and children in the card shell", () => {
    render(<Panel title="Lifecycle events" subtitle="per day"><p>body</p></Panel>);
    expect(screen.getByRole("heading", { name: "Lifecycle events" })).toHaveClass("text-sm", "font-bold", "text-fg");
    expect(screen.getByText("per day")).toHaveClass("text-[11px]", "text-fg-subtle");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("toggles fullscreen and back", async () => {
    const user = userEvent.setup();
    render(<Panel title="Revenue"><p>body</p></Panel>);

    await user.click(screen.getByRole("button", { name: "Open Revenue fullscreen" }));
    expect(screen.getByRole("button", { name: "Close Revenue fullscreen" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Revenue fullscreen" }));
    expect(screen.getByRole("button", { name: "Open Revenue fullscreen" })).toBeInTheDocument();
  });

  it("offers a CSV export only when given rows", () => {
    const { rerender } = render(<Panel title="A"><p>b</p></Panel>);
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();

    rerender(<Panel title="A" csv={{ filename: "a.csv", rows: [{ x: 1 }] }}><p>b</p></Panel>);
    expect(screen.getByRole("button", { name: "Export A as CSV" })).toBeInTheDocument();
  });

  // An empty card must not read as a broken one.
  it("dashed says so explicitly, and drops fullscreen", () => {
    render(<Panel title="CAC" dashed><p>body</p></Panel>);
    expect(screen.getByText("needs instrumentation")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CAC" })).toHaveClass("text-fg-muted");
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
  });
});

describe("DeltaChip", () => {
  it("renders a dash for no data", () => {
    render(<DeltaChip pct={null} />);
    expect(screen.getByText("—")).toHaveClass("text-fg-subtle");
  });

  it("treats a near-zero move as flat rather than as a direction", () => {
    render(<DeltaChip pct={0.02} />);
    expect(screen.getByText(/→/)).toHaveClass("text-fg-subtle");
  });

  it.each([
    { pct: 12, invert: false, tone: "text-success", arrow: "↑" },
    { pct: -12, invert: false, tone: "text-error", arrow: "↓" },
    // invert is for metrics where down is good — unsubscribes, cost per render.
    // The Social Tracker's copy had this and admin's did not; merging without
    // it would have quietly flipped the colour on those tiles.
    { pct: -12, invert: true, tone: "text-success", arrow: "↓" },
    { pct: 12, invert: true, tone: "text-error", arrow: "↑" },
  ])("colours $pct% (invert=$invert) as $tone", ({ pct, invert, tone, arrow }) => {
    render(<DeltaChip pct={pct} invert={invert} />);
    const chip = screen.getByText(new RegExp(arrow));
    expect(chip).toHaveClass(tone);
    expect(chip.textContent).toContain("12.0%");
  });
});

describe("Kpi tiles", () => {
  it("renders a dash rather than a zero when the value is unknown", () => {
    render(<Kpi label="MRR" value={null} format={String} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("takes the sparkline as a node, so the tile carries no chart dependency", () => {
    render(<Kpi label="MRR" value={1} format={String} spark={<div data-testid="spark" />} />);
    expect(screen.getByTestId("spark")).toBeInTheDocument();
  });

  it("MiniKpi prefers a delta over a sub-label when both are given", () => {
    render(<MiniKpi label="ARR" value={5} format={String} delta={3} sub="ignored" />);
    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("PlaceholderKpi says what would make it real instead of showing a zero", () => {
    render(<PlaceholderKpi label="CAC" needs="marketing spend" />);
    expect(screen.getByText("—")).toHaveClass("text-fg-subtle");
    expect(screen.getByText("marketing spend")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("Skeleton is labelled for screen readers and sized by prop", () => {
    render(<Skeleton h="h-72" />);
    const el = screen.getByLabelText("Loading");
    expect(el).toHaveClass("h-72", "animate-pulse", "bg-surface-3");
  });

  it("ErrorCard retries in place rather than reloading the page", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorCard onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("HealthDot states its condition in text, not only in colour", () => {
    const { rerender } = render(<HealthDot ok label="Redis" />);
    expect(screen.getByText("healthy")).toHaveClass("sr-only");

    rerender(<HealthDot ok={false} label="Redis" />);
    expect(screen.getByText("attention needed")).toHaveClass("sr-only");
    expect(screen.getByText("Redis")).toHaveClass("text-error");
  });
});
