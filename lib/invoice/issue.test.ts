import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ensureInvoice against an in-memory DB whose $transaction really rolls back:
// the counter bump is staged and only committed if the invoice insert
// succeeds — which is exactly the property that keeps the series gapless.

interface PurchaseRow {
  id: string; userId: string; amountInPaise: number; currency: string; credits: number; status: string; createdAt: Date;
  plan: { name: string; kind: string; intervalMonths: number | null } | null;
}
interface UserRow {
  email: string; name: string | null; firstName: string | null; lastName: string | null;
  billingName: string | null; billingAddress: string | null; billingState: string | null;
  billingPincode: string | null; billingGstin: string | null;
}

let purchases: Map<string, PurchaseRow>;
let users: Map<string, UserRow>;
let invoices: Array<Record<string, unknown>>;
let counters: Map<string, number>;
let failNextInsert: Error | null;

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchase: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = purchases.get(where.id);
        if (!p) return null;
        return { ...p, user: users.get(p.userId), invoice: invoices.find((i) => i.purchaseId === p.id) ?? null };
      }),
    },
    invoice: {
      findUnique: vi.fn(async ({ where }: { where: { purchaseId: string } }) =>
        invoices.find((i) => i.purchaseId === where.purchaseId) ?? null),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const staged = new Map(counters);
      const stagedInvoices: Array<Record<string, unknown>> = [];
      const tx = {
        $queryRaw: vi.fn(async (_s: TemplateStringsArray, fy: string) => {
          const last = (staged.get(fy) ?? 0) + 1;
          staged.set(fy, last);
          return [{ last }];
        }),
        invoice: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            if (failNextInsert) { const e = failNextInsert; failNextInsert = null; throw e; }
            if (invoices.some((i) => i.purchaseId === data.purchaseId)) {
              throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "0" });
            }
            const row = { id: `inv-${invoices.length + stagedInvoices.length + 1}`, ...data };
            stagedInvoices.push(row);
            return row;
          }),
        },
      };
      const result = await cb(tx);
      counters = staged;
      invoices.push(...stagedInvoices);
      return result;
    }),
  },
}));

const { ensureInvoice, invoiceEligibility, describePurchase } = await import("./issue");

const AFTER = new Date("2026-09-26T10:00:00+05:30");

function addPurchase(id: string, over: Partial<PurchaseRow> = {}) {
  purchases.set(id, {
    id, userId: "u1", amountInPaise: 100000, currency: "INR", credits: 1000, status: "captured", createdAt: AFTER,
    plan: { name: "Pro", kind: "subscription", intervalMonths: 1 },
    ...over,
  });
}

beforeEach(() => {
  purchases = new Map();
  users = new Map([["u1", {
    email: "priya@example.com", name: "Priya", firstName: "Priya", lastName: "Sharma",
    billingName: null, billingAddress: null, billingState: null, billingPincode: null, billingGstin: null,
  }]]);
  invoices = [];
  counters = new Map();
  failNextInsert = null;
});

describe("invoiceEligibility", () => {
  it("holds back USD, pre-go-live and refunded purchases", () => {
    expect(invoiceEligibility({ currency: "INR", status: "captured", createdAt: AFTER })).toBeNull();
    expect(invoiceEligibility({ currency: "usd", status: "captured", createdAt: AFTER })).toBe("not-inr");
    expect(invoiceEligibility({ currency: "INR", status: "captured", createdAt: new Date("2026-09-24T23:59:00+05:30") }))
      .toBe("before-go-live");
    expect(invoiceEligibility({ currency: "INR", status: "refunded", createdAt: AFTER })).toBe("not-captured");
  });
});

