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
