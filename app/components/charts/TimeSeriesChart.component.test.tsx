// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { Heatmap, BLOCK_LABELS, WEEKDAY_LABELS } from "./Heatmap";
import type { ChartSeriesMeta } from "./ChartFrame";

const points = [
  { date: "2026-08-01", value: 100 },
  { date: "2026-08-02", value: 150 },
  { date: "2026-08-03", value: 120 },
];

const series: ChartSeriesMeta[] = [
  { key: "followers", label: "Followers", color: "#335CFF", unit: "count", points },
];

describe("TimeSeriesChart accessibility", () => {
  it("renders every plotted value as a real data table", () => {
    // The main reason this kit exists instead of recharts.
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    const table = screen.getByRole("table", { name: /data table/i });
    expect(within(table).getByRole("columnheader", { name: "Followers" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "1 Aug 2026" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "3 Aug 2026" })).toBeInTheDocument();
  });

  it("marks a gap as 'no data' rather than zero", () => {
    const sparse: ChartSeriesMeta[] = [
      { key: "a", label: "A", color: "#000", unit: "count", points: [{ date: "2026-08-01", value: 5 }] },
      { key: "b", label: "B", color: "#111", unit: "count", points: [{ date: "2026-08-02", value: 9 }] },
    ];
    render(<TimeSeriesChart title="Two" series={sparse} />);
    expect(within(screen.getByRole("table")).getAllByText("no data")).toHaveLength(2);
  });

  it("exposes the plot as a focusable application region with instructions", () => {
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    const plot = screen.getByRole("application");
    expect(plot).toHaveAttribute("tabindex", "0");
    expect(plot).toHaveAttribute("aria-roledescription", "interactive chart");
    expect(plot).toHaveAccessibleDescription(/arrow keys/i);
  });

  it("formats values by unit in the table", () => {
    render(
      <TimeSeriesChart
        title="Watch time"
        series={[{ key: "w", label: "Watch time", color: "#000", unit: "seconds", points: [{ date: "2026-08-01", value: 3600 }] }]}
      />,
    );
    expect(within(screen.getByRole("table")).getByText("1h 00m")).toBeInTheDocument();
  });
});

describe("TimeSeriesChart keyboard cursor", () => {
  it("moves with arrow keys and announces the focused point", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    const plot = screen.getByRole("application");

    await user.tab();
    expect(plot).toHaveFocus();

    // Focus starts at the most recent point; ArrowLeft steps back.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("status")).toHaveTextContent(/2 Aug 2026: Followers 150/);

    await user.keyboard("{Home}");
    expect(screen.getByRole("status")).toHaveTextContent(/1 Aug 2026: Followers 100/);

    await user.keyboard("{End}");
    expect(screen.getByRole("status")).toHaveTextContent(/3 Aug 2026: Followers 120/);
  });

  it("clears the reading on Escape", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("does not run past either end of the series", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    await user.tab();
    await user.keyboard("{Home}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("status")).toHaveTextContent(/1 Aug 2026/);
    await user.keyboard("{End}{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("status")).toHaveTextContent(/3 Aug 2026/);
  });

  it("fires onPointSelect on Enter", async () => {
    const onPointSelect = vi.fn();
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Follower growth" series={series} onPointSelect={onPointSelect} />);
    await user.tab();
    await user.keyboard("{Home}{Enter}");
    expect(onPointSelect).toHaveBeenCalledWith("2026-08-01");
  });

  it("clears the reading when focus leaves the chart", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Follower growth" series={series} />);
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    await user.tab();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("TimeSeriesChart states", () => {
  it("shows an empty hint instead of an empty plot", () => {
    render(<TimeSeriesChart title="Reach" series={[{ ...series[0], points: [] }]} emptyHint="Need more history." />);
    expect(screen.getByText("Need more history.")).toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("announces the loading state", () => {
    render(<TimeSeriesChart title="Reach" series={series} loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent(/Loading Reach/);
  });

  it("shows a legend only when there is more than one solid series", () => {
    // Scoped to the legend list: "Followers" also appears as a column header in
    // the sr-only data table, which is not what this asserts.
    const { rerender } = render(<TimeSeriesChart title="One" series={series} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    rerender(
      <TimeSeriesChart
        title="Two"
        series={[series[0], { key: "reach", label: "Reach", color: "#7C3AED", unit: "count", points }]}
      />,
    );
    const legend = screen.getByRole("list");
    expect(within(legend).getByText("Followers")).toBeInTheDocument();
    expect(within(legend).getByText("Reach")).toBeInTheDocument();
  });

  it("does not count a dashed comparison series toward the legend", () => {
    render(
      <TimeSeriesChart
        title="Compare"
        series={[series[0], { key: "prev", label: "Previous", color: "#999", unit: "count", points, style: "dashed" }]}
      />,
    );
    // Two series but only one solid, so no legend — the dashed line is
    // explained by the tooltip, not by a legend entry.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("Heatmap accessibility", () => {
  const cells = [
    { row: 1, col: 2, value: 5.5, count: 3 },
    { row: 3, col: 4, value: 2.1, count: 1 },
  ];

  it("is a real table with day rows and time-block columns", () => {
    render(<Heatmap title="Best time to post" cells={cells} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Mon" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "08–12" })).toBeInTheDocument();
  });

  it("labels empty cells instead of leaving them silent", () => {
    render(<Heatmap title="Best time" cells={cells} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} />);
    // 7 x 6 grid, 2 filled.
    expect(screen.getAllByText("No posts published in this slot")).toHaveLength(40);
  });

  it("states the sample size behind a cell", () => {
    render(<Heatmap title="Best time" cells={cells} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} />);
    expect(screen.getByText(/5\.5% from 3 posts/)).toBeInTheDocument();
    expect(screen.getByText(/2\.1% from 1 post$/)).toBeInTheDocument();
  });

  it("names the recommended slot", () => {
    render(
      <Heatmap title="Best time" cells={cells} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} best={{ row: 1, col: 2 }} />,
    );
    expect(screen.getByText(/best time to post/)).toBeInTheDocument();
  });

  it("hides values backed by a single post, but still exposes them to AT", () => {
    render(<Heatmap title="Best time" cells={cells} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} />);
    // Visible text only for count >= 2 ...
    expect(screen.getByText("5.5%", { selector: "[aria-hidden='true']" })).toBeInTheDocument();
    expect(screen.queryByText("2.1%", { selector: "[aria-hidden='true']" })).not.toBeInTheDocument();
    // ... but the screen-reader text carries both, with the sample size.
    expect(screen.getByText(/2\.1% from 1 post/)).toBeInTheDocument();
  });

  it("explains itself when there is nothing to show", () => {
    render(<Heatmap title="Best time" cells={[]} rowLabels={WEEKDAY_LABELS} colLabels={BLOCK_LABELS} />);
    expect(screen.getByText(/Not enough posting history/)).toBeInTheDocument();
  });
});
