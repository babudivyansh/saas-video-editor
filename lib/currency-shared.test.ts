import { describe, expect, it } from "vitest";
import { formatMoneyTotals, formatStoredMoney, totalsByCurrency } from "./currency-shared";

describe("formatStoredMoney", () => {
  it("formats a USD row in dollars, not rupees", () => {
    expect(formatStoredMoney(2900, "USD")).toBe("$29");
    expect(formatStoredMoney(1199, "USD")).toBe("$11.99");
  });

  it("treats a missing or unknown currency as INR, the column default", () => {
    expect(formatStoredMoney(99_900, "INR")).toBe("₹999");
    expect(formatStoredMoney(99_900, null)).toBe("₹999");
    expect(formatStoredMoney(99_900, "EUR")).toBe("₹999");
  });
});

describe("totalsByCurrency / formatMoneyTotals", () => {
  it("never adds cents to paise", () => {
    const t = totalsByCurrency([
      { amountInPaise: 99_900, currency: "INR" },
      { amountInPaise: 2_900, currency: "USD" },
      { amountInPaise: 49_900 },
    ]);
    expect(t).toEqual({ INR: 149_800, USD: 2_900 });
    expect(formatMoneyTotals(t)).toBe("₹1,498 + $29");
  });

  it("drops zero currencies and still prints something for nothing", () => {
    expect(formatMoneyTotals({ INR: 0, USD: 5_900 })).toBe("$59");
    expect(formatMoneyTotals({})).toBe("₹0");
  });
});
