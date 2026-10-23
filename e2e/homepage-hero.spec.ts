import { test, expect } from "@playwright/test";

// The hero's launch film. Playback itself isn't asserted: Playwright's bundled
// Chromium has no H.264 decoder, so these pin the loading contract instead —
// what a visitor gets before hydration, which files are offered, and the
// reduced-motion fallback.

const FILM = 'video[aria-label^="Clipiro product film"]';

test.describe("homepage hero film", () => {
  test("offers a phone-sized encode, starts from script, and preloads the poster", async ({ page }) => {
    await page.goto("/");
    const film = page.locator(FILM);
    await expect(film).toHaveAttribute("preload", "metadata");
    // No autoPlay attribute: playback starts from the effect, after the
    // reduced-motion / Save-Data check.
    await expect(film).not.toHaveAttribute("autoplay", /.*/);
    await expect(film.locator('source[src="/hero/launch-film.mp4"]')).toHaveAttribute("media", "(min-width: 768px)");
    await expect(film.locator('source[src="/hero/launch-film-mobile.mp4"]')).toHaveCount(1);
    await expect(page.locator('link[rel="preload"][href="/hero/launch-film-poster.jpg"]')).toHaveCount(1);
  });

  test("reduced-motion visitors get the poster with controls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const film = page.locator(FILM);
    await expect.poll(() => film.evaluate((v: HTMLVideoElement) => v.controls)).toBe(true);
    expect(await film.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the film and the CTA are visible", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(FILM)).toBeVisible();
      const cta = page.getByRole("main").getByRole("button", { name: /Try Clipiro free/ });
      await expect(cta).toBeVisible();
      // Visible at rest, not parked at opacity 0 waiting for a reveal effect.
      for (const el of [page.locator(FILM), cta]) {
        expect(await el.evaluate((n) => getComputedStyle(n.closest(".hero-rise")!).opacity)).toBe("1");
      }
    });
  });
});
