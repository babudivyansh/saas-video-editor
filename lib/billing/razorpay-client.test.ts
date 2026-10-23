import { describe, expect, it } from "vitest";
import { AxiosError, type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { createRazorpay, RAZORPAY_TIMEOUT_MS } from "./razorpay-client";
import { describeRazorpayError } from "./razorpay-errors";

// Runs the real SDK with its HTTP layer swapped out: the other billing tests
// mock "razorpay" wholesale, so they never exercise this.
function clientWith(adapter: AxiosAdapter) {
  const client = createRazorpay();
  const rq = (client as unknown as { api: { rq: AxiosInstance } }).api.rq;
  rq.defaults.adapter = adapter;
  return { client, rq };
}

const failWith = (code: string): AxiosAdapter => (config) =>
  Promise.reject(new AxiosError(`fake ${code}`, code, config as InternalAxiosRequestConfig));

describe("createRazorpay", () => {
  it("sets a request timeout on the SDK's HTTP client", () => {
    const { rq } = clientWith(failWith("ECONNABORTED"));
    expect(rq.defaults.timeout).toBe(RAZORPAY_TIMEOUT_MS);
  });

  it("turns a timeout into a 504 in the SDK's usual error shape", async () => {
    const { client } = clientWith(failWith("ECONNABORTED"));
    const err = await client.orders.fetch("order_x").catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 504, error: { code: "GATEWAY_TIMEOUT" } });
    expect(describeRazorpayError(err)).toMatch(/did not respond within 20s/);
  });

  it("turns a network failure into a 502 instead of a TypeError", async () => {
    const { client } = clientWith(failWith("ECONNRESET"));
    const err = await client.orders.fetch("order_x").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err).toMatchObject({ statusCode: 502, error: { code: "GATEWAY_ERROR" } });
  });

  it("passes real API errors through unchanged", async () => {
    const { client } = clientWith((config) =>
      Promise.reject(
        new AxiosError("bad", "ERR_BAD_REQUEST", config as InternalAxiosRequestConfig, null, {
          status: 400,
          statusText: "Bad Request",
          headers: {},
          config: config as InternalAxiosRequestConfig,
          data: { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist", field: "plan_id" } },
        }),
      ),
    );
    const err = await client.orders.fetch("order_x").catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 400, error: { code: "BAD_REQUEST_ERROR", field: "plan_id" } });
  });
});
