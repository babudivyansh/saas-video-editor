import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIPIRO_PLANS, COMPETITORS, COMPETITORS_CHECKED_ON } from "./data";

// Plan rows are DB data seeded from prisma/seed.ts, which can't be imported
// without a database client — read it as text, the same way
// app/tools/content.test.ts checks the AutoClip pricing FAQ.
const seed = readFileSync(path.join(process.cwd(), "prisma/seed.ts"), "utf8");

describe("comparison data", () => {
  it("quotes each plan's monthly price and Clip Minutes as seeded", () => {
    for (const plan of CLIPIRO_PLANS) {
      const row = seed.match(new RegExp(`name: "${plan.name} \\(Monthly\\)", priceInPaise: (\\d+).*?monthlyMinutes: (\\d+)`));
      expect(row, `${plan.name} monthly row in seed.ts`).not.toBeNull();
      expect(Number(row![1]) / 100, `${plan.name} price`).toBe(plan.monthlyInr);
      expect(Number(row![2]), `${plan.name} minutes`).toBe(plan.minutes);
    }
  });

  it("keeps the competitor check date within a quarter", () => {
    const ageDays = (Date.now() - new Date(COMPETITORS_CHECKED_ON).getTime()) / 86_400_000;
    // Fails CI ~100 days after the last check, so a stale page can't linger unnoticed.
    expect(ageDays, "re-check competitor pricing pages and bump COMPETITORS_CHECKED_ON").toBeLessThan(100);
  });

  it("gives every competitor a quotable summary and a real source", () => {
    for (const c of COMPETITORS) {
      const words = c.summary.split(/\s+/).length;
      expect(words, `${c.slug} summary length`).toBeGreaterThanOrEqual(35);
      expect(words, `${c.slug} summary length`).toBeLessThanOrEqual(70);
      expect(c.pricingUrl).toMatch(/^https:\/\//);
      expect(c.metaDescription.length, `${c.slug} description`).toBeLessThanOrEqual(165);
    }
  });
});
