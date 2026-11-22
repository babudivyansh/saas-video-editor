import { test, expect } from "@playwright/test";

// The homepage hero: the feature carousel (components/landing/hero), the
// mock link box in its AI clipping demo, the sign-up button, and the product
// film that now opens on request. Video playback
// itself isn't asserted (Playwright's Chromium has no H.264 decoder); these
// pin the behaviour around it.

test.describe("homepage hero carousel", () => {
  test("tabs switch the stage, by click and by arrow keys", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tablist", { name: "Clipiro features" });
    const clipping = tabs.getByRole("tab", { name: "AI clipping" });
    const reframe = tabs.getByRole("tab", { name: "AI reframe" });
    await expect(clipping).toHaveAttribute("aria-selected", "true");
    // A slider with ends: nothing to the left of the first panel.
    await expect(page.getByRole("button", { name: "Previous feature" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next feature" })).toBeEnabled();

    await reframe.click();
    await expect(reframe).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#hero-panel-reframe")).toHaveAttribute("aria-hidden", "false");

    await reframe.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "AI B-roll" })).toHaveAttribute("aria-selected", "true");
    await expect(tabs.getByRole("tab", { name: "AI B-roll" })).toBeFocused();

    await page.getByRole("button", { name: "Previous feature" }).click();
    await expect(reframe).toHaveAttribute("aria-selected", "true");
  });

  test("the clipping demo plays its rounds on its own; Try Clipiro free is the way in", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator("#hero-panel-clipping");
    // A picture of a link bar: nothing to type into or click.
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.locator('video[src$="/cr1-long.mp4"]')).toHaveCount(1);

    // The next round (and its long video) comes on its own, every 4 s.
    await expect(panel.locator('video[src$="/cr2-long.mp4"]')).toHaveCount(1, { timeout: 8_000 });

    await page.getByRole("main").getByRole("button", { name: "Try Clipiro free" }).click();
    await expect(page.getByRole("dialog", { name: "Create your account" })).toBeVisible();
  });

  test("the link bar sends a pasted link to AutoClip through sign-up", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("textbox", { name: "Video link" });
    await link.fill("not a link");
    await page.getByRole("button", { name: "Get free clips" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Paste a full video link" })).toBeVisible();

    await link.fill("https://www.youtube.com/watch?v=abc123");
    await page.getByRole("button", { name: "Get free clips" }).click();
    await expect(page).toHaveURL(/\/register\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBe(`/dashboard/create/auto-clip?url=${encodeURIComponent("https://www.youtube.com/watch?v=abc123")}`);
  });

  test("the product film only loads when the tour is opened", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('video[aria-label^="Clipiro product film"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Watch the 2-min tour" }).click();
    const film = page.getByRole("dialog", { name: "Clipiro product tour" }).locator("video");
    await expect(film).toBeVisible();
    await expect(film.locator('source[src="/hero/launch-film.mp4"]')).toHaveAttribute("media", "(min-width: 768px)");
  });

  test("reduced-motion visitors get no autoplay", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const clipping = page.getByRole("tab", { name: "AI clipping" });
    await page.waitForTimeout(10_000);
    await expect(clipping).toHaveAttribute("aria-selected", "true");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the demo and the sign-up button are in the server HTML", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("#hero-panel-clipping").getByText("Drop a long video and")).toBeVisible();
      await expect(page.getByRole("main").getByRole("button", { name: /Try Clipiro free/ })).toBeVisible();
      // Visible at rest, not parked at opacity 0 waiting for a reveal effect.
      const cta = page.getByRole("main").getByRole("button", { name: /Try Clipiro free/ });
      expect(await cta.evaluate((n) => getComputedStyle(n.closest(".hero-rise")!).opacity)).toBe("1");
    });
  });
});
