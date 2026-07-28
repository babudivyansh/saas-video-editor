import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// A rejected review's only path back to editing is the ?editReview=1 deep
// link (from the rejection email/notification) — /dashboard/reviews no
// longer exists. ReviewPromptProvider's DeepLinkWatcher (mounted globally in
// DashboardShell) picks up the param on any /dashboard/* page and opens the
// modal directly in mode:"edit", skipping the star-pick step and
// pre-filling from GET /api/reviews/me.
test("?editReview=1 opens the modal pre-filled and resubmits via PATCH", async ({ page, baseURL }) => {
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

  await page.route("**/api/reviews/me", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          review: {
            id: "rev-1",
            rating: 3,
            title: "It was okay",
            body: "The export took a while and the captions needed cleanup.",
            featureUsed: "ai_video_editor",
            status: "rejected",
            rejectionReason: "Please avoid mentioning competitor names.",
            wouldRecommend: null,
            publicDisplayConsent: true,
            company: null,
            country: null,
            attachments: [],
          },
          eligibility: null,
        }),
      });
    }
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ review: { id: "rev-1", status: "pending" } }),
      });
    }
    return route.continue();
  });

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

  await page.goto("/dashboard?editReview=1");

  await expect(page.getByRole("heading", { name: "Edit your review" })).toBeVisible();
  await expect(page.getByPlaceholder("What did you use Clipiro for, and how did it go?")).toHaveValue(
    "The export took a while and the captions needed cleanup.",
  );

  // The ?editReview=1 param should be stripped from the URL once handled.
  await expect(page).toHaveURL(/\/dashboard(?!.*editReview)/);

  await page.getByPlaceholder("Sum up your experience").fill("Better after a rewrite");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Your review has been updated")).toBeVisible();
});