describe("ensureInvoice", () => {
  it("numbers invoices sequentially within a financial year", async () => {
    addPurchase("pay_1");
    addPurchase("pay_2");
    addPurchase("pay_3");
    const numbers = [];
    for (const id of ["pay_1", "pay_2", "pay_3"]) numbers.push((await ensureInvoice(id))?.number);
    expect(numbers).toEqual(["CLP/2627/000001", "CLP/2627/000002", "CLP/2627/000003"]);
  });

  it("is idempotent — a second call returns the same invoice without consuming a number", async () => {
    addPurchase("pay_1");
    addPurchase("pay_2");
    const first = await ensureInvoice("pay_1");
    const again = await ensureInvoice("pay_1");
    expect(again?.number).toBe(first?.number);
    expect((await ensureInvoice("pay_2"))?.number).toBe("CLP/2627/000002");
  });

  it("rolls the counter back when the insert fails, leaving no gap", async () => {
    addPurchase("pay_1");
    addPurchase("pay_2");
    failNextInsert = new Error("db blip");
    await expect(ensureInvoice("pay_1")).rejects.toThrow("db blip");
    expect((await ensureInvoice("pay_1"))?.number).toBe("CLP/2627/000001");
    expect((await ensureInvoice("pay_2"))?.number).toBe("CLP/2627/000002");
  });

  it("returns the winner's invoice when it loses a race for the same purchase", async () => {
    addPurchase("pay_1");
    // Simulate the concurrent winner committing between our read and our insert.
    failNextInsert = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "0" });
    invoices.push({ id: "winner", purchaseId: "pay_1", number: "CLP/2627/000001" });
    counters.set("2627", 1);
    const got = await ensureInvoice("pay_1");
    expect(got?.id).toBe("winner");
    expect(counters.get("2627")).toBe(1); // our bump rolled back
  });

  it("issues nothing for USD, pre-go-live or unknown purchases", async () => {
    addPurchase("usd", { currency: "USD" });
    addPurchase("old", { createdAt: new Date("2026-08-01T00:00:00Z") });
    expect(await ensureInvoice("usd")).toBeNull();
    expect(await ensureInvoice("old")).toBeNull();
    expect(await ensureInvoice("nope")).toBeNull();
    expect(counters.size).toBe(0);
  });

  it("bills an address-less customer intra-state (CGST+SGST) under their account name", async () => {
    addPurchase("pay_1");
    const inv = await ensureInvoice("pay_1");
    expect(inv).toMatchObject({
      buyerName: "Priya", buyerEmail: "priya@example.com", placeOfSupply: "09",
      sellerName: "Clipiro Technologies", sellerGstin: "09DAWPB8753E1Z7", sellerState: "09", sac: "998314",
      taxable: 84746, cgst: 7627, sgst: 7627, igst: 0, total: 100000, paymentRef: "pay_1",
      description: "Clipiro Pro — monthly subscription (1,000 credits)",
    });
  });

  it("snapshots saved billing details and charges IGST out of state", async () => {
    users.set("u1", {
      ...users.get("u1")!,
      billingName: "Acme Media Pvt Ltd", billingAddress: "12 Connaught Place, New Delhi",
      billingState: "07", billingPincode: "110001", billingGstin: "27AAPFU0939F1ZV",
    });
    addPurchase("pay_1");
    const inv = await ensureInvoice("pay_1");
    expect(inv).toMatchObject({
      buyerName: "Acme Media Pvt Ltd", buyerState: "07", buyerGstin: "27AAPFU0939F1ZV", placeOfSupply: "07",
      cgst: 0, sgst: 0, igst: 15254,
    });
  });
});

describe("describePurchase", () => {
  it("names the term and credits", () => {
    expect(describePurchase({ name: "Studio", kind: "subscription", intervalMonths: 12 }, 400)).toBe(
      "Clipiro Studio — annual subscription (400 credits)",
    );
    expect(describePurchase({ name: "Starter Pack", kind: "pack", intervalMonths: null }, 100)).toBe(
      "Clipiro Starter Pack — credit pack (100 credits)",
    );
    expect(describePurchase(null, 60)).toBe("Clipiro credit pack (60 credits)");
  });
});
