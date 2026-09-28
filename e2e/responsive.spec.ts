import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Smoke checks for the responsive work: dashboard mobile drawer, the settings
// horizontal tab strip, and the editor's tablet-range overlay panels. Follows
// ai-tool.spec.ts's mocked-auth pattern (fake user + signed session cookie)
// so these don't depend on a real DB user or registration flow.
async function mockAuth(page: import("@playwright/test").Page, baseURL: string | undefined) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-fake-user",
          email: "e2e@example.com",
          credits: 10,
          createdAt: new Date().toISOString(),
          role: "USER",
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
  // Dashboard home also fetches /api/quests — without a real DB user this
  // 500s and questData ends up shaped in a way that crashes the page
  // (`questData?.quests.find` — optional chaining guards `questData`, not
  // `.quests` itself), unrelated to the responsive nav being tested here.
  await page.route("**/api/quests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quests: [], earnedXp: 0, remaining: 0, level: 1, allComplete: false }),
    }),
  );
}

test("dashboard: mobile hamburger opens the nav drawer with the hidden header items", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // phone width — hamburger only shows below `xl`
  await mockAuth(page, baseURL);
  await page.goto("/dashboard");

  // The icon-rail sidebar should be gone at phone width, replaced by a hamburger.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();

  // Primary nav (normally in ToolsSidebar) is reachable from the drawer —
  // scoped to it specifically, since the same hrefs also appear (hidden)
  // in the always-mounted account dropdown and the desktop ToolsSidebar.
  const drawer = page.getByTestId("mobile-nav-drawer");
  // Settings and billing are overlays now, so their drawer entries are buttons, not links.
  await expect(drawer.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /upgrade|billing|plan/i }).first()).toBeVisible();

  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(drawer).toBeHidden();
});

test("settings: the overlay's section list is a horizontal tab strip at phone width", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // phone width — the sidebar collapses below `md`
  await mockAuth(page, baseURL);
  // The old route is a redirect now: it lands on the dashboard with the
  // Settings overlay open.
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/dashboard\?settings=general/);

  const overlay = page.getByTestId("settings-overlay");
  await expect(overlay).toBeVisible();
  // Each section button exists twice (desktop sidebar, phone tab strip); only
  // the tab strip's is visible at this width.
  const profileTab = overlay.getByRole("button", { name: "Profile", exact: true }).locator("visible=true");
  await expect(profileTab).toBeVisible();
  await profileTab.click();
  await expect(page).toHaveURL(/settings=profile/);

  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(page).not.toHaveURL(/settings=/);
});

test("editor: tablet width clears the phone gate and uses overlay panels, not a squeeze", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 900, height: 800 }); // tablet range (768-1279px)
  await mockAuth(page, baseURL);

  await page.route("**/api/projects/e2e-fake-project", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          id: "e2e-fake-project",
          title: "E2E Test Project",
          editorDoc: {
            version: 1,
            aspect: "9:16",
            fps: 30,
            tracks: { video: [], text: [], audio: [], image: [], caption: [] },
          },
        },
      }),
    }),
  );

  await page.goto("/dashboard/editor?projectId=e2e-fake-project");

  // The phone gate ("needs a bigger screen") must NOT show at tablet width.
  await expect(page.getByText("The editor needs a bigger screen")).toBeHidden();

  // Side panels default collapsed/overlay below lg — confirmed by the
  // properties-panel's mobile-only toggle being present.
  await expect(page.getByRole("button", { name: "Open properties" })).toBeVisible();

  // Opening a tool tab shows its panel as an overlay with a backdrop, rather
  // than pushing the preview area (which would leave ~144px for it).
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.getByTestId("editor-panel-backdrop").first()).toBeVisible();
});

// Regression coverage for a real bug: iPad Mini/Air land at 1024-1194px wide
// in landscape (Playwright's `devices["iPad Mini landscape"]` is exactly
// 1024x768) — using Tailwind's `lg` (1024px) as the compact/desktop cutover
// meant these tablets got the cramped desktop layout in landscape instead of
// the mobile-friendly one. Fixed by moving every cutover to `xl` (1280px).
test("iPad Mini landscape (1024x768): dashboard and editor stay compact, not cramped", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockAuth(page, baseURL);

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  await page.route("**/api/projects/e2e-fake-project", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          id: "e2e-fake-project",
          title: "E2E Test Project",
          editorDoc: {
            version: 1,
            aspect: "9:16",
            fps: 30,
            tracks: { video: [], text: [], audio: [], image: [], caption: [] },
          },
        },
      }),
    }),
  );
  await page.goto("/dashboard/editor?projectId=e2e-fake-project");
  await expect(page.getByText("The editor needs a bigger screen")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open properties" })).toBeVisible();
});
