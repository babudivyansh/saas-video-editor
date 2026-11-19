import { describe, expect, it, vi } from "vitest";

// The router never touches env directly except through config's
// fallbackEnabled default, which every test overrides via deps.
vi.mock("@/lib/env", () => ({ env: {} }));

const { routeEmail } = await import("./router");
const { createMemoryStore } = await import("./memory-store");
const { memoryAlertSink } = await import("./alerts");
const { dayPeriod } = await import("./periods");
import type { EmailProvider, OutboundEmail, ProviderName, SendOutcome } from "./types";

const NOW = new Date("2026-11-19T10:00:00Z");

function fakeProvider(name: ProviderName, outcomes: SendOutcome[] | ((e: OutboundEmail) => SendOutcome), configured = true) {
  const sent: OutboundEmail[] = [];
  const p: EmailProvider & { sent: OutboundEmail[] } = {
    name,
    sent,
    isConfigured: () => configured,
    async send(e) {
      sent.push(e);
      if (typeof outcomes === "function") return outcomes(e);
      return outcomes.length > 1 ? outcomes.shift()! : outcomes[0];
    },
    async healthCheck() { return { ok: true }; },
  };
  return p;
}

const OK: SendOutcome = { ok: true, providerMessageId: "pm_1", latencyMs: 5 };
const fail = (errorClass: Extract<SendOutcome, { ok: false }>["errorClass"], extra: Partial<SendOutcome> = {}): SendOutcome =>
  ({ ok: false, errorClass, code: errorClass, message: errorClass, latencyMs: 5, ...extra }) as SendOutcome;

let n = 0;
function email(templateId = "otp"): OutboundEmail {
  n += 1;
  return { messageId: `msg_${n}`, to: "user@example.com", subject: "s", html: "<p>h</p>", text: "t", headers: {}, templateId };
}

function setup(o: Partial<Record<ProviderName, SendOutcome[] | ((e: OutboundEmail) => SendOutcome)>>, opts: {
  configured?: Partial<Record<ProviderName, boolean>>;
  states?: Parameters<typeof createMemoryStore>[0];
  fallbackEnabled?: boolean;
} = {}) {
  const providers = {
    brevo: fakeProvider("brevo", o.brevo ?? [OK], opts.configured?.brevo ?? true),
    mailjet: fakeProvider("mailjet", o.mailjet ?? [OK], opts.configured?.mailjet ?? true),
    resend: fakeProvider("resend", o.resend ?? [OK], opts.configured?.resend ?? true),
  };
  const store = createMemoryStore(opts.states);
  const alerts = memoryAlertSink();
  const deps = { store, alerts, providers, now: () => NOW, fallbackEnabled: opts.fallbackEnabled ?? true };
  return { providers, store, alerts, deps };
}

