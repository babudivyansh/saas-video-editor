import { beforeEach, describe, expect, it, vi } from "vitest";

// End to end through sendTemplate → deliver → routeEmail with fake providers
// and an in-memory EmailMessage table: what a signup actually exercises.

type Row = Record<string, unknown> & { id: string; status: string };
const rows = new Map<string, Row>();
const config = new Map<string, string>();
const prismaWrites: unknown[] = [];
const logLines: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailMessage: {
      create: vi.fn(async ({ data }: { data: Row }) => { prismaWrites.push(data); rows.set(data.id, { ...data }); return data; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => { prismaWrites.push(data); Object.assign(rows.get(where.id)!, data); return rows.get(where.id); }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const r = rows.get(where.id);
        if (!r || r.status !== where.status) return { count: 0 };
        for (const [k, v] of Object.entries(data)) {
          r[k] = v && typeof v === "object" && "increment" in v ? Number(r[k] ?? 0) + (v as { increment: number }).increment : v;
        }
        return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
        where.id ? rows.get(where.id) ?? null : [...rows.values()].find((r) => r.idempotencyKey === where.idempotencyKey) ?? null),
      findMany: vi.fn(async () => [...rows.values()].filter((r) => r.status === "deferred" && (r.nextAttemptAt as Date) <= new Date())),
    },
    config: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (config.has(where.key) ? { value: config.get(where.key) } : null)) },
    user: { findUnique: vi.fn(async () => null) },
    emailLog: { create: vi.fn(async ({ data }: { data: unknown }) => { prismaWrites.push(data); }) },
    emailSuppression: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/env", () => ({ env: { EMAIL_ROUTER_ENABLED: "true", EMAIL_FROM: "noreply@clipiro.com", JWT_SECRET: "test-secret-test-secret-test-secret" } }));
vi.mock("@/lib/logger", () => {
  const log = (...a: unknown[]) => { logLines.push(a); };
  return { logger: { info: log, warn: log, error: log, debug: log } };
});
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn(async () => true) }));

// Fake providers, swapped into the deliver module's default deps.
import type { OutboundEmail, SendOutcome } from "./types";
const outcomes: Record<string, SendOutcome[]> = { brevo: [], mailjet: [], resend: [] };
const sent: Record<string, OutboundEmail[]> = { brevo: [], mailjet: [], resend: [] };
const fake = (name: "brevo" | "mailjet" | "resend") => ({
  name,
  isConfigured: () => true,
  async send(e: OutboundEmail): Promise<SendOutcome> {
    sent[name].push(e);
    return outcomes[name].shift() ?? { ok: true, providerMessageId: `${name}-id-${sent[name].length}`, latencyMs: 3 };
  },
  async healthCheck() { return { ok: true }; },
});
vi.mock("./providers/brevo", () => ({ brevoProvider: fake("brevo") }));
vi.mock("./providers/mailjet", () => ({ mailjetProvider: fake("mailjet") }));
vi.mock("./providers/resend", () => ({ resendProvider: fake("resend") }));

const { createMemoryStore } = await import("./memory-store");
const { memoryAlertSink } = await import("./alerts");
let memStore = createMemoryStore();
vi.mock("./store", async (orig) => ({
  ...(await orig<typeof import("./store")>()),
  get prismaRouterStore() { return memStore; },
}));
vi.mock("./alerts", async (orig) => {
  const real = await orig<typeof import("./alerts")>();
  return { ...real, dbAlertSink: real.memoryAlertSink() };
});

const { sendTemplate } = await import("@/lib/email/send");
const { deliver, processDeferred, nextRetryDelayMs } = await import("./deliver");
void memoryAlertSink;

const fail = (errorClass: Extract<SendOutcome, { ok: false }>["errorClass"]): SendOutcome =>
  ({ ok: false, errorClass, code: errorClass, message: errorClass, latencyMs: 2 }) as SendOutcome;

beforeEach(() => {
  rows.clear(); config.clear(); prismaWrites.length = 0; logLines.length = 0;
  for (const k of Object.keys(sent)) { sent[k] = []; outcomes[k] = []; }
  memStore = createMemoryStore();
});

