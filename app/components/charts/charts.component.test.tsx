// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ComparisonBars } from "./ComparisonBars";
import { DonutChart } from "./DonutChart";
import { FunnelChart } from "./FunnelChart";
import { Gauge } from "./Gauge";
import { StackedBarChart } from "./StackedBarChart";
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

describe("DonutChart", () => {
  it("states each slice's share as well as its value", () => {
    render(
      <DonutChart
        title="Content mix"
        series={[category("reel", "Reels", 75), category("image", "Images", 25)]}
      />,
    );
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("keeps the sr-only table when the visual is decorative", () => {
    render(<DonutChart title="Content mix" series={[category("reel", "Reels", 75)]} />);
    expect(screen.getByRole("table", { name: /data table/i })).toBeInTheDocument();
  });
});

describe("FunnelChart", () => {
  const stages = [
    { key: "impressions", label: "Impressions", value: 10_000, color: "#335CFF" },
    { key: "reach", label: "Reach", value: 4_000, color: "#7C3AED" },
    { key: "engaged", label: "Engaged", value: null, color: "#D946EF", unavailableReason: "Not reported." },
    { key: "follows", label: "Follows", value: 200, color: "#22C55E" },
  ];

  it("states each step's conversion from the one above", () => {
    render(<FunnelChart title="Funnel" stages={stages} />);
    expect(screen.getByText("40% of previous")).toBeInTheDocument();
  });

  it("renders an unreported stage as a gap, not as zero", () => {
    render(<FunnelChart title="Funnel" stages={stages} />);
    expect(screen.getByText("not reported")).toBeInTheDocument();
    expect(screen.queryByText("0% of previous")).not.toBeInTheDocument();
  });

  it("measures across a missing stage rather than against it", () => {
    // Follows (200) is compared with Reach (4,000) — the last stage that has a
    // number — not with the unreported Engaged, which would be a divide by null.
    render(<FunnelChart title="Funnel" stages={stages} />);
    expect(screen.getByText("5.0% of previous")).toBeInTheDocument();
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

describe("StackedBarChart", () => {
  const series: ChartSeriesMeta[] = [
    { key: "likes", label: "Likes", color: "#335CFF", unit: "count", points: [{ date: "2026-08-01", value: 10 }] },
    { key: "comments", label: "Comments", color: "#7C3AED", unit: "count", points: [{ date: "2026-08-01", value: 5 }] },
  ];

  it("keeps the same keyboard contract as the line chart", () => {
    render(<StackedBarChart title="Interactions" series={series} />);
    const plot = screen.getByRole("application");
    expect(plot).toHaveAttribute("tabindex", "0");
    expect(plot).toHaveAccessibleDescription(/arrow keys/i);
  });

  it("still ships the data table", () => {
    render(<StackedBarChart title="Interactions" series={series} />);
    const table = screen.getByRole("table", { name: /data table/i });
    expect(within(table).getByRole("columnheader", { name: "Comments" })).toBeInTheDocument();
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
