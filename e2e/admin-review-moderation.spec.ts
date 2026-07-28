import { test, expect } from "@playwright/test";

// Admin moderation happy path, mocked at the network boundary — no real DB
// user, no real elevation flow. /admin isn't in proxy.ts's server-side
// PROTECTED_PAGE_PREFIXES list; access control is entirely client-side
// (AdminShell.tsx checks role + elevation), so no signed session cookie is
// needed here, unlike the /dashboard/* e2e specs.
test("admin approves a pending review from the moderation queue", async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-admin",
          email: "admin@example.com",
          phone: null,
          credits: 0,
          createdAt: new Date().toISOString(),
          role: "ADMIN",
          firstName: "Admin",
          lastName: "User",
          name: "Admin User",
          avatarUrl: null,
          gender: null,
          intendedUse: null,
          subscriptionEndsAt: null,
          nextRefillAt: null,
          monthlyCredits: 0,
          plan: null,
        },
      }),
    }),
  );

  await page.route("**/api/admin/elevate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elevated: true }) }),
  );

  let status = "pending";
  const review = {
    id: "rev-1",
    rating: 5,
    title: "Great tool",
    body: "Turned my podcast into clips fast.",
    featureUsed: "auto_clips",
    verifiedCustomer: true,
    pinned: false,
    spamScore: 0,
    reportCount: 0,
    helpfulCount: 0,
    createdAt: new Date().toISOString(),
    user: { id: "u1", email: "reviewer@example.com", name: "Reviewer One" },
  };

  await page.route("**/api/admin/reviews?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reviews: status === "pending" ? [{ ...review, status }] : [], total: status === "pending" ? 1 : 0 }),
    }),
  );

  await page.route("**/api/admin/reviews/rev-1/moderate", (route) => {
    status = "published";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ review: { ...review, status } }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-fake-admin-token");
  });

  await page.goto("/admin/reviews");

  await expect(page.getByText("Great tool")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No reviews in this view.")).toBeVisible();
});
