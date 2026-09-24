import { test, expect, type Page } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// AutoClip's create flow, end to end in the browser, fully hermetic: every API
// the page calls is mocked, so there is no real DB user, Redis or network.
//
// These are the paths the 2026-09 audit found broken and that no unit test
// can see, because they are about what the user is SHOWN:
//   - a run refused for credits used to print the raw "insufficient_credits"
//     under "Something went wrong" and leave an empty draft project behind;
//   - a failed run offered only "Create another", wiping the settings;
//   - a run that no longer exists was polled every 2.5s forever.

const USER = {
  id: "e2e-autoclip-user", email: "e2e-autoclip@example.com", phone: null, credits: 5,
  createdAt: new Date().toISOString(), role: "USER", firstName: "E2E", lastName: "User",
  name: "E2E User", avatarUrl: null, gender: null, intendedUse: null,
  subscriptionEndsAt: null, nextRefillAt: null, monthlyCredits: 0, plan: null,
  onboardingCompletedAt: new Date().toISOString(), tourCompletedAt: new Date().toISOString(),
  dismissedHints: [], primaryGoal: null,
};

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function signIn(page: Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: USER })));
  await page.route("**/api/quests", (r) => r.fulfill(json({ quests: [], earnedXp: 0, totalXp: 0, remaining: 0, level: "Beginner", allComplete: true, newRankRewards: [] })));
  await page.route("**/api/notifications/unread-count", (r) => r.fulfill(json({ count: 0 })));
  await page.route("**/api/caption-templates", (r) => r.fulfill(json({ templates: [] })));
  await page.route("**/api/reviews/prompt-check", (r) => r.fulfill(json({ show: false })));
  await page.route("**/api/projects/clips/score-performance", (r) => r.fulfill(json({ items: [] })));
  // The real prices and balance — the form shows both beside Generate.
  await page.route("**/api/generate/auto-clip", (r) =>
    r.request().method() === "GET"
      ? r.fulfill(json({
          pricing: { perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1, dubPerMinute: 2 },
          captionPricing: { perBillableMinute: 8, perRender: 0 },
          balance: 5,
        }))
      : r.fallback(),
  );
  await page.addInitScript(() => localStorage.setItem("token", "e2e-fake-token"));
  // proxy.ts guards /dashboard/* on a real signed session cookie.
  await page.context().addCookies([{
    name: SESSION_COOKIE_NAME,
    value: signToken({ userId: USER.id, email: USER.email, sessionId: "e2e-autoclip-session" }),
    url: baseURL!,
  }]);
}

test("a run refused for credits stays on the form, says why, and leaves no draft behind", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/assets?**", (r) => r.fulfill(json({
    assets: [{
      id: "a1", name: "e2e-source.mp4", url: "https://example.invalid/e2e-source.mp4", thumbnailUrl: null,
      kind: "video", mimeType: "video/mp4", duration: 600, size: 1024, createdAt: new Date().toISOString(),
    }],
    nextCursor: null,
  })));
  await page.route("**/api/projects", (r) =>
    r.request().method() === "POST" ? r.fulfill(json({ project: { id: "p-e2e" } }, 201)) : r.fallback(),
  );
  await page.route("**/api/generate/auto-clip", (r) =>
    r.request().method() === "POST"
      ? r.fulfill(json({ error: "insufficient_credits", required: 12, balance: 5 }, 402))
      : r.fallback(),
  );
  const deleted: string[] = [];
  await page.route("**/api/projects/p-e2e", (r) => {
    if (r.request().method() === "DELETE") deleted.push(r.request().url());
    return r.fulfill(json({ ok: true, project: { id: "p-e2e", status: "draft" } }));
  });

  await page.goto("/dashboard/create/auto-clip");
  await expect(page.getByText(/Your balance: 5 credits/)).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Choose from Assets" }).first().click();
  await page.getByText("e2e-source.mp4").click();
  await page.getByRole("button", { name: /Generate clips/ }).click();

  // Never the raw error code.
  await expect(page.getByText("insufficient_credits")).toHaveCount(0);
  const banner = page.getByRole("alert").filter({ hasText: "Nothing was charged" });
  await expect(banner).toContainText("You need 12 credits to start this run and you have 5");
  await expect(page).not.toHaveURL(/project=/);
  await expect.poll(() => deleted.length).toBe(1);
});

test("a failed run offers Try again on the same video, keeping the user on the form", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/projects/p-failed/clips**", (r) => r.fulfill(json({
    project: {
      status: "failed", warnings: null, captionStyleIndex: null, uploadedVideoUrl: null,
      failureReason: "Video is too short (4.0s) for the requested clip duration (min 15s)",
    },
    clips: [],
  })));

  await page.goto("/dashboard/create/auto-clip?project=p-failed");
  await expect(page.getByText(/Video is too short/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText(/Trying this video again/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate clips/ })).toBeEnabled();
});

test("a run that no longer exists says so instead of polling forever", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  let polls = 0;
  await page.route("**/api/projects/p-gone/clips**", (r) => { polls++; return r.fulfill(json({ error: "Not found" }, 404)); });

  await page.goto("/dashboard/create/auto-clip?project=p-gone");
  await expect(page.getByText(/isn.t here any more/)).toBeVisible({ timeout: 90_000 });
  const seen = polls;
  await page.waitForTimeout(3_500); // longer than one 2.5s poll interval
  expect(polls).toBe(seen);
});
