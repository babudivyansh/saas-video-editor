import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: (a: { data: Record<string, unknown> }) => update(a), findUnique: vi.fn(async () => null) } },
}));

const { PUT } = await import("./route");

function put(body: unknown) {
  return PUT(new NextRequest("http://localhost/api/billing/details", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => { update.mockClear(); });

describe("PUT /api/billing/details", () => {
  it("saves valid details, upper-casing the GSTIN and filling the state from it", async () => {
    const res = await put({ billingName: " Acme Media ", billingGstin: "27aapfu0939f1zv", billingPincode: "400001" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "u1" },
      data: expect.objectContaining({ billingName: "Acme Media", billingGstin: "27AAPFU0939F1ZV", billingState: "27" }),
    }));
  });

  it("clears a field sent as an empty string", async () => {
    await put({ billingGstin: "" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ billingGstin: null }) }));
  });

  it.each([
    [{ billingGstin: "27AAPFU0939F1ZX" }, "billingGstin"], // bad check digit
    [{ billingState: "25" }, "billingState"], // not a current state code
    [{ billingPincode: "12345" }, "billingPincode"],
    [{ billingGstin: "27AAPFU0939F1ZV", billingState: "09" }, "billingState"], // contradicts the GSTIN
  ])("rejects %j", async (body, field) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe(field);
    expect(update).not.toHaveBeenCalled();
  });
});
