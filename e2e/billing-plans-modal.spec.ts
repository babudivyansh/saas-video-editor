import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The billing PlansModal is what a signed-in customer actually buys through,
// but it had its own copy of the plan-card markup and price maths — so the
// pricing-page rebuild never reached it and it kept showing the pre-audit
// design. Both surfaces now render components/billing/PlanCard; these assert
// the modal shows the same corrected content.

const PLANS = [
  { id: "p1", slug: "sub_creator_1mo", name: "Creator (Monthly)", priceInPaise: 99900, usdPriceInCents: 1500,
    currency: "INR", credits: 60, features: ["60 credits / month", "All AI tools", "1080p exports"],
    kind: "subscription", intervalMonths: 1, monthlyCredits: 60, tier: "creator" },
  { id: "p2", slug: "sub_pro_1mo", name: "Pro (Monthly)", priceInPaise: 219900, usdPriceInCents: 2900,
    currency: "INR", credits: 160, features: ["160 credits / month", "All AI tools", "Priority rendering"],
    kind: "subscription", intervalMonths: 1, monthlyCredits: 160, tier: "pro" },
  { id: "p3", slug: "sub_studio_1mo", name: "Studio (Monthly)", priceInPaise: 499900, usdPriceInCents: 5900,
    currency: "INR", credits: 400, features: ["400 credits / month", "Priority rendering", "Dedicated support"],
    kind: "subscription", intervalMonths: 1, monthlyCredits: 400, tier: "studio" },
  { id: "p4", slug: "sub_creator_12mo", name: "Creator (Yearly)", priceInPaise: 803200, usdPriceInCents: 11999,
    currency: "INR", credits: 720, features: ["60 credits / month", "Save 33% vs monthly"],
    kind: "subscription", intervalMonths: 12, monthlyCredits: 60, tier: "creator" },
  { id: "p5", slug: "sub_pro_12mo", name: "Pro (Yearly)", priceInPaise: 1768000, usdPriceInCents: 23299,
    currency: "INR", credits: 1920, features: ["160 credits / month", "Save 33% vs monthly"],
    kind: "subscription", intervalMonths: 12, monthlyCredits: 160, tier: "pro" },
  { id: "p6", slug: "sub_studio_12mo", name: "Studio (Yearly)", priceInPaise: 4019200, usdPriceInCents: 47399,
    currency: "INR", credits: 4800, features: ["400 credits / month", "Save 33% vs monthly"],
    kind: "subscription", intervalMonths: 12, monthlyCredits: 400, tier: "studio" },
];

const USER = {
  id: "e2e-modal-user", email: "modal@example.com", phone: null, credits: 120,
  createdAt: new Date("2026-01-15").toISOString(), role: "USER",
  firstName: "Mo", lastName: "Dal", name: "Mo Dal", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: new Date(Date.now() + 20 * 86400_000).toISOString(),
  subscriptionCancelledAt: null, nextRefillAt: null, monthlyCredits: 160,
  trialUsedAt: new Date().toISOString(), trialEndsAt: null,
  paymentFailedAt: null, paymentFailureCount: 0,
  creditBalances: { bonus: 0, subscription: 40, purchased: 80, total: 120 },
  plan: { id: "p2", slug: "sub_pro_1mo", name: "Pro (Monthly)", credits: 160, priceInPaise: 219900 },
};

test("the billing plans modal shows the same corrected cards as /pricing", async ({ page, baseURL }) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: USER }) }));
  await page.route("**/api/plans", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plans: PLANS }) }));
  await page.route("**/api/coupons/active", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ coupons: [] }) }));
  await page.route("**/api/generations/summary**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ byDay: [], byTool: [], byModel: [] }) }));
  await page.route("**/api/generations?**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generations: [], nextCursor: null }) }));
  await page.route("**/api/auth/purchases", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ purchases: [] }) }));
  await page.route("**/api/billing/auto-topup", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ autoTopupPackSlug: null }) }));

  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-modal-session" }),
    url: baseURL!,
  }]);

  await page.goto("/billing");
  await page.getByRole("button", { name: "Manage plan" }).click();
  await page.getByRole("button", { name: "Change plan" }).click();

  const modal = page.getByRole("dialog", { name: "Plans and top-ups" });
  await expect(modal).toBeVisible();

  // The cumulative framing from /pricing, which the modal never had.
  await expect(modal.getByText("Everything in Creator, plus:")).toBeVisible();
  await expect(modal.getByText("Everything in Pro, plus:")).toBeVisible();

  // Derived tier copy, not the stale seeded features.
  await expect(modal.getByText("No watermark, full-resolution exports")).toBeVisible();
  await expect(modal.getByText("Nano Banana Pro — Studio-only image model")).toBeVisible();

  // The claims the audit corrected must not reappear from Plan.features, which
  // still carries them in existing databases.
  await expect(modal.getByText("1080p exports")).toHaveCount(0);
  await expect(modal.getByText("Dedicated support")).toHaveCount(0);
  // The credits line is rendered once by the card, not repeated as a bullet.
  await expect(modal.getByText("160 credits / month")).toHaveCount(0);

  // The viewer is on Pro (Monthly) — the card says so.
  await expect(modal.getByText("Current")).toBeVisible();

  // Badge on one line, as on /pricing.
  const badge = modal.getByText("Most Popular");
  await expect(badge).toBeVisible();
  const box = await badge.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(28);
});
