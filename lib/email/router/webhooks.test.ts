import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── A tiny in-memory prisma: just the calls webhooks.ts makes ──────────────
type Msg = { id: string; status: string; providerMessageId: string | null; acceptedAt: Date | null; provider: string | null; deliveredAt?: Date; failedAt?: Date };
type Ev = { id: string; provider: string; eventKey: string; processedAt: Date | null; matched?: boolean };
const messages = new Map<string, Msg>();
const events: Ev[] = [];
let failNextMessageUpdate = false;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailWebhookEvent: {
      findUnique: vi.fn(async ({ where }: { where: { provider_eventKey: { provider: string; eventKey: string } } }) =>
        events.find((e) => e.provider === where.provider_eventKey.provider && e.eventKey === where.provider_eventKey.eventKey) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Ev, "id" | "processedAt"> }) => {
        const row = { ...data, id: `ev${events.length + 1}`, processedAt: null };
        events.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Ev> }) => Object.assign(events.find((e) => e.id === where.id)!, data)),
    },
    emailMessage: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => messages.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { providerMessageId: string } }) =>
        [...messages.values()].find((m) => m.providerMessageId === where.providerMessageId) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Partial<Msg> }) => {
        if (failNextMessageUpdate) { failNextMessageUpdate = false; throw new Error("db down"); }
        const m = messages.get(where.id);
        if (!m || m.status !== where.status) return { count: 0 };
        Object.assign(m, data);
        return { count: 1 };
      }),
    },
  },
}));
const suppressed: string[] = [];
vi.mock("@/lib/email/suppression", () => ({
  markDelivery: vi.fn(async () => undefined),
  suppress: vi.fn(async (email: string) => { suppressed.push(email); }),
}));
vi.mock("@/lib/env", () => ({ env: { BREVO_WEBHOOK_SECRET: "brevo-secret", MAILJET_WEBHOOK_SECRET: "mj-secret" } }));

const W = await import("./webhooks");
const brevoRoute = await import("@/app/api/webhooks/brevo/route");
const mailjetRoute = await import("@/app/api/webhooks/mailjet/route");

const MSG_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  messages.clear();
  events.length = 0;
  suppressed.length = 0;
  failNextMessageUpdate = false;
  messages.set(MSG_ID, { id: MSG_ID, status: "accepted", providerMessageId: "<brevo-1@relay>", acceptedAt: new Date(), provider: "brevo" });
});

