// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KpiCard } from "./KpiCard";
import { KpiGrid, type KpiEntry } from "./KpiGrid";

// framer-motion's useReducedMotion reads matchMedia, which jsdom does not
// implement. Controlled per-test so both motion paths are exercised.
let prefersReducedMotion = false;
vi.mock("framer-motion", () => ({ useReducedMotion: () => prefersReducedMotion }));

beforeEach(() => {
  prefersReducedMotion = true; // default: no animation, so values assert cleanly
});

describe("KpiCard — the three states", () => {
  // The distinction the v1 dashboard could not express, and the reason a
  // "show all KPIs" dashboard is honest rather than misleading.

  it("renders a real value when the metric is available", () => {
    render(
      <KpiCard metric="followers" label="Total followers" available="native" unit="count" value={12481} />,
    );
    expect(screen.getByText("12.5K")).toBeInTheDocument();
    expect(screen.queryByText(/Not available/)).not.toBeInTheDocument();
  });

  it("distinguishes a genuine zero from missing data", () => {
    render(<KpiCard metric="shares" label="Shares" available="native" unit="count" value={0} />);
    // A real zero must read as zero, not as an em dash.
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText(/Collecting/)).not.toBeInTheDocument();
  });

  it("says 'Collecting' when supported but not yet synced", () => {
    render(<KpiCard metric="reach" label="Total reach" available="native" unit="count" value={null} />);
    expect(screen.getByText(/Collecting/)).toBeInTheDocument();
    // Not the same as unavailable — no platform limitation is being claimed.
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
  });

  it("greys out an unsupported metric and states the limitation", () => {
    render(
      <KpiCard
        metric="impressions"
        label="Total impressions"
        available="unavailable"
        unit="count"
        value={null}
        reason="YouTube exposes impressions only in YouTube Studio."
      />,
    );
    expect(screen.getByText("Not available")).toBeInTheDocument();
    // Twice on purpose: once as the hover tooltip, once as sr-only text on the
    // focusable tile, so the explanation reaches both sighted and AT users.
    expect(screen.getAllByText(/YouTube Studio/)).toHaveLength(2);
  });

  it("keeps the explanation reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(
      <KpiCard
        metric="ctr"
        label="Click-through rate"
        available="unavailable"
        unit="percent"
        value={null}
        reason="Impression CTR is a Studio-only metric."
      />,
    );
    // aria-disabled, not disabled: a user must be able to tab to it and find
    // out WHY the tile is empty.
    const tile = screen.getByText("Click-through rate").closest("[aria-disabled]")!;
    expect(tile).toHaveAttribute("tabindex", "0");
    await user.tab();
    expect(tile).toHaveFocus();
  });

  it("never shows a number for an unavailable metric", () => {
    // Even if a caller passes one through — the greyed state is a hard rule.
    render(
      <KpiCard
        metric="impressions"
        label="Impressions"
        available="unavailable"
        unit="count"
        value={9999}
        reason="Not exposed by this platform's API."
      />,
    );
    expect(screen.queryByText("10K")).not.toBeInTheDocument();
    expect(screen.queryByText("9999")).not.toBeInTheDocument();
  });
});

describe("KpiCard delta", () => {
  it("pairs direction with a glyph, never colour alone", () => {
    render(
      <KpiCard metric="views" label="Views" available="native" unit="count" value={150} previous={100} deltaPct={50} />,
    );
    expect(screen.getByText("↑")).toBeInTheDocument();
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/up versus the previous period/)).toBeInTheDocument();
  });

  it("shows the previous-period value for context", () => {
    render(
      <KpiCard metric="views" label="Views" available="native" unit="count" value={150} previous={100} deltaPct={50} />,
    );
    expect(screen.getByText("was 100")).toBeInTheDocument();
  });

  it("treats a rise as bad for metrics where rising is bad", () => {
    const { container } = render(
      <KpiCard
        metric="followersLost"
        label="Followers lost"
        available="native"
        unit="count"
        value={120}
        deltaPct={30}
        invertDelta
      />,
    );
    // Arrow still points up — the movement is up — but it is styled as harmful.
    // Asserts the error TOKEN, not a stock palette class: the delta colour was
    // text-red-600 before the emerald migration, and pinning the literal is what
    // made this test fail silently when the token replaced it.
    expect(screen.getByText("↑")).toBeInTheDocument();
    expect(container.querySelector(".text-error")).not.toBeNull();
    expect(container.querySelector(".text-success")).toBeNull();
  });

  it("reads a negligible change as flat", () => {
    render(<KpiCard metric="views" label="Views" available="native" unit="count" value={100} deltaPct={0.01} />);
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText(/no change/)).toBeInTheDocument();
  });
});

describe("KpiCard formatting", () => {
  it("formats by unit", () => {
    const { rerender } = render(
      <KpiCard metric="watchTimeSec" label="Watch time" available="native" unit="seconds" value={3660} />,
    );
    expect(screen.getByText("1h 01m")).toBeInTheDocument();

    rerender(
      <KpiCard metric="engagementRate" label="Engagement" available="derived" unit="percent" value={3.14} />,
    );
    expect(screen.getByText("3.1%")).toBeInTheDocument();
  });
});

