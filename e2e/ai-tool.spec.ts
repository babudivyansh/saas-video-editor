import { test, expect } from "@playwright/test";

// Happy-path test for an AI tool (Brainstormer) with the provider mocked at
// the network boundary — no real Gemini call, no real DB user. Both
// /api/auth/me (so AuthContext accepts the fake token) and
// /api/tools/brainstormer (the actual generation call) are intercepted
// client-side, so this test is fully hermetic and safe to run anywhere.
test("brainstormer generates ideas from a mocked provider response", async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-fake-user",
          email: "e2e@example.com",
          phone: null,
          credits: 10,
          createdAt: new Date().toISOString(),
          role: "USER",
          firstName: "E2E",
          lastName: "User",
          name: "E2E User",
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

  await page.route("**/api/tools/brainstormer", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ideas: [
          { title: "Mocked idea one", description: "A canned description for idea one." },
          { title: "Mocked idea two", description: "A canned description for idea two." },
        ],
      }),
    }),
  );

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-fake-token");
  });

  await page.goto("/dashboard/tools/brainstormer");

  await page.getByPlaceholder("Generate ideas for a niche to start a page on").fill("Gardening tips");
  await page.getByRole("button", { name: /generate ideas/i }).click();

  await expect(page.getByText("Mocked idea one")).toBeVisible();
  await expect(page.getByText("Mocked idea two")).toBeVisible();
});
