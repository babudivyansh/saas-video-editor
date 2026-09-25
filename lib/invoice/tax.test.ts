import { describe, expect, it } from "vitest";
import {
  amountInWords, financialYear, formatInvoiceNumber, formatPaiseAmount, integerToIndianWords, placeOfSupply, splitInclusive,
} from "./tax";
import { isValidGstin, isValidPincode, isStateCode } from "./gst";
import { SELLER } from "./seller";
import { addressLines, formatInvoiceDate, stateLabel } from "./format";

describe("splitInclusive", () => {
  it("backs 18% GST out of a ₹1,000 intra-state price", () => {
    expect(splitInclusive(100000, true)).toEqual({ taxable: 84746, cgst: 7627, sgst: 7627, igst: 0, total: 100000 });
  });

  it("puts the whole tax in IGST for an inter-state supply", () => {
    expect(splitInclusive(100000, false)).toEqual({ taxable: 84746, cgst: 0, sgst: 0, igst: 15254, total: 100000 });
  });

  it("gives an odd paisa of tax to SGST so the halves still sum exactly", () => {
    const s = splitInclusive(49900, true); // tax 7612 → 3806 + 3806
    expect(s.cgst + s.sgst).toBe(s.total - s.taxable);
    const odd = splitInclusive(29900, true); // taxable 25339, tax 4561
    expect(odd).toMatchObject({ taxable: 25339, cgst: 2280, sgst: 2281 });
  });

  it("always sums to exactly the amount paid", () => {
    for (let total = 0; total < 300000; total += 997) {
      for (const intra of [true, false]) {
        const s = splitInclusive(total, intra);
        expect(s.taxable + s.cgst + s.sgst + s.igst).toBe(total);
      }
    }
  });

  it("rejects non-integer paise", () => {
    expect(() => splitInclusive(10.5, true)).toThrow();
    expect(() => splitInclusive(-1, true)).toThrow();
  });
});

describe("placeOfSupply", () => {
  it("uses the buyer's state when known, else the seller's", () => {
    expect(placeOfSupply("07", "09")).toBe("07");
    expect(placeOfSupply(null, "09")).toBe("09");
    expect(placeOfSupply("", "09")).toBe("09");
  });
});

describe("financialYear", () => {
  it("runs April to March", () => {
    expect(financialYear(new Date("2026-09-25T10:00:00+05:30"))).toBe("2627");
    expect(financialYear(new Date("2027-03-31T23:59:00+05:30"))).toBe("2627");
    expect(financialYear(new Date("2027-04-01T00:00:00+05:30"))).toBe("2728");
  });

  it("rolls over at midnight IST, not UTC", () => {
    // 00:30 IST on 1 April is still 31 March in UTC.
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("2728");
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("2627");
  });

  it("handles the century boundary", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00+05:30"))).toBe("9900");
  });
});

describe("formatInvoiceNumber", () => {
  it("fits Rule 46's 16-character limit with permitted characters only", () => {
    const n = formatInvoiceNumber("2627", 999999);
    expect(n).toBe("CLP/2627/999999");
    expect(n.length).toBeLessThanOrEqual(16);
    expect(n).toMatch(/^[A-Z0-9/-]+$/);
    expect(formatInvoiceNumber("2627", 1)).toBe("CLP/2627/000001");
  });
});

describe("amount in words", () => {
  it("uses Indian numbering", () => {
    expect(integerToIndianWords(0)).toBe("Zero");
    expect(integerToIndianWords(499)).toBe("Four Hundred Ninety Nine");
    expect(integerToIndianWords(1000)).toBe("One Thousand");
    expect(integerToIndianWords(1234567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(integerToIndianWords(250000000)).toBe("Twenty Five Crore");
  });

  it("spells out rupees and paise", () => {
    expect(amountInWords(100000)).toBe("Indian Rupees One Thousand Only");
    expect(amountInWords(100050)).toBe("Indian Rupees One Thousand and Fifty Paise Only");
    expect(amountInWords(129900)).toBe("Indian Rupees One Thousand Two Hundred Ninety Nine Only");
  });

  it("formats amounts with Indian grouping", () => {
    expect(formatPaiseAmount(84746)).toBe("847.46");
    expect(formatPaiseAmount(12345600)).toBe("1,23,456.00");
  });
});

describe("GST validation", () => {
  it("accepts Clipiro's own GSTIN and derives Uttar Pradesh", () => {
    expect(isValidGstin(SELLER.gstin)).toBe(true);
    expect(SELLER.state).toBe("09");
    expect(stateLabel(SELLER.state)).toBe("Uttar Pradesh (09)");
  });

  it("rejects a mistyped check digit, a bad shape and an unknown state", () => {
    expect(isValidGstin("09DAWPB8753E1Z8")).toBe(false);
    expect(isValidGstin("09DAWPB8753E1Z")).toBe(false);
    expect(isValidGstin("99DAWPB8753E1Z7")).toBe(false);
    expect(isValidGstin(" 09dawpb8753e1z7 ")).toBe(true); // trimmed + upper-cased
  });

  it("validates PIN codes and state codes", () => {
    expect(isValidPincode("201301")).toBe(true);
    expect(isValidPincode("020130")).toBe(false);
    expect(isValidPincode("20130")).toBe(false);
    expect(isStateCode("09")).toBe(true);
    expect(isStateCode("25")).toBe(false); // merged into 26 in 2020
  });
});

describe("format", () => {
  it("prints dates in IST as '25 Sep 2026'", () => {
    expect(formatInvoiceDate(new Date("2026-09-24T20:00:00Z"))).toBe("25 Sep 2026");
    expect(formatInvoiceDate("2026-09-25T04:30:00.000Z")).toBe("25 Sep 2026");
  });

  it("breaks the registered address after the street part", () => {
    expect(addressLines(SELLER.address)).toEqual([
      "B1-1208, Futech Gateway, Sector-75",
      "Noida, Uttar Pradesh 201301, India",
    ]);
    expect(addressLines("Short, Address")).toEqual(["Short, Address"]);
  });
});