describe("sendTemplate through the router", () => {
  it("a signup code goes out once, through Brevo, with the existing template", async () => {
    const r = await sendTemplate("otp", "new@user.com", { otp: "482913", purpose: "signup" });
    expect(r).toMatchObject({ status: "sent", channel: "brevo" });
    expect(sent.brevo).toHaveLength(1);
    expect(sent.brevo[0].subject).toBe("Your Clipiro verification code");
    expect(sent.brevo[0].text).toContain("482913");
    expect(sent.mailjet.length + sent.resend.length).toBe(0);
  });

  it("falls back to Mailjet during signup when Brevo is out of quota — still exactly one email", async () => {
    outcomes.brevo.push(fail("quota"));
    const r = await sendTemplate("otp", "new@user.com", { otp: "482913", purpose: "signup" });
    expect(r).toMatchObject({ status: "sent", channel: "mailjet" });
    expect(sent.brevo.length + sent.mailjet.length + sent.resend.length).toBe(2); // 1 refused + 1 sent
    expect(sent.mailjet).toHaveLength(1);
  });

  it("an unknown outcome on a code is reported as sent-maybe, and is NOT sent again elsewhere", async () => {
    outcomes.brevo.push(fail("unknown_outcome"));
    const r = await sendTemplate("otp", "new@user.com", { otp: "482913", purpose: "signup" });
    expect(r.status).toBe("unknown");
    expect(sent.mailjet.length + sent.resend.length).toBe(0);
  });

  it("never writes the code to the database or the logs", async () => {
    outcomes.brevo.push(fail("transient"));
    await sendTemplate("otp", "new@user.com", { otp: "482913", purpose: "signup" });
    expect(JSON.stringify(prismaWrites)).not.toContain("482913");
    expect(JSON.stringify(logLines)).not.toContain("482913");
  });

  it("if the router's database is down before sending, it falls back to the legacy path without calling any router provider", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.emailMessage.create).mockRejectedValueOnce(new Error("db down"));
    const r = await sendTemplate("otp", "new@user.com", { otp: "482913", purpose: "signup" });
    // No Resend key / SMTP in this env, so the legacy path ends at the dev console.
    expect(r.status).toBe("dev-logged");
    expect(sent.brevo.length + sent.mailjet.length + sent.resend.length).toBe(0);
  });

  it("a code that no provider can send fails fast — it is never held for a retry", async () => {
    outcomes.brevo.push(fail("transient")); outcomes.mailjet.push(fail("transient")); outcomes.resend.push(fail("transient"));
    const r = await sendTemplate("otp", "new@user.com", { otp: "111222", purpose: "login" });
    expect(r.status).toBe("failed");
    const row = [...rows.values()][0];
    expect(row.status).toBe("failed");
    expect(row.payloadEncrypted ?? null).toBeNull();
  });
});

describe("deliver", () => {
  const base = { templateId: "welcome", priority: "normal" as const, to: "a@b.co", subject: "Hi", html: "<p>x</p>", text: "x", headers: {} };

  it("an idempotency key stops a second send", async () => {
    const a = await deliver({ ...base, templateId: "purchase-confirmation", priority: "high", idempotencyKey: "pay_123" });
    const b = await deliver({ ...base, templateId: "purchase-confirmation", priority: "high", idempotencyKey: "pay_123" });
    expect(a.status).toBe("sent");
    expect(b.status).toBe("duplicate");
    expect(sent.brevo).toHaveLength(1);
  });

  it("non-critical mail with no provider available is deferred with an encrypted payload, then retried", async () => {
    outcomes.brevo.push(fail("transient")); outcomes.mailjet.push(fail("transient")); outcomes.resend.push(fail("transient"));
    const r = await deliver(base);
    expect(r.status).toBe("deferred");
    const row = rows.get(r.emailMessageId)!;
    expect(String(row.payloadEncrypted)).toMatch(/^v1:/);
    expect(String(row.payloadEncrypted)).not.toContain("a@b.co");

    row.nextAttemptAt = new Date(Date.now() - 1);
    // Fresh breaker state for the retry.
    memStore = createMemoryStore();
    const tally = await processDeferred();
    expect(tally).toMatchObject({ processed: 1, sent: 1 });
    expect(rows.get(r.emailMessageId)).toMatchObject({ status: "accepted", payloadEncrypted: null });
    expect(sent.brevo.at(-1)!.messageId).toBe(r.emailMessageId); // same id → same provider idempotency/custom id
  });

  it("a bad address is never deferred", async () => {
    outcomes.brevo.push(fail("recipient"));
    const r = await deliver(base);
    expect(r.status).toBe("failed");
    expect(rows.get(r.emailMessageId)!.payloadEncrypted ?? null).toBeNull();
  });

  it("pausing non-critical email holds a welcome email but not a code", async () => {
    config.set("email_pause_noncritical", "true");
    const w = await deliver(base);
    expect(w.status).toBe("deferred");
    const c = await deliver({ ...base, templateId: "otp", priority: "critical" });
    expect(c.status).toBe("sent");
    expect(sent.brevo).toHaveLength(1);
  });

  it("backoff grows exponentially with jitter and is capped", () => {
    const mid = () => 0.5;
    expect(nextRetryDelayMs(0, mid)).toBe(5 * 60_000);
    expect(nextRetryDelayMs(1, mid)).toBe(10 * 60_000);
    expect(nextRetryDelayMs(10, mid)).toBe(4 * 60 * 60_000);
    expect(nextRetryDelayMs(0, () => 0)).toBe(4 * 60_000);
    expect(nextRetryDelayMs(0, () => 1)).toBe(6 * 60_000);
  });
});
