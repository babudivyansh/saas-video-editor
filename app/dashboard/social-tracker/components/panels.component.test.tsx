// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@/app/components/ui/Tabs";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

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
    // Signed in: the session cookie is httpOnly, the page only sees this marker.
    document.cookie = "signed_in=1; path=/";
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

  it("never sends a real token: the session cookie authenticates /api/social/*", async () => {
    const AiInsightsPanel = await load();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { summary: { content: summary } } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiInsightsPanel accountId="a1" accountLabel="@clipiro" cost={5} initialSummary={null} generatedAt={null} />);
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    await user.click(await screen.findByRole("button", { name: "Generate", hidden: false }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    // The placeholder getAuthUser() ignores in favour of the cookie (lib/client-session.ts).
    expect(headers.Authorization).toBe("Bearer cookie-session");
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
