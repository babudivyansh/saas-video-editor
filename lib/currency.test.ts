import { beforeEach, describe, expect, it, vi } from "vitest";

let configRows: Record<string, string>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        configRows[where.key] ? { key: where.key, value: configRows[where.key] } : null),
      upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        configRows[where.key] = update.value;
      }),
    },
  },
}));

const { getPlanPriceMinor, getFxConfig, setFxConfig, setUsdPriceBook, FX_DEFAULTS, USD_PRICE_BOOK_DEFAULTS } =
  await import("./currency");
const { formatMoney, inferCurrencyFromLocale } = await import("./currency-shared");

beforeEach(() => {
  configRows = {};
  vi.clearAllMocks();
});

describe("getPlanPriceMinor", () => {
  it("returns the INR paise unchanged for INR", async () => {
    expect(await getPlanPriceMinor("sub_creator_1mo", 99900, "INR")).toBe(99900);
  });

  it("uses the price-book override for a known slug", async () => {
    expect(await getPlanPriceMinor("sub_creator_1mo", 99900, "USD")).toBe(USD_PRICE_BOOK_DEFAULTS.sub_creator_1mo);
  });

  it("falls back to FX conversion rounded to a clean .99 for an unlisted slug", async () => {
    // 59900 paise = ₹599 at default 88 INR/USD -> $6.8 -> rounds to $7 -> 699 cents.
    expect(await getPlanPriceMinor("pack_mini", 59900, "USD")).toBe(699);
  });

  it("respects an admin-updated FX rate", async () => {
    await setFxConfig({ inrPerUsd: 100 });
    // ₹599 at 100 INR/USD = $5.99 -> rounds to $6 -> 599 cents.
    expect(await getPlanPriceMinor("pack_mini", 59900, "USD")).toBe(599);
  });

  it("respects an admin-set price-book override for any slug", async () => {
    await setUsdPriceBook({ pack_mini: 499 });
    expect(await getPlanPriceMinor("pack_mini", 59900, "USD")).toBe(499);
  });
});

describe("yearly discount parity between currencies", () => {
  // The pricing cards derive "save N%" from the plan rows, so if a USD yearly
  // price drifts away from ~33% off 12x its monthly row the card silently
  // advertises a different discount than the INR card does. That regression
  // shipped once already (USD read 49/42/35% against a flat 33% in INR),
  // because the yearly slugs were missing from the price book and fell through
  // to raw FX. Assert the discount, not the price, so a deliberate repricing
  // that keeps parity stays green.
  const TIERS = ["creator", "pro", "studio"] as const;
  const TARGET_PCT = 33;

  for (const tier of TIERS) {
    it(`prices sub_${tier}_12mo at ~${TARGET_PCT}% off 12x monthly in USD`, async () => {
      const monthly = USD_PRICE_BOOK_DEFAULTS[`sub_${tier}_1mo`];
      const yearly = USD_PRICE_BOOK_DEFAULTS[`sub_${tier}_12mo`];
      expect(monthly, `sub_${tier}_1mo missing from the USD price book`).toBeGreaterThan(0);
      expect(yearly, `sub_${tier}_12mo missing from the USD price book — it would fall through to FX`).toBeGreaterThan(0);

      const pct = Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
      expect(pct).toBe(TARGET_PCT);
    });
  }

  it("resolves yearly USD from the price book, not the FX fallback", async () => {
    // Passing a deliberately mismatched priceInPaise: if the slug were missing
    // from the book this would convert to something else entirely.
    expect(await getPlanPriceMinor("sub_pro_12mo", 1768000, "USD")).toBe(USD_PRICE_BOOK_DEFAULTS.sub_pro_12mo);
  });
});

describe("getFxConfig", () => {
  it("returns defaults with no Config row", async () => {
    expect(await getFxConfig()).toEqual(FX_DEFAULTS);
  });
});

describe("formatMoney", () => {
  it("formats INR without decimals", () => {
    expect(formatMoney(99900, "INR")).toBe("₹999");
  });
  it("formats a whole-dollar USD amount without decimals", () => {
    expect(formatMoney(1500, "USD")).toBe("$15");
  });
  it("formats a fractional USD amount with cents", () => {
    expect(formatMoney(1499, "USD")).toBe("$14.99");
  });
});

describe("inferCurrencyFromLocale", () => {
  it("infers INR for an en-IN locale", () => {
    expect(inferCurrencyFromLocale("en-IN")).toBe("INR");
  });
  it("defaults to USD for anything else", () => {
    expect(inferCurrencyFromLocale("en-US")).toBe("USD");
    expect(inferCurrencyFromLocale(null)).toBe("INR");
  });
});
