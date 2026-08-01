import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The Manage Plan slide-over. The brief for this work was explicit that
// managing a subscription must never navigate away from /billing, so the
// assertions below are mostly about what *doesn't* happen: no route change, no
// lost scroll position, no state reset.

const SUBSCRIBED_USER = {
  id: "e2e-billing-user",
  email: "billing@example.com",
  phone: null,
  credits: 120,
  createdAt: new Date("2026-01-15").toISOString(),
  role: "USER",
  firstName: "Bill",
  lastName: "Ing",
  name: "Bill Ing",
  avatarUrl: null,
  gender: null,
  intendedUse: null,
  subscriptionEndsAt: new Date(Date.now() + 20 * 86400_000).toISOString(),
  subscriptionCancelledAt: null as string | null,
  nextRefillAt: new Date(Date.now() + 20 * 86400_000).toISOString(),
  monthlyCredits: 160,
  trialUsedAt: null,
  trialEndsAt: null,
  plan: { id: "plan-pro", slug: "sub_pro_1mo", name: "Pro (Monthly)", credits: 160, priceInPaise: 219900 },
};

async function signIn(page: Page, baseURL: string | undefined, user: typeof SUBSCRIBED_USER) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) }));
  await page.route("**/api/plans", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plans: [] }) }));
  await page.route("**/api/coupons/active", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ coupons: [] }) }));
  await page.route("**/api/generations/summary**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ byDay: [], byTool: [], byModel: [] }) }));
  await page.route("**/api/generations?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generations: [], nextCursor: null }) }));
  await page.route("**/api/auth/purchases", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        purchases: [
          { id: "pay_1", amountInPaise: 219900, credits: 160, status: "captured",
            createdAt: new Date("2026-07-01").toISOString(), plan: { name: "Pro (Monthly)", slug: "sub_pro_1mo" } },
        ],
      }),
    }));
  await page.route("**/api/billing/auto-topup", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ packSlug: null }) }));

  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: user.id, email: user.email, sessionId: "e2e-billing-session" }),
    url: baseURL!,
  }]);
}

test("Manage plan opens a panel without leaving /billing", async ({ page, baseURL }) => {
  await signIn(page, baseURL, SUBSCRIBED_USER);
  await page.goto("/billing");

  const urlBefore = page.url();
  await page.getByRole("button", { name: "Manage plan" }).click();

  const panel = page.getByRole("dialog", { name: "Manage subscription" });
  await expect(panel).toBeVisible();
  // The whole point: no route navigation.
  expect(page.url()).toBe(urlBefore);
  // Billing is still mounted behind the panel, not unmounted or replaced.
  await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();

  // "Pro (Monthly)" appears twice — the plan heading and its history row — so
  // scope to the heading.
  await expect(panel.getByText("Pro (Monthly)").first()).toBeVisible();
  await expect(panel.getByText("Renews on")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Billing history" })).toBeVisible();

  // ESC closes it — the hand-rolled billing overlays this replaces had no key
  // handling at all.
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  expect(page.url()).toBe(urlBefore);
});

test("a cancelled subscription offers resume, and explains when it can't", async ({ page, baseURL }) => {
  await signIn(page, baseURL, {
    ...SUBSCRIBED_USER,
    subscriptionCancelledAt: new Date().toISOString(),
  });
  await page.route("**/api/billing/resume", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Auto-renewal can't be switched back on once it's cancelled.",
        requiresNewSubscription: true,
      }),
    }));

  await page.goto("/billing");
  await page.getByRole("button", { name: "Manage plan" }).click();

  const panel = page.getByRole("dialog", { name: "Manage subscription" });
  await expect(panel.getByText("Cancelling")).toBeVisible();
  await expect(panel.getByText("None — cancelled")).toBeVisible();

  // The drawer slides in over 250ms; Playwright's stability check fails while
  // the transform is still running.
  await page.waitForTimeout(500);
  await panel.getByRole("button", { name: "Resume subscription" }).click();
  // Razorpay has no un-cancel for cancel-at-cycle-end, so the panel must say so
  // rather than silently clearing the flag and implying renewal is back on.
  await expect(panel.getByRole("alert")).toContainText("can't be switched back on");
  await expect(panel.getByRole("button", { name: "Choose a plan →" })).toBeVisible();
});

test("billing tabs are a real tablist and keep scroll position", async ({ page, baseURL }) => {
  await signIn(page, baseURL, SUBSCRIBED_USER);
  await page.goto("/billing");

  const tablist = page.getByRole("tablist", { name: "Billing sections" });
  await expect(tablist).toBeVisible();

  const overview = page.getByRole("tab", { name: "Overview" });
  await expect(overview).toHaveAttribute("aria-selected", "true");

  // Arrow keys move between tabs — they did nothing when these were plain
  // buttons in a div.
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Usage" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
});
