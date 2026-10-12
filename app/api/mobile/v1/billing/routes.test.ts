import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Read-only billing in the app (docs/mobile/BILLING.md): cancel and resume a
// plan bought on the web, list its purchases, fetch an invoice PDF — and
// never pass on words that sell.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })),
  requireSubscriber: vi.fn(),
  convertToMobileSession: vi.fn(),
  verifyToken: vi.fn(),
}));
const web = { cancel: vi.fn(), resume: vi.fn(), pdf: vi.fn() };
vi.mock("@/app/api/billing/cancel/route", () => ({ POST: web.cancel }));
vi.mock("@/app/api/billing/resume/route", () => ({ POST: web.resume }));
vi.mock("@/app/api/billing/invoices/[id]/pdf/route", () => ({ GET: web.pdf }));
const purchases = { findMany: vi.fn(), findFirst: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { purchase: purchases } }));
vi.mock("@/lib/invoice/pdf", () => ({ invoiceFilename: (i: { number: string }) => `Clipiro-${i.number}.pdf` }));

const cancel = (await import("./cancel/route")).POST;
const resume = (await import("./resume/route")).POST;
const invoices = (await import("./invoices/route")).GET;
const invoice = (await import("./invoices/[id]/route")).GET;
const pdf = (await import("./invoices/[id]/pdf/route")).GET;

const req = (url: string, method = "GET") => new NextRequest(`http://localhost/api/mobile/v1/billing${url}`, { method, headers: { authorization: "Bearer a" } });
const row = { id: "pu1", amountInPaise: 149900, currency: "INR", credits: 50, minutes: 150, status: "captured", createdAt: new Date("2026-09-01"), plan: { name: "Creator" }, invoice: { number: "CL-2026-0042" } };

beforeEach(() => vi.clearAllMocks());

describe("billing", () => {
  it("cancels at the end of the period", async () => {
    web.cancel.mockResolvedValue(NextResponse.json({ subscriptionCancelledAt: "2026-10-11T00:00:00.000Z", subscriptionEndsAt: "2026-11-01T00:00:00.000Z" }));
    expect(await (await cancel(req("/cancel", "POST"))).json()).toEqual({ cancelAtPeriodEnd: true, endsAt: "2026-11-01T00:00:00.000Z" });
  });

  it("can't switch a Razorpay plan back on, and says so without offering a new plan", async () => {
    web.resume.mockResolvedValue(NextResponse.json({ error: "Choose a plan to start a new subscription", requiresNewSubscription: true }, { status: 409 }));
    const res = await resume(req("/resume", "POST"));
    const body = await res.json();
    expect([res.status, body.code]).toEqual([409, "cannot_resume"]);
    expect(body.error).not.toMatch(/choose a plan|subscribe|upgrade/i);
  });

  it("lists the caller's purchases in plain words", async () => {
    purchases.findMany.mockResolvedValue([row, { ...row, id: "pu2", plan: null, minutes: 0, credits: 100, status: "refunded", invoice: null }]);
    const body = await (await invoices(req("/invoices"))).json();
    expect(purchases.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(body.invoices).toEqual([
      expect.objectContaining({ id: "pu1", label: "Creator plan", amount: 149900, currency: "INR", status: "paid", invoiceNumber: "CL-2026-0042" }),
      expect.objectContaining({ id: "pu2", label: "100 AI credits", status: "refunded", invoiceNumber: null }),
    ]);
  });

  it("finds one purchase only on the caller's account", async () => {
    purchases.findFirst.mockResolvedValueOnce(null);
    const res = await invoice(req("/invoices/theirs"), { params: Promise.resolve({ id: "theirs" }) });
    expect(res.status).toBe(404);
    expect(purchases.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "theirs", userId: "u1" } }));
    purchases.findFirst.mockResolvedValueOnce(row);
    expect(await (await invoice(req("/invoices/pu1"), { params: Promise.resolve({ id: "pu1" }) })).json()).toMatchObject({ fileName: "Clipiro-CL-2026-0042.pdf" });
  });

  it("hands the PDF over from the web's own route", async () => {
    web.pdf.mockResolvedValue(new NextResponse(new Uint8Array([37, 80, 68, 70]), { headers: { "Content-Type": "application/pdf" } }));
    const res = await pdf(req("/invoices/pu1/pdf"), { params: Promise.resolve({ id: "pu1" }) });
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(web.pdf).toHaveBeenCalled();
  });
});
