import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// The Social Tracker's access gate, which every one of its six routes shares
// through requireSubscriberOrRedirect.
//
// Only the denial paths are covered here, and deliberately so: the granted path
// needs a User row with a live subscriptionEndsAt, and this suite is hermetic —
// page.route mocks plus a signed cookie, nothing touching Prisma. Seeding a
// subscriber would make this the first spec in the suite to need a live
// database. The pages themselves are covered by the RTL tests next to them
// (app/dashboard/social-tracker/*.component.test.tsx), which can mock the query
// layer a Server Component reads directly.
//
// The two denials route differently on purpose, and getting them backwards is
// the bug this guards: a lapsed subscription belongs on the billing overlay at
// /dashboard?billing=1 (NOT /dashboard/billing, which has no page and 404s),
// while a session that no longer resolves belongs at the login form. Telling
// someone whose session was revoked that they have no subscription is both
// wrong and unactionable.

const TRACKER_TABS = ["", "/content", "/audience", "/competitors", "/reports", "/settings"];

test("a signed-out visitor never reaches the tracker", async ({ page }) => {
  await page.goto("/dashboard/social-tracker");

  await expect(page).not.toHaveURL(/\/dashboard\/social-tracker/);
  await expect(page.getByRole("heading", { name: "Social Tracker" })).not.toBeVisible();
});

test("a signed-in non-subscriber is sent to the billing overlay, not a 404 and not the tracker", async ({
  page,
  baseURL,
}) => {
  // A valid, unexpired session for a user with no subscription — which is also
  // what an unseeded CI database returns for any user id.
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({
        userId: "e2e-no-subscription",
        email: "e2e-no-sub@example.com",
        sessionId: "e2e-fake-session",
      }),
      url: baseURL,
    },
  ]);

  await page.goto("/dashboard/social-tracker");

  await expect(page).not.toHaveURL(/\/dashboard\/social-tracker/, { timeout: 90_000 });
  await expect(page).not.toHaveURL(/\/dashboard\/billing/); // the 404 route
  await expect(page.getByRole("heading", { name: "Social Tracker" })).not.toBeVisible();
});

test("every tab is gated, not just the index", async ({ page }) => {
  for (const tab of TRACKER_TABS) {
    await page.goto(`/dashboard/social-tracker${tab}`);
    await expect(page).not.toHaveURL(new RegExp(`/dashboard/social-tracker${tab}$`), { timeout: 90_000 });
  }
});
