// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlertStrip } from "./AlertStrip";
import { GoalsStrip } from "./GoalsStrip";
import { Tabs } from "@/app/components/ui/Tabs";
import type { AccountAlert, GoalProgress } from "@/lib/social/metrics";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const alert = (over: Partial<AccountAlert> = {}): AccountAlert => ({
  kind: "milestone",
  severity: "info",
  code: "followerMilestone",
  params: { milestone: 10_000 },
  message: "engine fallback",
  ...over,
});

const goal = (over: Partial<GoalProgress & { metric: string; label: string; measurable: boolean }> = {}) => ({
  goalId: "g1",
  metric: "followers",
  label: "Followers",
  measurable: true,
  pct: 40,
  current: 12_000,
  target: 15_000,
  baseline: 10_000,
  onTrack: false,
  daysRemaining: 20,
  requiredDailyRate: 150,
  actualDailyRate: 60,
  projectedHitAt: null,
  hit: false,
  overdue: false,
  ...over,
});

describe("AlertStrip", () => {
  it("renders from code and params, not from the engine's English message", () => {
    // The engine's `message` is deprecated precisely because a computed string
    // cannot be translated; the renderer owns the wording.
    render(<AlertStrip alerts={[alert()]} />);
    expect(screen.getByText(/Passed 10K followers/)).toBeInTheDocument();
    expect(screen.queryByText("engine fallback")).not.toBeInTheDocument();
  });

  it("falls back to the engine message for a code it has no copy for", () => {
    render(<AlertStrip alerts={[alert({ code: "somethingNew" as AccountAlert["code"] })]} />);
    expect(screen.getByText("engine fallback")).toBeInTheDocument();
  });

  it("is a polite status region, not an assertive alert", () => {
    // These are noteworthy, not urgent — role="alert" would interrupt a screen
    // reader mid-sentence on every render.
    render(<AlertStrip alerts={[alert()]} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing at all when there are no signals", () => {
    const { container } = render(<AlertStrip alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GoalsStrip", () => {
  it("exposes progress as a real progressbar with its bounds", () => {
    render(<GoalsStrip goals={[goal()]} />);
    const bar = screen.getByRole("progressbar", { name: /Followers progress/ });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("says a goal is behind rather than only colouring it", () => {
    render(<GoalsStrip goals={[goal()]} />);
    expect(screen.getByText("BEHIND")).toBeInTheDocument();
  });

  it("refuses to draw a bar for an unmeasurable goal", () => {
    // A 0% bar would read as "no progress" when the truth is "no data".
    render(<GoalsStrip goals={[goal({ measurable: false, metric: "reach" })]} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(/does not report reach/)).toBeInTheDocument();
    expect(screen.getByText("NO DATA")).toBeInTheDocument();
  });

  it("marks a reached goal as hit", () => {
    render(<GoalsStrip goals={[goal({ hit: true, pct: 100 })]} />);
    expect(screen.getByText("HIT")).toBeInTheDocument();
    expect(screen.getByText("Reached")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  const items = [
    { id: "a", label: "First", content: <p>first panel</p> },
    { id: "b", label: "Second", content: <p>second panel</p> },
    { id: "c", label: "Third", content: <p>third panel</p> },
  ];

  it("wires every tab to its panel — the contract v1 claimed but never had", () => {
    render(<Tabs items={items} label="Sections" />);
    const tab = screen.getByRole("tab", { name: "First" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("keeps exactly one tab tabbable (roving tabindex)", () => {
    render(<Tabs items={items} label="Sections" />);
    const tabbable = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });

  it("moves between tabs with the arrow keys, and wraps", async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} label="Sections" />);
    await user.click(screen.getByRole("tab", { name: "First" }));

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to either end with Home and End", async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} label="Sections" />);
    await user.click(screen.getByRole("tab", { name: "First" }));

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows only the active panel", async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} label="Sections" />);
    expect(screen.getByText("first panel")).toBeInTheDocument();
    expect(screen.queryByText("second panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Second" }));
    await waitFor(() => expect(screen.getByText("second panel")).toBeInTheDocument());
  });

  it("reports the change to the caller", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs items={items} label="Sections" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Third" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("AiInsightsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem("token", "test-token");
  });

  const summary = {
    summary: "Followers grew steadily.",
    wins: ["Reels outperformed statics"],
    concerns: [],
    recommendations: [{ title: "Post two reels", rationale: "They carried the week.", metric: null, effort: "low" as const }],
  };

  async function load() {
    const { AiInsightsPanel } = await import("./AiInsightsPanel");
    return AiInsightsPanel;
  }

  it("states the price before the click AND in the confirmation", async () => {
    // A button that silently spends credits is a trap.
    const AiInsightsPanel = await load();
    const user = userEvent.setup();
    render(
      <AiInsightsPanel accountId="a1" accountLabel="@clipiro" cost={5} initialSummary={null} generatedAt={null} />,
    );
    expect(screen.getByRole("button", { name: /5 cr/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    expect(await screen.findByText(/spends 5 credits/)).toBeInTheDocument();
  });

  it("sends the bearer token, because /api/social/* ignores the cookie", async () => {
    const AiInsightsPanel = await load();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { summary: { content: summary } } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiInsightsPanel accountId="a1" accountLabel="@clipiro" cost={5} initialSummary={null} generatedAt={null} />);
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    await user.click(await screen.findByRole("button", { name: "Generate", hidden: false }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("points an out-of-credits failure at billing, not at a retry", async () => {
    const AiInsightsPanel = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Not enough credits." }), { status: 402 })),
    );

    const user = userEvent.setup();
    render(<AiInsightsPanel accountId="a1" accountLabel="@clipiro" cost={5} initialSummary={null} generatedAt={null} />);
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    await user.click(await screen.findByRole("button", { name: "Generate", hidden: false }));

    const alertBox = await screen.findByRole("alert");
    expect(within(alertBox).getByText(/Not enough credits/)).toBeInTheDocument();
    expect(within(alertBox).getByRole("link", { name: "Top up" })).toHaveAttribute("href", "/dashboard?billing=1&tab=topup");
  });

  it("says plainly that a failed generation was not charged", async () => {
    const AiInsightsPanel = await load();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Generation failed — you were not charged." }), { status: 502 })),
    );

    const user = userEvent.setup();
    render(<AiInsightsPanel accountId="a1" accountLabel="@clipiro" cost={5} initialSummary={null} generatedAt={null} />);
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    await user.click(await screen.findByRole("button", { name: "Generate", hidden: false }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not charged/);
  });

  it("renders a stored summary without any network call", async () => {
    const AiInsightsPanel = await load();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AiInsightsPanel
        accountId="a1"
        accountLabel="@clipiro"
        cost={5}
        initialSummary={summary}
        generatedAt="2026-08-01T00:00:00Z"
      />,
    );
    expect(screen.getByText("Followers grew steadily.")).toBeInTheDocument();
    expect(screen.getByText("Post two reels")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
