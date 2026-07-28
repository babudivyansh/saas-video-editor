import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Happy-path test for submitting a review through the redesigned inline
// modal — reviews are 100% trigger-driven now (no /dashboard/reviews page),
// so this fires the trigger the same way e2e/reviews-prompt-flow.spec.ts
// does (a mocked Auto Clip batch completion), then walks the modal's
// rate -> details -> attachments -> thanks steps, mocked at the network
// boundary — no real DB user, no real eligibility check.
test("submits a review through the trigger-driven modal and reaches the attachments step", async ({ page, baseURL }) => {
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

  await page.route("**/api/projects/proj-1/clips", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: { status: "completed", warnings: null, captionStyleIndex: null, uploadedVideoUrl: null },
        clips: [{ id: "clip-1", status: "ready", index: 0, title: "Clip 1", startSec: 0, endSec: 10, durationSec: 10, aspectRatio: "9:16" }],
      }),
    }),
  );

  await page.route("**/api/reviews/prompt-check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shouldPrompt: true, trigger: "autoclips_milestone" }),
    }),
  );

  await page.route("**/api/reviews", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
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

  await page.goto("/dashboard/create/auto-clip?project=proj-1");
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).toBeVisible();

  await page.getByRole("radio", { name: "5 stars" }).click();
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).not.toBeVisible();

  await page.getByPlaceholder("What did you use Clipiro for, and how did it go?").fill("Turned my podcast into clips fast.");
  await page.getByPlaceholder("Sum up your experience").fill("Great tool");
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Submit review" }).click();

  await expect(page.getByRole("heading", { name: "Add photos or a video (optional)" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await expect(page.getByText("Thank you for your review!")).toBeVisible();
});
