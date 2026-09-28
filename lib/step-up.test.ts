import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(async (pw: string, hash: string) => hash === `hash:${pw}`) },
}));

let otpOk = false;
const consumeOtp = vi.fn(async () => otpOk);
vi.mock("@/lib/otp", () => ({ consumeOtp }));

const { verifyStepUp } = await import("./step-up");

const withPassword = { email: "a@test.com", passwordHash: "hash:secret123", hasPassword: true };
const googleOnly = { email: "g@test.com", passwordHash: "hash:random-never-shown", hasPassword: false };

beforeEach(() => {
  otpOk = false;
  consumeOtp.mockClear();
});

describe("verifyStepUp", () => {
  it("checks the password for an account that has one", async () => {
    expect(await verifyStepUp(withPassword, { password: "secret123" })).toEqual({ ok: true });
    expect((await verifyStepUp(withPassword, { password: "wrong" })).ok).toBe(false);
    expect((await verifyStepUp(withPassword, {})).ok).toBe(false);
  });

  it("never accepts an emailed code in place of an existing password", async () => {
    otpOk = true;
    expect((await verifyStepUp(withPassword, { otp: "123456" })).ok).toBe(false);
    expect(consumeOtp).not.toHaveBeenCalled();
  });

  it("uses a step-up code for an account with no password its owner knows", async () => {
    otpOk = true;
    expect(await verifyStepUp(googleOnly, { otp: "123456" })).toEqual({ ok: true });
    expect(consumeOtp).toHaveBeenCalledWith("step-up", "g@test.com", "123456");
  });

  it("rejects a bad code and a missing code for a password-less account", async () => {
    expect((await verifyStepUp(googleOnly, { otp: "000000" })).ok).toBe(false);
    expect((await verifyStepUp(googleOnly, { password: "anything" })).ok).toBe(false);
  });

  it("treats a missing flag as having a password (the stricter check)", async () => {
    const { hasPassword: _h, ...legacy } = withPassword;
    void _h;
    expect(await verifyStepUp(legacy, { password: "secret123" })).toEqual({ ok: true });
  });
});