describe("routeEmail", () => {
  it("1. sends through Brevo when it succeeds, touching no other provider", async () => {
    const { providers, deps, store } = setup({});
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "accepted", provider: "brevo", attempts: 1, fallbackUsed: false });
    expect(providers.mailjet.sent).toHaveLength(0);
    expect(providers.resend.sent).toHaveLength(0);
    expect(store.quotaRow("brevo", dayPeriod(NOW))).toMatchObject({ reserved: 1, accepted: 1 });
    expect(store.states.get("brevo")!.healthStatus).toBe("healthy");
  });

  it("2. Brevo quota exhausted → Mailjet sends, Brevo marked exhausted for the day", async () => {
    const { providers, deps, store, alerts } = setup({ brevo: [fail("quota", { quotaPeriod: "day" })] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "accepted", provider: "mailjet", attempts: 2, fallbackUsed: true });
    expect(store.quotaRow("brevo", dayPeriod(NOW))).toMatchObject({ reserved: 0, exhausted: true });
    expect(store.states.get("brevo")!.healthStatus).toBe("quota_exhausted");
    expect(alerts.raised.map((a) => a.kind)).toEqual(expect.arrayContaining(["quota_exhausted", "fallback_active"]));

    // The next email skips Brevo without calling it.
    await routeEmail(email(), "critical", deps);
    expect(providers.brevo.sent).toHaveLength(1);
    expect(providers.mailjet.sent).toHaveLength(2);
  });

  it("3. Brevo and Mailjet unavailable → Resend sends", async () => {
    const { deps } = setup({ brevo: [fail("transient")], mailjet: [fail("transient")] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "accepted", provider: "resend", attempts: 3, fallbackUsed: true });
  });

  it("4. every provider unavailable → failed, quota released, critical alert raised", async () => {
    const { deps, store, alerts } = setup({ brevo: [fail("transient")], mailjet: [fail("transient")], resend: [fail("transient")] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.status).toBe("failed");
    expect(r.attempts).toBe(3);
    for (const p of ["brevo", "mailjet", "resend"] as const) {
      expect(store.quotaRow(p, dayPeriod(NOW)).reserved).toBe(0);
    }
    expect(alerts.raised.at(-1)).toMatchObject({ kind: "all_providers_unavailable", severity: "critical" });
  });

  it("5. Resend over its configured daily limit is skipped without being called", async () => {
    const { providers, deps } = setup(
      { brevo: [fail("transient")], mailjet: [fail("transient")] },
      { states: { resend: { dailyLimit: 0 } } },
    );
    const r = await routeEmail(email(), "critical", deps);
    expect(r.status).toBe("failed");
    expect(providers.resend.sent).toHaveLength(0);
    expect(r.skipped).toContainEqual({ provider: "resend", reason: "quota_unavailable" });
  });

  it("5b. Resend's own quota error marks it exhausted for the month when it says monthly", async () => {
    const { deps, store } = setup(
      { resend: [fail("quota", { quotaPeriod: "month" })] },
      { states: { brevo: { enabled: false }, mailjet: { enabled: false } } },
    );
    const r = await routeEmail(email(), "critical", deps);
    expect(r.status).toBe("failed");
    expect([...store.quota.entries()].find(([k]) => k.startsWith("resend:month"))![1].exhausted).toBe(true);
  });

  it("6. a disabled provider is never called", async () => {
    const { providers, deps } = setup({}, { states: { brevo: { enabled: false } } });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.provider).toBe("mailjet");
    expect(providers.brevo.sent).toHaveLength(0);
    expect(r.fallbackUsed).toBe(false); // disabled is configuration, not a fallback
  });

  it("7. a provider with missing credentials is skipped", async () => {
    const { providers, deps } = setup({}, { configured: { brevo: false, mailjet: false } });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.provider).toBe("resend");
    expect(providers.brevo.sent).toHaveLength(0);
    expect(r.skipped.map((s) => s.reason)).toEqual(["not_configured", "not_configured"]);
  });

  it("8. rate-limited provider → next provider, and a cooldown honoring Retry-After", async () => {
    const { deps, store } = setup({ brevo: [fail("rate_limit", { retryAfterSec: 30 })] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.provider).toBe("mailjet");
    expect(store.states.get("brevo")!.circuitBreakerUntil).toEqual(new Date(NOW.getTime() + 30_000));
    expect(store.states.get("brevo")!.healthStatus).toBe("rate_limited");
  });

  it("9. timeout with an unknown outcome stops: no second provider gets the email", async () => {
    const { providers, deps, store } = setup({ brevo: [fail("unknown_outcome")] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "unknown", provider: "brevo" });
    expect(providers.mailjet.sent).toHaveLength(0);
    expect(providers.resend.sent).toHaveLength(0);
    // The provider may have counted it, so the slot stays taken.
    expect(store.quotaRow("brevo", dayPeriod(NOW)).reserved).toBe(1);
  });

  it("9b. Resend's unknown outcome is retried once on Resend itself, with the same idempotency id", async () => {
    const { providers, deps } = setup(
      { resend: [fail("unknown_outcome"), OK] },
      { states: { brevo: { enabled: false }, mailjet: { enabled: false } } },
    );
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "accepted", provider: "resend", attempts: 2 });
    expect(providers.resend.sent.map((e) => e.messageId)).toEqual([providers.resend.sent[0].messageId, providers.resend.sent[0].messageId]);
  });

  it("10. concurrent sends never exceed a provider's limit — the overflow falls back", async () => {
    const { deps, store, providers } = setup({}, { states: { brevo: { dailyLimit: 5 } } });
    const results = await Promise.all(Array.from({ length: 20 }, () => routeEmail(email(), "critical", deps)));
    expect(results.every((r) => r.status === "accepted")).toBe(true);
    expect(providers.brevo.sent).toHaveLength(5);
    expect(store.quotaRow("brevo", dayPeriod(NOW)).reserved).toBe(5);
    expect(providers.mailjet.sent).toHaveLength(15);
    // One email, one provider: no message id reached two providers.
    const ids = [...providers.brevo.sent, ...providers.mailjet.sent].map((e) => e.messageId);
    expect(new Set(ids).size).toBe(20);
  });

  it("keeps the last daily slots for critical mail", async () => {
    // Limit 20 → 2 kept back (10%). Normal mail stops at 18.
    const { deps, providers } = setup({}, {
      states: { brevo: { dailyLimit: 20 }, mailjet: { enabled: false }, resend: { enabled: false } },
    });
    const normal = await Promise.all(Array.from({ length: 20 }, () => routeEmail(email("welcome"), "normal", deps)));
    expect(normal.filter((r) => r.status === "accepted")).toHaveLength(18);
    const otp = await routeEmail(email("otp"), "critical", deps);
    expect(otp.status).toBe("accepted");
    expect(providers.brevo.sent).toHaveLength(19);
  });

  it("a bad recipient address stops the route: other providers would refuse it too", async () => {
    const { providers, deps, store } = setup({ brevo: [fail("recipient")] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r).toMatchObject({ status: "failed", permanent: true });
    expect(providers.mailjet.sent).toHaveLength(0);
    expect(store.states.get("brevo")!.consecutiveFailures).toBe(0);
  });

  it("opens the circuit after 3 consecutive failures, then skips without calling", async () => {
    const { providers, deps, store, alerts } = setup({ brevo: [fail("transient")] });
    for (let i = 0; i < 3; i++) await routeEmail(email(), "critical", deps);
    expect(store.states.get("brevo")!.healthStatus).toBe("unavailable");
    expect(alerts.raised.some((a) => a.kind === "provider_unavailable")).toBe(true);
    await routeEmail(email(), "critical", deps);
    expect(providers.brevo.sent).toHaveLength(3);
  });

  it("allows a trial send once the circuit's cooldown has passed, and recovers on success", async () => {
    const { providers, deps, store } = setup({}, {
      states: { brevo: { healthStatus: "unavailable", consecutiveFailures: 3, circuitBreakerUntil: new Date(NOW.getTime() - 1) } },
    });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.provider).toBe("brevo");
    expect(providers.brevo.sent).toHaveLength(1);
    expect(store.states.get("brevo")).toMatchObject({ healthStatus: "healthy", consecutiveFailures: 0, circuitBreakerUntil: null });
  });

  it("a suspended provider stays out until an admin clears it, and alerts critically", async () => {
    const { providers, deps, store, alerts } = setup({ brevo: [fail("suspended")] });
    await routeEmail(email(), "critical", deps);
    expect(store.states.get("brevo")!.healthStatus).toBe("suspended");
    expect(alerts.raised.find((a) => a.kind === "provider_suspended")?.severity).toBe("critical");
    // Even long after any cooldown, it is not tried again.
    await routeEmail(email(), "critical", { ...deps, now: () => new Date(NOW.getTime() + 7 * 86_400_000) });
    expect(providers.brevo.sent).toHaveLength(1);
  });

  it("an auth error marks the provider misconfigured and falls back", async () => {
    const { deps, store } = setup({ brevo: [fail("auth")] });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.provider).toBe("mailjet");
    expect(store.states.get("brevo")!.healthStatus).toBe("misconfigured");
    expect(store.states.get("brevo")!.circuitBreakerUntil!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("with fallback disabled, only one provider is tried", async () => {
    const { providers, deps } = setup({ brevo: [fail("transient")] }, { fallbackEnabled: false });
    const r = await routeEmail(email(), "critical", deps);
    expect(r.status).toBe("failed");
    expect(providers.mailjet.sent).toHaveLength(0);
  });

  it("records every provider call as an attempt with its error class", async () => {
    const { deps, store } = setup({ brevo: [fail("quota")], mailjet: [fail("transient")] });
    const e = email();
    await routeEmail(e, "critical", deps);
    expect(store.attempts.map((a) => [a.provider, a.status, a.errorClass ?? null])).toEqual([
      ["brevo", "rejected", "quota"],
      ["mailjet", "failed", "transient"],
      ["resend", "accepted", null],
    ]);
    expect(store.attempts.every((a) => a.emailMessageId === e.messageId)).toBe(true);
  });
});
