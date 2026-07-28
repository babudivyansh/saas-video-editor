import { test, expect } from "@playwright/test";

// Voting on the public /reviews page, mocked at the network boundary. The
// page's initial paint is real SSR data (likely empty in a fresh DB); typing
// in the search box triggers ReviewsPageClient's client-side fetch to
// GET /api/reviews, which this mocks to return one review — same technique
// as e2e/admin-review-moderation.spec.ts's query-string route mock.
test("logged-out visitor is prompted to log in before voting", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }));

  const review = {
    id: "rev-1",
    rating: 5,
    title: "Great tool",
    body: "Turned my podcast into clips fast.",
    featureUsed: "auto_clips",
    verifiedCustomer: true,
    pinned: false,
    helpfulCount: 2,
    notHelpfulCount: 0,
    reportCount: 0,
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: { name: "Reviewer One", avatarUrl: null },
    badges: ["verified_customer"],
    reply: null,
    attachments: [],
  };

  await page.route("**/api/reviews?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [review],
        nextCursor: null,
        summary: { average: 5, count: 1, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 } },
      }),
    }),
  );

  await page.goto("/reviews");
  await page.getByPlaceholder("Search reviews…").fill("podcast");

  await expect(page.getByText("Great tool")).toBeVisible();

  // Clicking Helpful while logged out opens the auth modal instead of voting.
  await page.getByRole("button", { name: /Helpful/ }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