describe("KpiCard motion", () => {
  it("shows the final value immediately under reduced motion", () => {
    prefersReducedMotion = true;
    render(<KpiCard metric="followers" label="Followers" available="native" unit="count" value={5000} />);
    // Skipped, not shortened — there is no count-up to observe at all.
    expect(screen.getByText("5K")).toBeInTheDocument();
  });

  it("renders the true value on first paint even when motion is allowed", () => {
    // Regression: the count-up used to start at 0, so this Server Component
    // tree emitted "0" for every live KPI — a hydration mismatch, and a brief
    // flash of numbers that are not true. Motion belongs on a value CHANGE.
    prefersReducedMotion = false;
    render(<KpiCard metric="followers" label="Followers" available="native" unit="count" value={5000} />);
    expect(screen.getByText("5K")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the true value on first paint under reduced motion too", () => {
    // Both motion paths must agree on what the server rendered.
    prefersReducedMotion = true;
    render(<KpiCard metric="views" label="Views" available="native" unit="count" value={148_900} />);
    expect(screen.getByText("148.9K")).toBeInTheDocument();
  });
  // The animation itself is not asserted: requestAnimationFrame under jsdom is
  // timing-dependent, and a flaky test here would be worse than none. What
  // matters — that first paint is correct — is covered above.
});

describe("KpiGrid", () => {
  const entry = (over: Partial<KpiEntry> = {}): KpiEntry => ({
    current: 100,
    previous: 80,
    deltaPct: 25,
    available: "native",
    unit: "count",
    ...over,
  });

  it("names every metric it is given, promoted or demoted", () => {
    render(
      <KpiGrid
        kpis={{
          followers: entry(),
          reach: entry(),
          impressions: entry({ available: "unavailable", current: null, reason: "Studio only." }),
        }}
      />,
    );
    // followers and reach are promoted into the hero row; impressions is not
    // reported by this platform, so it is named in the summary line instead of
    // taking a card that would only say "Not available".
    expect(screen.getByText("Total followers")).toBeInTheDocument();
    expect(screen.getByText("Total reach")).toBeInTheDocument();
    expect(screen.getByText(/Not reported by this platform/)).toBeInTheDocument();
    expect(screen.getByText(/impressions/)).toBeInTheDocument();
  });

  it("collapses unreported metrics into one line instead of a wall of empty cards", () => {
    render(
      <KpiGrid
        kpis={{
          followers: entry(),
          impressions: entry({ available: "unavailable", current: null, reason: "Studio only." }),
          ctr: entry({ available: "unavailable", current: null, reason: "Studio only." }),
        }}
      />,
    );
    // These used to render as two "Not available" cards, so a page could lead
    // with eight of them. Both metrics are still NAMED — the information is
    // kept — but absence no longer carries the same weight as a real number.
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
    // The label is its own <span>, so read the whole sentence off the paragraph.
    const line = screen.getByText(/Not reported by this platform/).closest("p")!;
    expect(line.textContent).toMatch(/impressions/);
    expect(line.textContent).toMatch(/click-through rate/);
  });

  it("promotes the headline metrics into a hero row with display-size type", () => {
    // The flat grid gave "Total followers" and "Click-through rate — not
    // available" identical weight, so the eye had nowhere to land.
    render(
      <KpiGrid
        kpis={{
          followers: entry({ current: 12_000 }),
          views: entry({ current: 900 }),
          reach: entry({ current: 800 }),
          engagementRate: entry({ current: 4, unit: "percent" }),
          likes: entry({ current: 5 }),
        }}
      />,
    );
    const hero = screen.getByRole("region", { name: /headline metrics/i });
    expect(within(hero).getByText("Total followers")).toBeInTheDocument();
    // Four is the cap, so a lesser metric stays in the compact grid below.
    expect(within(hero).queryByText("Likes")).not.toBeInTheDocument();
    expect(screen.getByText("Likes")).toBeInTheDocument();
  });

  it("fills the hero with reported metrics only, never with empty cards", () => {
    render(
      <KpiGrid
        kpis={{
          followers: entry({ current: 100 }),
          reach: entry({ available: "unavailable", current: null, reason: "No reach on YouTube." }),
        }}
      />,
    );
    const hero = screen.getByRole("region", { name: /headline metrics/i });
    expect(within(hero).queryByText("Total reach")).not.toBeInTheDocument();
  });

  it("keeps the benchmark band when engagement rate is promoted", () => {
    // Promoting a rate must not lose the band that gives it meaning.
    render(
      <KpiGrid
        kpis={{ engagementRate: entry({ unit: "percent", current: 2 }) }}
        benchmark={{ low: 1, high: 3.5 }}
      />,
    );
    const hero = screen.getByRole("region", { name: /headline metrics/i });
    expect(within(hero).getByText(/typical · 1–3.5%/)).toBeInTheDocument();
  });

  it("has an accessible section name", () => {
    render(<KpiGrid kpis={{ followers: entry() }} />);
    expect(screen.getByRole("region", { name: /key performance indicators/i })).toBeInTheDocument();
  });

  it("renders growth tiles from derived figures", () => {
    render(<KpiGrid kpis={{}} derived={{ dailyGrowth: 0.8, weeklyGrowth: 5.6, monthlyGrowth: 24 }} />);
    expect(screen.getByText("Daily growth")).toBeInTheDocument();
    // One decimal below 10, none above — precision where it carries information.
    expect(screen.getByText("0.8%")).toBeInTheDocument();
    expect(screen.getByText("24%")).toBeInTheDocument();
  });

  it("shows a benchmark band only on engagement rate", () => {
    render(
      <KpiGrid
        kpis={{ engagementRate: entry({ unit: "percent", current: 2 }), reach: entry() }}
        benchmark={{ low: 1, high: 3.5 }}
      />,
    );
    expect(screen.getByText(/typical · 1–3.5%/)).toBeInTheDocument();
  });
});
