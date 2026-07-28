import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Smart review-prompt flow on the Auto Clip results screen, mocked at the
// network boundary. Resuming with ?project=proj-1 jumps straight to
// ClipsResults (see app/dashboard/create/auto-clip/page.tsx's
// `showOverlay = !!resumeProjectId`), whose own polling derives "done" from
// the mocked /api/projects/proj-1/clips response — no real upload/render
// needed. Confirms the prompt fires only on the completed results screen
// (never mid-render) and that "Don't ask again" persists across a reload.
test("review prompt appears after an Auto Clip batch completes, and stays dismissed after reload", async ({ page, baseURL }) => {
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

  let dismissedPermanently = false;
  await page.route("**/api/reviews/prompt-check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ shouldPrompt: !dismissedPermanently, trigger: dismissedPermanently ? undefined : "autoclips_milestone" }),
    }),
  );
  await page.route("**/api/reviews/prompt-dismiss", async (route) => {
    const body = route.request().postDataJSON() as { permanent?: boolean };
    if (body.permanent) dismissedPermanently = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
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

  await expect(page.getByText("Your clips are ready 🎉")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).toBeVisible();

  await page.getByRole("button", { name: "Don't ask again" }).click();
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).not.toBeVisible();

  await page.reload();
  await expect(page.getByText("Your clips are ready 🎉")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How's Clipiro working out for you?" })).not.toBeVisible();
});
