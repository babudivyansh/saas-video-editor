// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AccountContext } from "@/lib/social/queries";

// AccountPicker -> ../shared -> lib/auth -> lib/env at module scope.
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incrWithExpire: vi.fn() },
}));

const { AccountPicker } = await import("./AccountPicker");

const account = (over: Partial<AccountContext> = {}): AccountContext => ({
  id: "acc_1",
  provider: "youtube",
  username: "divyansh",
  displayName: "Divyansh Babu",
  avatarUrl: null,
  followers: 12_000,
  status: "active",
  lastSyncedAt: new Date(Date.now() - 2 * 3_600_000),
  lastSyncStatus: "ok",
  lastSyncError: null,
  timezone: null,
  healthScore: 62,
  observed: null,
  ...over,
});

describe("AccountPicker", () => {
  it("links each account to its own scoped view", () => {
    render(<AccountPicker accounts={[account()]} />);
    const link = screen.getByRole("link", { name: /Divyansh Babu/ });
    expect(link).toHaveAttribute("href", "/dashboard/social-tracker?account=acc_1");
  });

  it("carries the existing range and granularity through the choice", () => {
    // Picking an account must not silently reset the filters the user set.
    render(<AccountPicker accounts={[account()]} query="range=90&granularity=week" />);
    const href = screen.getByRole("link", { name: /Divyansh Babu/ }).getAttribute("href")!;
    expect(href).toContain("range=90");
    expect(href).toContain("granularity=week");
    expect(href).toContain("account=acc_1");
  });

  it("keeps the comparison view reachable, just not as the default", () => {
    render(<AccountPicker accounts={[account()]} />);
    expect(screen.getByRole("link", { name: /Compare all accounts/ })).toHaveAttribute(
      "href",
      "/dashboard/social-tracker?account=all",
    );
  });

  it("shows size and health so the choice can be made without opening it", () => {
    render(<AccountPicker accounts={[account()]} />);
    expect(screen.getByText("12K")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
  });

  it("renders an unscored account as an em dash, never as 0", () => {
    render(<AccountPicker accounts={[account({ healthScore: null })]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("surfaces a broken connection on the card, before the user commits to it", () => {
    // "Engagement fell" and "we failed to fetch engagement" look identical once
    // you are inside the account, so the warning has to be here.
    render(<AccountPicker accounts={[account({ status: "needs_reauth" })]} />);
    expect(screen.getByText(/Reconnect needed/)).toBeInTheDocument();
  });

  it("distinguishes a partial sync from a failed one", () => {
    const { rerender } = render(<AccountPicker accounts={[account({ lastSyncStatus: "partial" })]} />);
    expect(screen.getByText("Last sync was incomplete")).toBeInTheDocument();
    rerender(<AccountPicker accounts={[account({ lastSyncStatus: "error" })]} />);
    expect(screen.getByText("Last sync failed")).toBeInTheDocument();
  });

  it("says when an account has never synced rather than implying it just did", () => {
    render(<AccountPicker accounts={[account({ lastSyncedAt: null })]} />);
    expect(screen.getByText("Not synced yet")).toBeInTheDocument();
  });

  it("lists every connected account", () => {
    render(
      <AccountPicker
        accounts={[account(), account({ id: "acc_2", displayName: "Oiii.Luca-ig", followers: 340 })]}
      />,
    );
    const list = screen.getAllByRole("listitem");
    expect(list).toHaveLength(2);
    expect(within(list[1]).getByText("Oiii.Luca-ig")).toBeInTheDocument();
  });
});
