import { describe, expect, it } from "vitest";
import { planCta } from "./plan-cta";

const creator = { slug: "sub_creator_1mo", tier: "creator" as const, intervalMonths: 1 };
const pro = { slug: "sub_pro_1mo", tier: "pro" as const, intervalMonths: 1 };
const proYearly = { slug: "sub_pro_12mo", tier: "pro" as const, intervalMonths: 12 };
const studio = { slug: "sub_studio_1mo", tier: "studio" as const, intervalMonths: 1 };

describe("planCta", () => {
  it("leaves the default label for a viewer with no plan", () => {
    expect(planCta(pro, null, false)).toEqual({});
  });

  it("marks the live plan as current, not 'Renew'", () => {
    expect(planCta(pro, pro, true)).toEqual({ label: "Your current plan", disabled: true });
  });

  it("offers to renew a lapsed plan", () => {
    expect(planCta(pro, pro, false)).toEqual({ label: "Renew Pro" });
  });

  it("says which way a switch moves a subscriber", () => {
    expect(planCta(studio, pro, true)).toEqual({ label: "Upgrade to Agency" });
    expect(planCta(creator, pro, true)).toEqual({ label: "Switch to Creator" });
  });

  it("names a same-tier billing-period change", () => {
    expect(planCta(proYearly, pro, true)).toEqual({ label: "Switch to yearly" });
    expect(planCta(pro, proYearly, true)).toEqual({ label: "Switch to monthly" });
  });
});
