import { describe, expect, it } from "vitest";
import { describeRazorpayError, isMissingRazorpayPlan } from "./razorpay-errors";

describe("isMissingRazorpayPlan", () => {
  it("recognises Razorpay's unknown-id rejection", () => {
    expect(isMissingRazorpayPlan({ statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } })).toBe(true);
    expect(isMissingRazorpayPlan({ statusCode: 400, error: { description: "Invalid", field: "plan_id" } })).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isMissingRazorpayPlan({ statusCode: 500, error: { description: "The id provided does not exist" } })).toBe(false);
    expect(isMissingRazorpayPlan({ statusCode: 400, error: { description: "total_count exceeds maximum" } })).toBe(false);
    expect(isMissingRazorpayPlan(new Error("network down"))).toBe(false);
    expect(isMissingRazorpayPlan(undefined)).toBe(false);
  });
});

describe("describeRazorpayError", () => {
  it("summarises an SDK rejection", () => {
    expect(describeRazorpayError({ statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "Bad", field: "plan_id" } }))
      .toBe("400 BAD_REQUEST_ERROR Bad (field: plan_id)");
    expect(describeRazorpayError(new Error("boom"))).toBe("boom");
  });
});
