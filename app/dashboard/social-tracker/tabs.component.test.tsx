// @vitest-environment jsdom
//
// Structural cover for the views beside the Overview: Posts, Settings and the
// composer. Each renders its own content, and Posts falls back to the shared
// empty state rather than crashing when no account is connected. Same reason as
// page.component.test.tsx — these are Server Components reading Prisma, which
// the hermetic Playwright suite cannot reach.
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
    aiInsight: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    socialReportRun: { findMany: vi.fn(async () => []) },
    socialReportConfig: { findMany: vi.fn(async () => []) },
    socialReportLink: { findMany: vi.fn(async () => []) },
    clipPublish: { findMany: vi.fn(async () => [{ id: "turn", clip: { videoUrl: "https://cdn.example/v.mp4" }, asset: null }]) },
    clip: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    asset: { findMany: vi.fn(async () => []) },
  },
}));

const listPosts = vi.fn(async (..._a: unknown[]) => ({ posts: [] as unknown[], nextCursor: null as string | null }));
vi.mock("@/lib/mobile/posts", () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: async (u: string | null) => u }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: async (k: string) => `https://cdn.example/${k}` }));

const account = (over: Partial<AccountContext> = {}): AccountContext => ({
  id: "acc-1", provider: "youtube", username: "chan", displayName: "Chan",
  avatarUrl: null, followers: 100, status: "active", lastSyncedAt: new Date(),
  lastSyncStatus: "ok", lastSyncError: null, timezone: "UTC",
  healthScore: null, observed: null,
  ...over,
});

const TABS = [
  { name: "posts", load: () => import("./posts/page") },
  { name: "settings", load: () => import("./settings/page") },
  { name: "new", load: () => import("./new/page") },
] as const;

const withParams = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  listPosts.mockResolvedValue({ posts: [], nextCursor: null });
});

// The first import of each page pulls the provider and publishing modules in
// cold, which alone can pass the 5s default on a slow machine.
describe("Social Tracker tabs", { timeout: 30_000 }, () => {
  it.each(TABS.filter((t) => t.name === "posts"))(
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
    render(await Page(withParams));

    // The composer is a full-screen dialog portalled to <body>, so look there.
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
    expect(screen.queryByText(/no connected accounts yet/i)).not.toBeInTheDocument();
  });

  // The schedule used to exist only in the mobile app: an Instagram post that
  // came due had nowhere on the web to be finished.
  it("lists a due Instagram post under Needs you with the video and caption to hand over", async () => {
    const acc = account();
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [acc], allAccounts: [acc],
      filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
    });
    listPosts.mockResolvedValue({
      posts: [{
        id: "turn", clipId: "c1", assetId: null, title: "Podcast hook", thumbnailUrl: null,
        account: { id: "ig", provider: "instagram", name: "Chan" }, caption: "Hello", hashtags: ["#hi"],
        privacy: "public", status: "your_turn", scheduledAt: "2026-11-17T10:00:00.000Z",
        publishedAt: null, permalink: null, failureReason: null, editable: false,
      }],
      nextCursor: null,
    });

    const Page = (await import("./posts/page")).default;
    render(await Page({ searchParams: Promise.resolve({ filter: "needs-you" }) }));

    expect(screen.getByText("Podcast hook")).toBeInTheDocument();
    for (const name of ["Download video", "Copy caption", "Mark as posted"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("opens the composer at its four steps", async () => {
    const acc = account();
    loadViewContext.mockResolvedValue({
      userId: "u1", accounts: [acc], allAccounts: [acc],
      filters: { range: 30, granularity: "day", scope: { kind: "unset" } },
    });

    const Page = (await import("./new/page")).default;
    render(await Page(withParams));

    for (const step of ["Video", "Where", "Caption", "When"]) {
      expect(screen.getByRole("heading", { name: new RegExp(step) })).toBeInTheDocument();
    }
    // Nothing chosen yet, so nothing can be submitted.
    expect(screen.getByRole("button", { name: "Post now" })).toBeDisabled();
  });
});
