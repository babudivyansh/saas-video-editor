// @vitest-environment jsdom
//
// The Overview is a Server Component that reads Prisma directly, so Playwright's
// page.route mocking cannot reach its data — the whole e2e suite is hermetic and
// nothing in it touches the DB. Rendering the awaited component with the query
// layer mocked is the only way to cover these branches, and they are exactly the
// ones a restyle can silently break: the empty state, the account picker, the
// single-account short-circuit, and the follower fallback.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { METRIC_KEYS, type MetricKey, type Support } from "@/lib/social/capabilities";
import type { AccountContext } from "@/lib/social/queries";
import type { ValueUnit } from "@/app/components/charts/format";

// The page's client islands (QuickActions, KpiGrid…) reach for the auth token
// and the toast host, which the real layout provides and a bare render does not.
vi.mock("@/app/components/AuthContext", () => ({
  useAuth: () => ({ token: "test-token", user: { id: "u1" }, isLoading: false }),
}));
vi.mock("@/app/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const loadViewContext = vi.fn();
vi.mock("./shared", async (orig) => ({
  ...(await orig<typeof import("./shared")>()),
  loadViewContext: (...a: unknown[]) => loadViewContext(...a),
}));

const loadAccountKpis = vi.fn();
const loadSeries = vi.fn(async () => ({ points: [] }));
vi.mock("@/lib/social/queries", () => ({
  loadAccounts: vi.fn(async () => []),
  loadAccountKpis: (...a: unknown[]) => loadAccountKpis(...a),
  loadSeries: (...a: unknown[]) => loadSeries(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialGoal: { findMany: vi.fn(async () => []) },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    socialPost: { findMany: vi.fn(async () => []) },
  },
}));

// The chart kit measures its own SVG; none of these assertions are about it.
vi.mock("@/app/components/charts", () => ({
  Gauge: ({ label }: { label: string }) => <div data-testid="gauge">{label}</div>,
  Sparkline: () => <div data-testid="sparkline" />,
  TimeSeriesChart: () => <div data-testid="timeseries" />,
  Heatmap: () => <div data-testid="heatmap" />,
}));

const OverviewPage = (await import("./page")).default;

function account(over: Partial<AccountContext> = {}): AccountContext {
  return {
    id: "acc-1", provider: "youtube", username: "chan", displayName: "Chan",
    avatarUrl: null, followers: 100, status: "active", lastSyncedAt: new Date(),
    lastSyncStatus: "ok", lastSyncError: null, timezone: "UTC",
    healthScore: null, observed: null,
    ...over,
  };
}

/** A full KPI set, every metric unavailable unless overridden. */
function kpis(over: Partial<Record<MetricKey, { current: number | null; previous: number | null; available: Support; unit?: ValueUnit }>> = {}) {
  const set = {} as Record<MetricKey, { current: number | null; previous: number | null; deltaPct: number | null; available: Support; unit: ValueUnit }>;
  for (const m of METRIC_KEYS) {
    const o = over[m];
    set[m] = {
      current: o?.current ?? null, previous: o?.previous ?? null, deltaPct: null,
      available: o?.available ?? "unavailable", unit: o?.unit ?? "count",
    };
  }
  return set;
}

function accountKpis(acc: AccountContext, over?: Parameters<typeof kpis>[0]) {
  return {
    account: acc,
    kpis: kpis(over),
    derived: { averageViews: null, dailyGrowth: null, weeklyGrowth: null, monthlyGrowth: null },
    completeness: 1,
    capabilities: Object.fromEntries(METRIC_KEYS.map((m) => [m, "native"])) as Record<MetricKey, Support>,
  };
}

const render_ = (params: Record<string, string> = {}) =>
  OverviewPage({ searchParams: Promise.resolve(params) }).then((ui) => render(ui));

beforeEach(() => {
  vi.clearAllMocks();
  loadSeries.mockResolvedValue({ points: [] });
});

describe("Social Tracker Overview", () => {
  it("shows the connect-an-account empty state when nothing is connected", async () => {
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [], allAccounts: [],
      filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
    });

    await render_();

    expect(screen.getByText("No connected accounts yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect an account/i })).toHaveAttribute(
      "href",
      "/dashboard/social-tracker/settings",
    );
  });

  it("asks which account to view when several are connected and none is chosen", async () => {
    loadViewContext.mockResolvedValue({
      userId: "u1",
      accounts: [],
      allAccounts: [account(), account({ id: "acc-2", displayName: "Second" })],
      filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
    });

    await render_();

    expect(screen.getByText("Chan")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(loadAccountKpis).not.toHaveBeenCalled();
  });

  // Offering a choice of one is just an extra click.
  it("skips the picker for a single account and renders the dashboard", async () => {
    const acc = account();
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [acc], allAccounts: [acc],
      filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
    });
    loadAccountKpis.mockResolvedValue(accountKpis(acc));

    await render_();

    expect(loadAccountKpis).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("gauge")).toBeInTheDocument(); // health, single-account only
  });

  // Regression: YouTube sends snapshots but no daily follower column, so the
  // tile went blank while the account card beside it said 94.
  it("falls back to the snapshot follower count when the daily series has none", async () => {
    const a = account({ id: "acc-1", followers: 60 });
    const b = account({ id: "acc-2", followers: 34, displayName: "Second" });
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [a, b], allAccounts: [a, b],
      filters: { range: 30, granularity: "day", scope: { kind: "all" } },
    });
    loadAccountKpis.mockImplementation(async (acc: AccountContext) =>
      accountKpis(acc, { followers: { current: null, previous: null, available: "native" } }),
    );

    await render_();

    // 60 + 34 — summed from the snapshot copies, not left as a dash.
    expect(screen.getByText("94")).toBeInTheDocument();
  });

  it("weights a rate metric by followers rather than averaging it flat", async () => {
    const big = account({ id: "big", followers: 1000 });
    const tiny = account({ id: "tiny", followers: 10, displayName: "Tiny" });
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [big, tiny], allAccounts: [big, tiny],
      filters: { range: 30, granularity: "day", scope: { kind: "all" } },
    });
    loadAccountKpis.mockImplementation(async (acc: AccountContext) =>
      accountKpis(acc, {
        engagementRate: {
          // A freak 40% on a 10-follower account must not drag the portfolio
          // above every real number. Weighted: (2*1000 + 40*10)/1010 ≈ 2.38%.
          current: acc.id === "big" ? 2 : 40,
          previous: null,
          available: "native",
          unit: "percent",
        },
      }),
    );

    await render_();

    expect(screen.queryByText(/^21(\.0)?%$/)).not.toBeInTheDocument(); // the flat mean
    expect(screen.getByText(/^2\.[34]%$/)).toBeInTheDocument();
  });
});
