import { test, expect } from "@playwright/test";
import { signToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Notification bell smoke test, mocked at the network boundary (same
// fully-hermetic pattern as e2e/ai-tool.spec.ts): a user with one unread
// "your review is live" notification sees the badge and can open/read it
// from the dashboard header.
test("user sees an unread badge and reads a review-published notification", async ({ page, baseURL }) => {
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

  await page.route("**/api/notifications/unread-count", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unreadCount: 1 }) }),
  );

  let markedRead = false;
  await page.route("**/api/notifications?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "notif-1",
            type: "review_published",
            title: "Your review is live!",
            body: "Thanks for sharing your experience with Clipiro.",
            href: "/reviews/rev-1",
            readAt: markedRead ? new Date().toISOString() : null,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        unreadCount: markedRead ? 0 : 1,
      }),
    }),
  );

  await page.route("**/api/notifications/notif-1/read", (route) => {
    markedRead = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notification: { id: "notif-1" } }) });
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

  await page.goto("/dashboard");

  await expect(page.getByRole("button", { name: /Notifications, 1 unread/ })).toBeVisible();
  await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  await expect(page.getByText("Your review is live!")).toBeVisible();

  // Clicking the notification marks it read (the button's aria-label drops
  // the unread count) and hands off navigation to its href.
  const markRead = page.waitForResponse("**/api/notifications/notif-1/read");
  await page.getByText("Your review is live!").click();
  await markRead;
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
});
