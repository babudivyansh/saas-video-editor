import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";

// The auto-scroll testimonial marquee (app/components/landing/TestimonialMarquee.tsx)
// reuses the same .clipiro-marquee CSS loop as SocialProof.tsx's brand strip —
// real reviews seeded directly via Prisma, same precedent as
// e2e/homepage-reviews.spec.ts, since this is server-rendered on the homepage.
test.describe.serial("testimonial marquee", () => {
  const unique = Date.now();
  const email = `e2e-marquee-review-${unique}@example.com`;
  let userId: string;

  test.beforeAll(async () => {
    // Ensure the 3-review display threshold is met regardless of what else
    // is in the DB, without depending on other specs' seeded data still
    // being present (each spec file cleans up after itself).
    const baseline = await prisma.review.count({ where: { status: "published" } });
    const fillerNeeded = Math.max(0, 3 - baseline - 1);
    const fillerUsers = await Promise.all(
      Array.from({ length: fillerNeeded }, (_, i) =>
        prisma.user.create({ data: { email: `e2e-marquee-filler-${unique}-${i}@example.com`, passwordHash: "not-a-real-hash", name: `Filler ${i}` } }),
      ),
    );
    await Promise.all(
      fillerUsers.map((u) =>
        prisma.review.create({
          data: { userId: u.id, rating: 5, body: "Filler review body long enough to pass validation checks easily.", featureUsed: "ai_tools", status: "published" },
        }),
      ),
    );

    const user = await prisma.user.create({ data: { email, passwordHash: "not-a-real-hash", name: "Priya Sharma" } });
    userId = user.id;
    await prisma.review.create({
      data: {
        userId,
        rating: 5,
        body: "Clipiro's auto-reframe is shockingly good — cut our editing time in half every single week.",
        featureUsed: "auto_clips",
        status: "published",
        verifiedCustomer: true,
        company: "Acme Studios",
        country: "Canada",
        tierAtSubmit: "pro",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.review.deleteMany({ where: { body: { contains: "Filler review body" } } });
    await prisma.user.deleteMany({ where: { email: { contains: `e2e-marquee-filler-${unique}` } } });
    await prisma.review.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  test("renders the marquee and the enriched grid card fields", async ({ page }) => {
    await page.goto("/");

    // The review text appears both in the marquee (doubled) and the grid —
    // .first() just confirms at least one instance renders.
    await expect(page.getByText(/shockingly good/i).first()).toBeVisible();

    // Enriched fields only shown on the full grid card, not the compact marquee pill.
    await expect(page.getByText("Acme Studios · Canada")).toBeVisible();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  });

  test("respects prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByText(/shockingly good/i).first()).toBeVisible();

    const animationName = await page.locator(".clipiro-marquee").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
  });

  test("animates normally without reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.getByText(/shockingly good/i).first()).toBeVisible();

    const animationName = await page.locator(".clipiro-marquee").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("clipiro-marquee");
  });
});
