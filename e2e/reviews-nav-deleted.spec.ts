import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Small regression check for the P11 deletion: the old self-serve review
// page and its sidebar entry must both be gone — reviews are 100%
// trigger-driven now (popup + email only).
test("dashboard/reviews no longer resolves and the sidebar has no My Review item", async ({ page, baseURL }) => {
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
  await page.route("**/api/quests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quests: [], earnedXp: 0, remaining: 0, level: 1, allComplete: false }),
    }),
  );

  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-fake-token");
  });
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: signToken({ userId: "e2e-fake-user", email: "e2e@example.com", sessionId: "e2e-fake-session" }),
      url: baseURL,
    },
  ]);

  const response = await page.goto("/dashboard/reviews");
  expect(response?.status()).toBe(404);

  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "My Review" })).toHaveCount(0);
  await expect(page.locator('a[href="/dashboard/reviews"]')).toHaveCount(0);
});
