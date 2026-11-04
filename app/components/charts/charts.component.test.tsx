// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ComparisonBars } from "./ComparisonBars";
import { Gauge } from "./Gauge";
import { Sparkline } from "./Sparkline";
import type { ChartSeriesMeta } from "./ChartFrame";

/** A categorical series: one point, whose `date` is the category label. */
const category = (key: string, label: string, value: number): ChartSeriesMeta => ({
  key,
  label,
  color: "#335CFF",
  unit: "count",
  points: [{ date: label, value }],
});

describe("the sr-only data table", () => {
  // The regression test for the blank-screen scroll bug. `sr-only` on a <table>
  // does not collapse it: width/height on a display:table box are minimums, so
  // the table keeps its natural size, resolves against <body> for want of a
  // positioned ancestor, escapes the dashboard shell's overflow-hidden, and
  // stretches the document. Production scrolled ~1100px past its content.
  it("is wrapped in a div, because sr-only cannot collapse a table itself", () => {
    const { container } = render(
      <ComparisonBars title="Followers" series={[category("me", "You", 12_000)]} />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table!.classList.contains("sr-only")).toBe(false);
    expect(table!.parentElement).toHaveClass("sr-only");
  });

  it("hides the table by hiding its wrapper, so the data is still exposed", () => {
    render(<ComparisonBars title="Followers" series={[category("me", "You", 12_000)]} />);
    // Still reachable as a table for assistive tech — hidden visually, not
    // removed from the accessibility tree.
    expect(screen.getByRole("table", { name: /data table/i })).toBeInTheDocument();
  });
});

describe("ComparisonBars", () => {
  const series = [category("me", "You", 12_000), category("rival", "@rival", 25_000)];

  it("labels the data table by category, not by date", () => {
    render(<ComparisonBars title="Followers" series={series} categoryLabel="Account" />);
    const table = screen.getByRole("table", { name: /data table/i });
    expect(within(table).getByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    // A category rendered through the date formatter would come out as the raw
    // string or as "Invalid Date" — this is the regression that guards it.
    expect(within(table).getByRole("rowheader", { name: "@rival" })).toBeInTheDocument();
  });

  it("names which bar is the user's own account for screen readers", () => {
    render(<ComparisonBars title="Followers" series={series} highlightKey="me" />);
    expect(screen.getByText(/your account/i)).toBeInTheDocument();
  });

  it("skips a category with no value rather than drawing a zero bar", () => {
    render(
      <ComparisonBars
        title="Followers"
        series={[series[0], { ...category("x", "Unknown", 0), points: [] }]}
      />,
    );
    // It keeps its legend entry (the series exists); what it must not get is a
    // row in the data table, which would assert a value it does not have.
    expect(screen.queryByRole("rowheader", { name: "Unknown" })).not.toBeInTheDocument();
  });
});

describe("Gauge", () => {
  it("shows the components behind the score, not just the score", () => {
    render(
      <Gauge
        label="Account health"
        value={62.4}
        confidence={0.8}
        components={[{ label: "Growth", value: 71 }, { label: "Retention", value: null }]}
      />,
    );
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getByText("no data")).toBeInTheDocument();
  });

  it("says how much of the input was available when confidence is partial", () => {
    render(<Gauge label="Account health" value={62} confidence={0.8} />);
    expect(screen.getByText(/80% of the usual inputs/)).toBeInTheDocument();
  });

  it("renders an unscoreable account as em dash, never as 0", () => {
    render(<Gauge label="Account health" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("renders nothing below two points rather than a meaningless dot", () => {
    const { container } = render(<Sparkline points={[{ date: "2026-08-01", value: 1 }]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("is hidden from screen readers — the tile already states the value", () => {
    const { container } = render(
      <Sparkline points={[{ date: "2026-08-01", value: 1 }, { date: "2026-08-02", value: 4 }]} />,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("does not divide by zero on a flat series", () => {
    const { container } = render(
      <Sparkline points={[{ date: "2026-08-01", value: 5 }, { date: "2026-08-02", value: 5 }]} />,
    );
    expect(container.querySelector("path")?.getAttribute("d")).not.toContain("NaN");
  });
});
