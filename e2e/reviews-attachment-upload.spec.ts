import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Attachment upload now happens inline in the review modal's "attachments"
// step, right after a first submission (no more separate "Edit review" page)
// — mocked at the network boundary, same pattern as e2e/reviews-submit.spec.ts.
test("uploads an attachment during the post-submit attachments step and sees the thumbnail", async ({ page, baseURL }) => {
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

  await page.route("**/api/reviews/me/attachments", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ attachment: { id: "att-1", kind: "image", url: "https://example.com/fake-photo.png" } }),
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

  await page.goto("/dashboard/create/auto-clip?project=proj-1");
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).toBeVisible();

  await page.getByRole("radio", { name: "4 stars" }).click();
  await page.getByPlaceholder("What did you use Clipiro for, and how did it go?").fill("Turned my podcast into clips fast.");
  await page.getByRole("button", { name: "Submit review" }).click();

  await expect(page.getByRole("heading", { name: "Add photos or a video (optional)" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });

  await expect(page.locator('img[src="https://example.com/fake-photo.png"]')).toBeVisible();
});
