import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PURGE_DAYS,
  CAPTION_FONTS,
  CREDIT_PACKS,
  LANGUAGES,
  MAX_CLONED_VOICES,
  MINUTE_PACKS,
  PLANS,
  QUEST_TOTAL_XP,
  RANKS,
  ROLLOVER_MULTIPLIER,
  YEARLY_DISCOUNT_PCT,
  perMonthCents,
} from "@clipiro/shared";
import { MAX_CLONED_VOICES_PER_USER } from "./cloned-voices";
import { USD_PRICE_BOOK_DEFAULTS } from "./currency";
import { SUPPORTED_LOCALES } from "./i18n-locales";
import { TIER_TAGLINE } from "./plans/display";
import {
  FREE_TIER_MONTHLY_BONUS_CREDITS,
  FREE_TIER_MONTHLY_BONUS_MINUTES,
  STORAGE_LIMIT_GB,
  SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER,
  TIER_MAX_AUTOCLIP_SOURCE_SECONDS,
} from "./plans/tiers";
import { RANKS as WEB_RANKS, TOTAL_XP } from "./quest-config";

// The seed is a script (it runs on import), so its plan rows are read as text.
const seed = readFileSync(path.join(__dirname, "../prisma/seed.ts"), "utf8");
const seedRow = (slug: string) => {
  const line = seed.split("\n").find((l) => l.includes(`slug: "${slug}"`));
  if (!line) throw new Error(`no seed row ${slug}`);
  const num = (k: string) => Number(line.match(new RegExp(`${k}:\\s*(\\d+)`))?.[1]);
  return { credits: num("credits"), minutes: num("minutes"), monthlyCredits: num("monthlyCredits"), monthlyMinutes: num("monthlyMinutes") };
};

// The phone's You tab shows the web's plans, packs, ranks and limits; this
// fails when the web changes and @clipiro/shared doesn't.
describe("mobile account rules match the web", () => {
  it("plans: prices, allowances, storage, upload length and taglines", () => {
    for (const p of PLANS) {
      expect(p.tagline).toBe(TIER_TAGLINE[p.tier]);
      expect(p.storageGb).toBe(STORAGE_LIMIT_GB[p.tier]);
      expect(p.uploadHours * 3600).toBe(TIER_MAX_AUTOCLIP_SOURCE_SECONDS[p.tier]);
      if (p.tier === "free") {
        expect([p.minutes, p.credits]).toEqual([FREE_TIER_MONTHLY_BONUS_MINUTES, FREE_TIER_MONTHLY_BONUS_CREDITS]);
        continue;
      }
      expect(p.monthlyCents).toBe(USD_PRICE_BOOK_DEFAULTS[`sub_${p.tier}_1mo`]);
      expect(p.yearlyCents).toBe(USD_PRICE_BOOK_DEFAULTS[`sub_${p.tier}_12mo`]);
      const row = seedRow(`sub_${p.tier}_1mo`);
      expect([p.minutes, p.credits]).toEqual([row.monthlyMinutes, row.monthlyCredits]);
    }
  });

  it("yearly saving and rollover", () => {
    expect(seed).toMatch(new RegExp(`YEARLY_DISCOUNT = 0\\.${YEARLY_DISCOUNT_PCT}\\b`));
    for (const p of PLANS.filter((x) => x.tier !== "free")) {
      expect(Math.round((1 - perMonthCents(p, "yearly") / p.monthlyCents) * 100)).toBeGreaterThanOrEqual(YEARLY_DISCOUNT_PCT - 1);
    }
    expect(ROLLOVER_MULTIPLIER).toBe(SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER);
  });

  it("credit and minute packs", () => {
    for (const p of CREDIT_PACKS) expect(p.credits).toBe(seedRow(p.id).credits);
    for (const p of MINUTE_PACKS) {
      expect(p.minutes).toBe(seedRow(p.id).minutes);
      expect(p.cents).toBe(USD_PRICE_BOOK_DEFAULTS[p.id]);
    }
  });

  it("creator ranks", () => {
    expect(QUEST_TOTAL_XP).toBe(TOTAL_XP);
    expect(RANKS.map((r) => [r.level, r.minXp])).toEqual(WEB_RANKS.map((r) => [r.level, r.minXp]));
  });

  it("brand-kit fonts are bundled caption fonts, or legacy fonts older app versions still send", () => {
    // Templates own the font now; fontName stays accepted so older app builds
    // can still save a kit. Impact and Oswald predate the template library.
    const manifest = JSON.parse(readFileSync(path.join(__dirname, "captions/engine/font-manifest.json"), "utf8")) as { family: string }[];
    const bundled = new Set([...manifest.map((m) => m.family), "Impact", "Oswald"]);
    for (const f of CAPTION_FONTS) expect({ f, bundled: bundled.has(f) }).toEqual({ f, bundled: true });
  });

  it("languages, cloned voices and account deletion", () => {
    expect(LANGUAGES).toEqual(SUPPORTED_LOCALES);
    expect(MAX_CLONED_VOICES).toBe(MAX_CLONED_VOICES_PER_USER);
    const deactivate = readFileSync(path.join(__dirname, "../app/api/account/deactivate/route.ts"), "utf8");
    expect(deactivate).toMatch(new RegExp(`PURGE_WINDOW_DAYS = ${ACCOUNT_PURGE_DAYS};`));
  });
});
