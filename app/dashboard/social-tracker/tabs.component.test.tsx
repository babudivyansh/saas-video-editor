// @vitest-environment jsdom
//
// Structural cover for the five non-Overview tabs. They are being restyled, not
// restructured, so this asserts what a restyle must not change: each tab renders
// its own content, and each falls back to the shared empty state rather than
// crashing when no account is connected. Same reason as page.component.test.tsx
// — these are Server Components reading Prisma, which the hermetic Playwright
// suite cannot reach.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AccountContext } from "@/lib/social/queries";

// Client islands in these tabs reach for the router, translations, auth and
// toasts — all provided by the real layout, none by a bare render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/social-tracker",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
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

const loadAudience = vi.fn(async () => ({ rows: [], capturedAt: null }));
vi.mock("@/lib/social/queries", () => ({
  loadAccounts: vi.fn(async () => []),
  loadAudience: (...a: unknown[]) => loadAudience(...a),
}));

vi.mock("@/lib/tool-config", () => ({
  getToolConfig: vi.fn(async () => ({ enabled: true, creditCost: 3 })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialPost: { findMany: vi.fn(async () => []) },
    socialGoal: { findMany: vi.fn(async () => []) },
    aiInsight: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    competitorProfile: { findMany: vi.fn(async () => []) },
    socialReportRun: { findMany: vi.fn(async () => []) },
    socialReportConfig: { findMany: vi.fn(async () => []) },
    socialReportLink: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/app/components/charts", () => ({
  Heatmap: () => <div data-testid="heatmap" />,
  BLOCK_LABELS: [] as string[],
  WEEKDAY_LABELS: [] as string[],
}));

const account = (over: Partial<AccountContext> = {}): AccountContext => ({
  id: "acc-1", provider: "youtube", username: "chan", displayName: "Chan",
  avatarUrl: null, followers: 100, status: "active", lastSyncedAt: new Date(),
  lastSyncStatus: "ok", lastSyncError: null, timezone: "UTC",
  healthScore: null, observed: null,
  ...over,
});

const TABS = [
  { name: "content", load: () => import("./content/page") },
  { name: "audience", load: () => import("./audience/page") },
  { name: "competitors", load: () => import("./competitors/page") },
  { name: "reports", load: () => import("./reports/page") },
  { name: "settings", load: () => import("./settings/page") },
] as const;

const withParams = { searchParams: Promise.resolve({}) };

beforeEach(() => vi.clearAllMocks());

describe("Social Tracker tabs", () => {
  // Settings is deliberately excluded: it's where you go to connect your first
  // account, so it must render with none.
  it.each(TABS.filter((t) => t.name !== "settings"))(
    "$name falls back to the empty state with no connected accounts",
    async ({ load }) => {
      loadViewContext.mockResolvedValue({
        userId: "u1", accounts: [], allAccounts: [],
        filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
      });

      const Page = (await load()).default;
      render(await Page(withParams));

      expect(screen.getByText(/no connected accounts yet/i)).toBeInTheDocument();
    },
  );

  it.each(TABS)("$name renders without throwing when an account is connected", async ({ load }) => {
    const acc = account();
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [acc], allAccounts: [acc],
      filters: { range: 30, granularity: "day", scope: { kind: "one", id: acc.id } },
    });

    const Page = (await load()).default;
    const { container } = render(await Page(withParams));

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.queryByText(/no connected accounts yet/i)).not.toBeInTheDocument();
  });
});