function brevoReq(body: unknown, auth: string | null = "Bearer brevo-secret") {
  return new NextRequest("https://clipiro.com/api/webhooks/brevo", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const brevoEvent = (event: string, ts: number, extra: Record<string, unknown> = {}) =>
  ({ event, email: "person@example.com", "message-id": "<brevo-1@relay>", ts_epoch: ts, tags: ["otp", `msg:${MSG_ID}`], ...extra });

describe("verifySharedSecret", () => {
  it("accepts bearer and basic-auth forms of the secret, and nothing else", () => {
    expect(W.verifySharedSecret("Bearer s3cret", "s3cret")).toBe(true);
    expect(W.verifySharedSecret(`Basic ${Buffer.from("mailjet:s3cret").toString("base64")}`, "s3cret")).toBe(true);
    expect(W.verifySharedSecret("Bearer wrong", "s3cret")).toBe(false);
    expect(W.verifySharedSecret(`Basic ${Buffer.from("s3cret").toString("base64")}`, "s3cret")).toBe(false);
    expect(W.verifySharedSecret(null, "s3cret")).toBe(false);
    expect(W.verifySharedSecret("Bearer anything", undefined)).toBe(false); // fails closed
  });
});

describe("Brevo webhook route", () => {
  it("a valid delivered event marks the message delivered", async () => {
    const res = await brevoRoute.POST(brevoReq(brevoEvent("delivered", 1000)));
    expect(res.status).toBe(200);
    expect(messages.get(MSG_ID)!.status).toBe("delivered");
  });

  it("rejects a bad token with 401 and changes nothing", async () => {
    const res = await brevoRoute.POST(brevoReq(brevoEvent("hard_bounce", 1000), "Bearer nope"));
    expect(res.status).toBe(401);
    expect(messages.get(MSG_ID)!.status).toBe("accepted");
    expect(suppressed).toHaveLength(0);
  });

  it("a duplicate delivery is acknowledged and not applied twice", async () => {
    await brevoRoute.POST(brevoReq(brevoEvent("delivered", 1000)));
    const res = await brevoRoute.POST(brevoReq(brevoEvent("delivered", 1000)));
    expect(await res.json()).toMatchObject({ duplicate: 1, applied: 0 });
  });

  it("out-of-order: a late 'request' or 'deferred' never regresses a delivered message", async () => {
    await brevoRoute.POST(brevoReq(brevoEvent("delivered", 2000)));
    const res = await brevoRoute.POST(brevoReq(brevoEvent("deferred", 1500)));
    expect(await res.json()).toMatchObject({ stale: 1 });
    expect(messages.get(MSG_ID)!.status).toBe("delivered");
  });

  it("a hard bounce marks bounced and suppresses the address", async () => {
    await brevoRoute.POST(brevoReq(brevoEvent("hard_bounce", 1000)));
    expect(messages.get(MSG_ID)!.status).toBe("bounced");
    expect(suppressed).toEqual(["person@example.com"]);
  });

  it("an unknown message id is recorded and acknowledged", async () => {
    const res = await brevoRoute.POST(brevoReq({ event: "delivered", "message-id": "<other@relay>", ts_epoch: 5, email: "x@y.z" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unmatched: 1 });
  });

  it("malformed payloads are a 400", async () => {
    expect((await brevoRoute.POST(brevoReq("{not json"))).status).toBe(400);
    expect((await brevoRoute.POST(brevoReq({ nothing: true }))).status).toBe(400);
  });

  it("a processing failure returns 500, and the provider's retry is then applied", async () => {
    failNextMessageUpdate = true;
    const first = await brevoRoute.POST(brevoReq(brevoEvent("delivered", 3000)));
    expect(first.status).toBe(500);
    expect(messages.get(MSG_ID)!.status).toBe("accepted");
    const retry = await brevoRoute.POST(brevoReq(brevoEvent("delivered", 3000)));
    expect(retry.status).toBe(200);
    expect(messages.get(MSG_ID)!.status).toBe("delivered");
  });

  it("reconciles an 'unknown' send: the provider's own accept event settles it", async () => {
    messages.get(MSG_ID)!.status = "unknown";
    messages.get(MSG_ID)!.providerMessageId = null;
    await brevoRoute.POST(brevoReq(brevoEvent("request", 900)));
    expect(messages.get(MSG_ID)).toMatchObject({ status: "accepted", providerMessageId: "<brevo-1@relay>" });
  });
});

describe("Mailjet webhook route", () => {
  const mjReq = (body: unknown, password = "mj-secret") =>
    new NextRequest("https://clipiro.com/api/webhooks/mailjet", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`mailjet:${password}`).toString("base64")}` },
      body: JSON.stringify(body),
    });

  it("matches by CustomID and handles a batched array", async () => {
    const res = await mailjetRoute.POST(mjReq([
      { event: "sent", time: 100, MessageID: 42, CustomID: MSG_ID, email: "person@example.com" },
      { event: "open", time: 101, MessageID: 42, CustomID: MSG_ID, email: "person@example.com" },
    ]));
    expect(await res.json()).toMatchObject({ applied: 1, ignored: 1 });
    expect(messages.get(MSG_ID)!.status).toBe("delivered");
  });

  it("a soft bounce is 'deferred', not a suppression", async () => {
    await mailjetRoute.POST(mjReq({ event: "bounce", hard_bounce: false, time: 1, MessageID: 42, CustomID: MSG_ID, email: "person@example.com" }));
    expect(messages.get(MSG_ID)!.status).toBe("deferred");
    expect(suppressed).toHaveLength(0);
  });

  it("rejects the wrong password", async () => {
    expect((await mailjetRoute.POST(mjReq({ event: "sent" }, "wrong"))).status).toBe(401);
  });
});

describe("advances", () => {
  it("only moves forward", () => {
    expect(W.advances("accepted", "delivered")).toBe(true);
    expect(W.advances("delivered", "accepted")).toBe(false);
    expect(W.advances("delivered", "bounced")).toBe(true);
    expect(W.advances("bounced", "delivered")).toBe(false);
    expect(W.advances("delivered", "complained")).toBe(true);
    expect(W.advances("unknown", "accepted")).toBe(true);
  });
});
